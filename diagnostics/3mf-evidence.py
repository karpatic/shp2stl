# Author: Codex app agent, 2026-09-11. Independent audit of actual UI downloads.
import collections, hashlib, json, math, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
sys.path.insert(0,str(Path('.tmp/central-gap-python').resolve()))
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union, polygonize
from compare import mesh_stats, stl_triangles
from importlib import import_module

D=Path('diagnostics/results')
CORE='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
ns={'m':CORE}
identity=[1,0,0,0,1,0,0,0,1,0,0,0]
polys=lambda ps:unary_union([Polygon(p[0],p[1:]) for p in ps])

def solid(ts):
    stats=mesh_stats(iter(ts))
    assert stats['signedVolume']>0 and stats['zeroAreaTriangles']==0
    assert list(stats['exactEdgeIncidence'])==[2]
    directed=collections.Counter();fans=collections.defaultdict(lambda:collections.defaultdict(set))
    for tri in ts:
        for j,a in enumerate(tri):
            b,c=tri[(j+1)%3],tri[(j+2)%3]
            directed[a,b]+=1;fans[a][b].add(c);fans[a][c].add(b)
    assert all(n==directed[b,a] for (a,b),n in directed.items())
    for fan in fans.values():
        assert all(len(n)==2 for n in fan.values())
        seen=set();todo=[next(iter(fan))]
        while todo:
            v=todo.pop()
            if v not in seen:seen.add(v);todo.extend(fan[v]-seen)
        assert len(seen)==len(fan)
    return stats

def package(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert set(z.namelist())=={'[Content_Types].xml','_rels/.rels','3D/3dmodel.model'}
        types=ET.fromstring(z.read('[Content_Types].xml'))
        assert types.tag=='{http://schemas.openxmlformats.org/package/2006/content-types}Types'
        assert {e.attrib['Extension']:e.attrib['ContentType'] for e in types}=={
            'rels':'application/vnd.openxmlformats-package.relationships+xml',
            'model':'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'}
        rel=ET.fromstring(z.read('_rels/.rels'))
        assert rel.tag=='{http://schemas.openxmlformats.org/package/2006/relationships}Relationships'
        assert len(rel)==1 and rel[0].attrib=={'Id':'rel0','Type':'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel','Target':'/3D/3dmodel.model'}
        model=ET.fromstring(z.read('3D/3dmodel.model'))
    assert model.tag=='{'+CORE+'}model' and model.attrib['unit']=='millimeter'
    objects=model.findall('m:resources/m:object',ns)
    assert [o.attrib['id'] for o in objects]==['1','2','3']
    assert [o.attrib['name'] for o in objects]==['Base','Walls','Geographic model']
    assert all(o.attrib['type']=='model' for o in objects)
    build=model.findall('m:build/m:item',ns);assert len(build)==1 and build[0].attrib['objectid']=='3'
    components=objects[2].findall('m:components/m:component',ns)
    assert [c.attrib['objectid'] for c in components]==['1','2']
    for ref in components+build:assert list(map(float,ref.attrib['transform'].split()))==identity
    meshes={}
    for obj in objects[:2]:
        vertices=[tuple(float(v.attrib[k]) for k in ['x','y','z']) for v in obj.findall('m:mesh/m:vertices/m:vertex',ns)]
        ids=[tuple(int(t.attrib[k]) for k in ['v1','v2','v3']) for t in obj.findall('m:mesh/m:triangles/m:triangle',ns)]
        assert len(ids)>=4 and len(vertices)<2**31 and len(ids)<2**31
        assert all(len(set(t))==3 and min(t)>=0 and max(t)<len(vertices) for t in ids)
        # Index-level manifoldness is mandatory in Core, as well as coordinate-level.
        edges=collections.Counter(tuple(sorted((t[j],t[(j+1)%3]))) for t in ids for j in range(3))
        assert set(edges.values())=={2}
        meshes[obj.attrib['name']]=[tuple(vertices[i] for i in t) for t in ids]
    return meshes

def cap(ts,z,up):
    t=np.asarray(ts);cross=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])[:,2]
    return unary_union([Polygon(tri[:,:2]) for tri in t[np.all(t[:,:,2]==z,axis=1)&((cross>0) if up else (cross<0))]])

def section(ts,z):
    # Intersect the actual mesh. Polygonize all closed cells, then use oriented
    # segment winding to retain solid cells and exclude holes (no source oracle).
    segments=[]
    for tri in ts:
        hits=[]
        for j in range(3):
            a,b=sorted([tri[j],tri[(j+1)%3]],key=lambda p:p[2])
            if a[2]<z<b[2]:
                f=(z-a[2])/(b[2]-a[2]);hits.append(tuple(a[k]+f*(b[k]-a[k]) for k in range(2)))
        if len(hits)==2:
            n=np.cross(np.subtract(tri[1],tri[0]),np.subtract(tri[2],tri[0]));t=[-n[1],n[0]]
            if np.dot(np.subtract(hits[1],hits[0]),t)<0:hits.reverse()
            segments.append(hits)
    if not segments:return Polygon()
    arr=np.array(segments);a,b=arr[:,0],arr[:,1];cells=[]
    for cell in polygonize([LineString(s) for s in segments]):
        p=cell.representative_point();x,y=p.x,p.y
        side=(b[:,0]-a[:,0])*(y-a[:,1])-(x-a[:,0])*(b[:,1]-a[:,1])
        winding=np.sum((a[:,1]<=y)&(b[:,1]>y)&(side>0))-np.sum((a[:,1]>y)&(b[:,1]<=y)&(side<0))
        if winding>0:cells.append(cell)
    return unary_union(cells)

