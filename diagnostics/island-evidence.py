# Author: Codex app agent, 2026-09-11. Audit the actual UI downloads, not a substitute mesh.
import collections, hashlib, json, math, sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.tmp/central-gap-python').resolve()))
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from compare import mesh_stats,stl_triangles
from importlib import import_module
acceptance=import_module('community-enclosure-check')
D=Path('diagnostics/results');out=D/'island-pads';out.mkdir(exist_ok=True)
polys=lambda ps:unary_union([Polygon(p[0],p[1:]) for p in ps])
report={}
for city in ['baltimore','dc']:
 root=D/f'island-pads-{city}';summary=json.load(open(root/'summary.json'))
 assert summary['status']=='complete'
 assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in summary['sources'].items()),'Export source hashes are stale'
 assert len([e for e in summary['events'] if e['kind']=='island-mode-check'])==4
 baseline=json.load(open(D/f'community-local-{city}'/'regions.json'))['regions']
 modes={}
 for mode in ['connections','disconnected','hull']:
  run=root/mode;data=json.load(open(run/'regions.json'));r=data['regions']
  triangles=list(stl_triangles((run/'scene.stl').read_bytes()));stats=mesh_stats(iter(triangles))
  assert stats['signedVolume']>0
  assert stats['zeroAreaTriangles']==0 and list(stats['exactEdgeIncidence'])==[2]
  directed=collections.Counter();graph=collections.defaultdict(set);fans=collections.defaultdict(lambda:collections.defaultdict(set))
  for tri in triangles:
   for j,a in enumerate(tri):
    b,c=tri[(j+1)%3],tri[(j+2)%3]
    directed[a,b]+=1;graph[a].add(b);graph[b].add(a)
    fans[a][b].add(c);fans[a][c].add(b)
  for fan in fans.values():
   assert all(len(neighbors)==2 for neighbors in fan.values()),'Nonmanifold STL vertex'
   seen=set();todo=[next(iter(fan))]
   while todo:
    v=todo.pop()
    if v in seen:continue
    seen.add(v);todo.extend(fan[v]-seen)
   assert len(seen)==len(fan),'STL shells touch only at a vertex'
  del fans
  assert all(n==directed[b,a] for (a,b),n in directed.items())
  components=[]
  while graph:
   todo=[next(iter(graph))];vertices=set()
   while todo:
    p=todo.pop()
    if p in vertices:continue
    vertices.add(p);todo.extend(graph.pop(p,()))
   components.append([[min(p[k] for p in vertices) for k in range(3)],[max(p[k] for p in vertices) for k in range(3)]])
  assert len(components)==(len(r['land']) if mode=='disconnected' else 1),(city,mode,components)
  assert all(b[0][2]==0 for b in components)
  t=np.array(triangles);preview=np.array(json.load(open(run/'preview-position.json'))).reshape(-1,3,3)
  # Export and displayed triangle streams can differ in order, but not surface.
  surface=lambda ts:collections.Counter(tuple(sorted(map(tuple,tri))) for tri in ts)
  assert surface(t)==surface(preview),'Preview differs from actual download'
  cross=np.cross(t[:,1,:2]-t[:,0,:2],t[:,2,:2]-t[:,0,:2])
  cap=lambda z,up:unary_union([Polygon(tri[:,:2]) for tri in t[np.all(t[:,:,2]==z,axis=1)&((cross>0) if up else (cross<0))]])
  walls=cap(12,True);floor=unary_union([cap(6,True),walls]);underside=cap(0,False)
  land=polys(r['land']);supports=polys(r['H']).difference(land)
  budget=(land.length+supports.length)*2e-5
  assert land.difference(floor).area<budget,'Full island floor missing in actual STL'
  assert supports.difference(underside).area<budget,'Connection not bed-grounded'
  assert supports.difference(cap(6,True)).area<budget,'Connection top not at base height'
  assert walls.symmetric_difference(polys(baseline['layers'][2])).area<budget,'Raised community walls changed'
  assert polys(r['layers'][2]).symmetric_difference(polys(baseline['layers'][2])).area<1e-8
  # Underside can have the established grooves; no other missing floor is allowed.
  expected=polys(r['layers'][0]);assert underside.symmetric_difference(expected).area<budget
  if city=='baltimore':
   c,b=data['center'],data['bounds'];scale=max(b['maxX']-b['minX'],b['maxY']-b['minY'])/200
   void=Point(((-76.60897522-c['lng'])*math.cos(math.radians(c['lat']))-(b['maxX']+b['minX'])/2)/scale,(39.29955008-c['lat']-(b['maxY']+b['minY'])/2)/scale)
   assert underside.covers(void) and cap(6,True).covers(void) and not walls.covers(void),'Central void floor behavior changed'
  joins=[]
  for link in r['connections']['links']:
   footprint=polys(link['footprint']);areas=[footprint.intersection(polys([r['land'][i]])).area for i in [link['i'],link['j']]]
   assert min(areas)>0
   contacts=[]
   q=link['quad']
   neck=LineString(q[:2]).distance(LineString([q[3],q[2]]))
   assert neck>=link['requiredNeckWidth']
   for i,e in zip([link['i'],link['j']],link['engagement']):
    base=polys([r['land'][i]]);patch=polys([e['patch']]);backing=polys([e['backing']])
    tolerance=patch.length*2e-6
    assert patch.geom_type=='Polygon' and not patch.interiors
    assert patch.difference(base.intersection(footprint)).area<tolerance,'Contact patch is not fully engaged'
    assert backing.difference(base).area<backing.length*2e-6,'Contact has no continuous local backing'
    assert patch.difference(floor).area<patch.length*2e-5,'Actual STL loses the contact patch'
    ring=e['patch'][0];inward=e['inward'];v=np.array(ring[1])-ring[0]
    measuredWidth=abs(v[0]*inward[1]-v[1]*inward[0])
    penetration=LineString(ring[:2]).distance(LineString([ring[3],ring[2]]))
    assert measuredWidth>=e['requiredWidth'] and penetration>=e['requiredPenetration']
    assert abs(measuredWidth-e['width'])<1e-6 and abs(penetration-e['penetration'])<1e-6
    contacts.append(dict(width=measuredWidth,penetration=penetration,requiredWidth=e['requiredWidth'],requiredPenetration=e['requiredPenetration'],widthMargin=measuredWidth-e['requiredWidth'],penetrationMargin=penetration-e['requiredPenetration']))
   if link['kind']=='shore-pad':
    q=Polygon(link['quad']);assert q.is_valid and abs(q.convex_hull.area-q.area)<1e-8
   joined=unary_union([footprint]+[polys([r['land'][i]]) for i in [link['i'],link['j']]])
   assert joined.geom_type=='Polygon' and not joined.interiors,'Pad trapped a shoreline pinhole'
   joins.append(dict(kind=link['kind'],width=link['width'],gap=link['distance'],neckWidth=neck,contacts=contacts,attachmentArea=areas,attachmentVolume=[a*4.2+footprint.intersection(polys([r['land'][i]])).intersection(polys(r['layers'][0])).area*1.8 for a,i in zip(areas,[link['i'],link['j']])],reason=link.get('reason'),filledCornerPockets=link.get('filledCornerPockets',0)))
  accepted=acceptance.check(run);assert not accepted['failures']
  (out/f'{city}-{mode}-acceptance.json').write_text(json.dumps(accepted,indent=2)+'\n')
  modes[mode]=dict(triangles=stats['triangles'],signedVolume=stats['signedVolume'],closedOrientedEdges=True,manifoldVertexFans=True,occupancyTolerance=budget,componentBounds=components,landComponents=len(r['land']),missingFloorArea=land.difference(floor).area,wallDifferenceArea=walls.symmetric_difference(polys(baseline['layers'][2])).area,supportArea=supports.area,joins=joins,previewMatchesDownload=True)
 report[city]=dict(modes=modes,ui=[e for e in summary['events'] if e['kind'] in ['island-mode-check','ui-check','complete']])
