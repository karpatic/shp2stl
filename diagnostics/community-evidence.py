# Author: Codex app agent, 2026-09-11. Bounded actual-export and layer comparison.
import collections,json,math,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path('.tmp/central-gap-python').resolve()))
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union,transform
from compare import mesh_stats,stl_triangles
D=Path('diagnostics/results'); out=D/'community-topology';report={}
parts=lambda g:list(g.geoms) if hasattr(g,'geoms') else [g]
def mapping(r):
 c,b=r['center'],r['bounds'];s=max(b['maxX']-b['minX'],b['maxY']-b['minY'])/200;co=math.cos(math.radians(c['lat']));cx=(b['minX']+b['maxX'])/2;cy=(b['minY']+b['maxY'])/2
 return (lambda x,y:(((x-c['lng'])*co-cx)/s,(y-c['lat']-cy)/s)),(lambda x,y:((x*s+cx)/co+c['lng'],y*s+cy+c['lat'])),s*111195
for city in ['baltimore','dc']:
 before=D/f'interior-ring-final-{city}';after=D/f'community-local-{city}'
 r=json.load(open(after/'regions.json'));forward,inverse,meters=mapping(r)
 triangles=list(stl_triangles((after/'scene.stl').read_bytes()));stats=mesh_stats(iter(triangles));assert stats['zeroAreaTriangles']==0 and list(stats['exactEdgeIncidence'])==[2]
 graph=collections.defaultdict(set);directed=collections.Counter()
 for tri in triangles:
  for a,b in zip(tri,tri[1:]+tri[:1]):graph[a].add(b);graph[b].add(a);directed[a,b]+=1
 assert all(n==directed[b,a] for (a,b),n in directed.items())
 bounds=[]
 while graph:
  todo=[next(iter(graph))];vertices=set()
  while todo:
   p=todo.pop()
   if p in vertices:continue
   vertices.add(p);todo.extend(graph.pop(p,()))
  bounds.append([[min(p[k] for p in vertices) for k in range(3)],[max(p[k] for p in vertices) for k in range(3)]])
 assert all(b[0][2]==0 for b in bounds),'Unsupported added shell'
 t=np.array(triangles);a=t[:,0];v=t[:,1]-a;w=t[:,2]-a;det=v[:,0]*w[:,1]-v[:,1]*w[:,0];valid=abs(det)>1e-12
 def hits(x,y):
  u=np.zeros(len(t));z=np.zeros(len(t));u[valid]=((x-a[valid,0])*w[valid,1]-(y-a[valid,1])*w[valid,0])/det[valid];z[valid]=(v[valid,0]*(y-a[valid,1])-v[valid,1]*(x-a[valid,0]))/det[valid]
  hit=valid&(u>=-1e-8)&(z>=-1e-8)&(u+z<=1+1e-8)
  return sorted(set(np.round((a[:,2]+u*v[:,2]+z*w[:,2])[hit],5)))
 probes=[]
 def probe(lon,lat,label,wall=None):
  x,y=forward(lon,lat);zs=hits(x,y)
  if wall is not None:assert (12 in zs)==wall,(label,zs)
  probes.append(dict(label=label,coordinate=[lon,lat],heights=zs))
 if city=='baltimore':
  for i,p in enumerate([(-76.59812435,39.31200034),(-76.59974487,39.31192238),(-76.5876812,39.29602104),(-76.58772795,39.29678385)]):probe(*p,f'seam {i+1}',True)
  ring=json.load(open(D/'central-gap/hull-stages.json'))['truncated']['centralHoles'][0]['coords']
  for i,(a1,b1) in enumerate(zip(ring,ring[1:])):
   for q in [.25,.5,.75]:probe(a1[0]*(1-q)+b1[0]*q,a1[1]*(1-q)+b1[1]*q,f'raw central rim {i+1}, {q}',True)
  for j in json.load(open(D/'central-gap/evidence.json'))['junctions']:probe(*j['coordinate'],'junction '+j['label'],True)
  probe(-76.60897522,39.29955008,'explicit source void floor',False);assert probes[-1]['heights']==[0.,6.]
 polys=lambda ps:unary_union([Polygon(p[0],p[1:]) for p in ps])
 H,C=polys(r['regions']['H']),polys(r['regions']['C'])
 groove=max(parts(C.intersection(H)),key=lambda p:p.area).representative_point();zs=hits(groove.x,groove.y)
 assert zs[0]==1.8 and zs[-1]>=6,('groove/floor control',city,zs)
 probes.append(dict(label='underside groove with floor above',coordinate=list(inverse(groove.x,groove.y)),heights=zs))
 oldr=json.load(open(before/'regions.json'));_,oldinv,_=mapping(oldr)
 diffs=[]
 for i,l in enumerate(r['regions']['layers']):
  old=transform(lambda x,y:forward(*oldinv(x,y)),polys(oldr['regions']['layers'][i]));new=polys(l)
  diffs.append(dict(height=['0–1.8','1.8–6','6–12'][i],addedModelArea=new.difference(old).area,removedModelArea=old.difference(new).area))
 summary=json.load(open(after/'summary.json'));assert summary['status']=='complete'
 report[city]=dict(before=mesh_stats(stl_triangles((before/'scene.stl').read_bytes())),after=stats,componentBounds=bounds,probes=probes,layerDifferencesInAfterModelUnits=diffs,metersPerModelUnit=meters,completeMs=next(e['ms'] for e in summary['events'] if e['kind']=='complete'),uiCheck=next(e for e in summary['events'] if e['kind']=='ui-check'))
(out/'evidence.json').write_text(json.dumps(dict(author='Codex app agent',date='2026-09-11',datasets=report),indent=2)+'\n')
print(json.dumps({k:{'triangles':v['after']['triangles'],'components':len(v['componentBounds']),'completeMs':v['completeMs'],'layers':v['layerDifferencesInAfterModelUnits']} for k,v in report.items()},indent=2))