report={}
for city in sys.argv[1:] or ['dc','baltimore']:
    root=D/f'dimensions-{city}';summary=json.load(open(root/'summary.json'));assert summary['status']=='complete'
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in summary['sources'].items()),'Stale source hashes'
    cases={}
    for name in ['connections','disconnected','hull','base-2.5','wall-3.5','minimum-1.6','changed-disconnected','changed-hull','saved-hull']:
        run=root/name;data=json.load(open(run/'regions.json'));r=data['regions'];levels=data['dimensions']['levels'];minimum=data['dimensions']['minConnectorWidth']
        stl=list(stl_triangles((run/'scene.stl').read_bytes()));meshes=package(run/'scene.3mf')
        stats={n:solid(ts) for n,ts in {'STL':stl,**meshes}.items()}
        base,walls=meshes['Base'],meshes['Walls'];floor=cap(base,levels[2],True)
        assert stats['Base']['bounds'][0][2]==0 and stats['Base']['bounds'][1][2]==levels[2]
        assert stats['Walls']['bounds'][0][2]==levels[2] and stats['Walls']['bounds'][1][2]==levels[3]
        assert abs(stats['STL']['signedVolume']-stats['Base']['signedVolume']-stats['Walls']['signedVolume'])<.01
        surface=lambda ts:collections.Counter(tuple(sorted(map(tuple,t))) for t in ts)
        assert surface(stl)==surface(np.array(json.load(open(run/'preview-position.json'))).reshape(-1,3,3))
        budget=sum(polys(layer).length for layer in r['layers'])*2e-5
        assert floor.symmetric_difference(polys(r['layers'][1])).area<budget
        assert cap(walls,levels[2],False).symmetric_difference(cap(walls,levels[3],True)).area<budget,'Missing interface cap'
        assert cap(walls,levels[2],False).difference(floor).area<budget,'Unsupported raised lines'
        sections=[]
        for i,layer in enumerate(r['layers']):
            z=(levels[i]+levels[i+1])/2
            a=section(stl,z);b=section(base if i<2 else walls,z);expected=polys(layer)
            differences=[a.symmetric_difference(b).area,a.symmetric_difference(expected).area,b.symmetric_difference(expected).area]
            assert max(differences)<budget,(city,name,i,differences,budget)
            sections.append(differences)
        assert cap(base,0,False).symmetric_difference(polys(r['layers'][0])).area<budget
        assert cap(base,levels[1],False).symmetric_difference(polys(r['layers'][1]).difference(polys(r['layers'][0]))).area<budget
        original=json.load(open(D/f'community-local-{city}'/'regions.json'))['regions']
        assert polys(r['layers'][2]).symmetric_difference(polys(original['layers'][2])).area<1e-8
        assert cap(walls,levels[3],True).symmetric_difference(polys(original['layers'][2])).area<budget
        joins=[]
        for link in r['connections']['links']:
            q=link['quad'];neck=LineString(q[:2]).distance(LineString([q[3],q[2]]));assert neck>=minimum
            footprint=polys(link['footprint']);assert footprint.difference(floor).area<budget
            assert not unary_union([footprint]+[polys([r['land'][i]]) for i in [link['i'],link['j']]]).interiors
            contacts=[]
            for i,e in zip([link['i'],link['j']],link['engagement']):
                patch=polys([e['patch']]);backing=polys([e['backing']]);land=polys([r['land'][i]])
                assert patch.difference(land.intersection(footprint)).area<patch.length*2e-6
                assert backing.difference(land).area<backing.length*2e-6
                assert patch.difference(floor).area<patch.length*2e-5
                ring=e['patch'][0];v=np.subtract(ring[1],ring[0]);n=e['inward']
                width=abs(v[0]*n[1]-v[1]*n[0]);depth=LineString(ring[:2]).distance(LineString([ring[3],ring[2]]))
                assert width>=e['requiredWidth']>=minimum and depth>=e['requiredPenetration']>0
                contacts.append(dict(width=width,depth=depth))
            joins.append(dict(neck=neck,contacts=contacts))
        exactDefault=None
        if name in ['connections','disconnected','hull']:
            prior=D/f'island-pads-{city}'/name/'scene.stl'
            exactDefault=prior.read_bytes()==(run/'scene.stl').read_bytes();assert exactDefault,'Default STL changed'
            accepted=import_module('community-enclosure-check').check(run);assert not accepted['failures']
        cases[name]=dict(levels=levels,minConnectorWidth=minimum,stats=stats,sectionDifferenceAreas=sections,joins=joins,defaultSTLByteIdentical=exactDefault)
        print(city,name,'PASS',flush=True)
    report[city]=dict(cases=cases,wallMs=summary['wallMs'],events=[e for e in summary['events'] if e['kind'] in ['complete','dimensions-rebuild','format-download','infeasible-minimum','invalid-dimension','saved-dimensions','ui-check']])
out=D/'dimensions';out.mkdir(exist_ok=True)
(out/('evidence-'+ '-'.join(report)+'.json')).write_text(json.dumps(dict(author='Codex app agent',date='2026-09-11',datasets=report),indent=2)+'\n')