(out/'evidence.json').write_text(json.dumps(dict(author='Codex app agent',date='2026-09-11',datasets=report),indent=2)+'\n')
print(json.dumps(report,indent=2))

# Compact plan views expose the actual continuous patches; screenshots below
# remain views of the downloaded STL. No raster geometry or source edits.
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def draw(ax, land, links, title, focus=False):
 for p in land:
  for j,ring in enumerate(p):
   xy=np.array(ring);ax.fill(xy[:,0],xy[:,1],color='#b9d7d3' if j==0 else 'white',ec='#527b78',lw=.7)
 for link in links:
  for p in link['footprint']:
   xy=np.array(p[0]);ax.fill(xy[:,0],xy[:,1],color='#f1ba72',alpha=.7,ec='#a57029',lw=1)
  for e in link.get('engagement',[]):
   if e['accepted']:
    xy=np.array(e['patch'][0]);ax.fill(xy[:,0],xy[:,1],color='#076d4f',zorder=5)
 if focus:
  points=np.array([v for l in links for p in l['footprint'] for v in p[0]])
  ax.set_xlim(points[:,0].min()-2,points[:,0].max()+2);ax.set_ylim(points[:,1].min()-2,points[:,1].max()+2)
 ax.set_aspect('equal');ax.set_title(title,fontsize=10);ax.grid(alpha=.15);ax.tick_params(labelsize=8)

s=json.load(open(out/'synthetic.json'));fig,axs=plt.subplots(2,2,figsize=(12,8))
draw(axs[0,0],[s['cShore'],s['other']],[dict(footprint=[s['falsePad']])],'REJECTED: 8-unit end, two 1-unit tip patches')
draw(axs[0,1],[s['cShore'],s['other']],s['alternate']['links'],'ACCEPTED: shorter local end; inlet stays open')
draw(axs[1,0],s['facing'],[s['pad']],'ACCEPTED: regular broad quadrilateral')
draw(axs[1,1],s['small'],s['fallback']['links'],'ACCEPTED: compact fallback, same contact rule',True)
fig.suptitle('Actual polygon intersections | base: teal · pad: amber · verified continuous patch: dark green\nAuthor: Codex app agent · 2026-09-11',fontsize=11);fig.tight_layout();fig.savefig(out/'contact-regressions.png',dpi=150);plt.close(fig)
r=json.load(open(D/'island-pads-baltimore/connections/regions.json'))['regions'];fig,axs=plt.subplots(1,3,figsize=(13,5))
for k,(ax,l) in enumerate(zip(axs,r['connections']['links'])):
 widths=' / '.join(f"{e['width']:.3f}" for e in l['engagement']);depths=' / '.join(f"{e['penetration']:.3f}" for e in l['engagement'])
 draw(ax,[r['land'][l['i']],r['land'][l['j']]],[l],f"Pad {k+1}: {l['width']:.1f} wide\nContinuous contact: {widths}\nPenetration: {depths}",True)
fig.suptitle('Baltimore: selected pads and independently checked engagement patches\nAuthor: Codex app agent · 2026-09-11 · model units',fontsize=11);fig.tight_layout();fig.savefig(out/'baltimore-contacts.png',dpi=160);plt.close(fig)
