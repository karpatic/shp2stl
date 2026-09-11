# Author: Codex app agent, 2026-09-11.
# Bounded acceptance oracle against ORIGINAL ownership; no repair or assignment.
import sys, json, math, struct
import numpy as np
from pathlib import Path
sys.path.insert(0, str(Path('.tmp/central-gap-python').resolve()))
from shapely.geometry import shape, Polygon, Point
from shapely.ops import unary_union, transform

def parts(g):
    return list(g.geoms) if hasattr(g, 'geoms') else [g]

def check(run):
    r=json.load(open(Path(run)/'regions.json'))
    city=r.get('dataset','baltimore')
    raw=json.load(open(f'diagnostics/fixtures/{city}.geojson'))
    c,b=r['center'],r['bounds']; scale=max(b['maxX']-b['minX'],b['maxY']-b['minY'])/200
    co=math.cos(math.radians(c['lat'])); cx=(b['minX']+b['maxX'])/2; cy=(b['minY']+b['maxY'])/2
    project=lambda g:transform(lambda x,y:(((x-c['lng'])*co-cx)/scale,(y-c['lat']-cy)/scale),g)
    original=[project(shape(f['geometry'])) for f in raw['features']]
    names=[f['properties'].get('CSA2010',str(i)) for i,f in enumerate(raw['features'])]
    source=unary_union(original); rawholes=unary_union([Polygon(h) for p in parts(source) for h in p.interiors])
    walls=unary_union([Polygon(p[0],p[1:]) for p in r['regions']['layers'][2]])
    floor=unary_union([Polygon(p[0],p[1:]) for p in r['regions']['layers'][1]])
    mesh=Path(run)/'scene.stl'
    geometrySource='planar footprints'
    if mesh.exists():
        data=mesh.read_bytes(); count=struct.unpack_from('<I',data,80)[0]
        dt=np.dtype([('normal','<f4',(3,)),('v','<f4',(3,3)),('attr','<u2')])
        triangles=np.frombuffer(data,dtype=dt,offset=84,count=count)['v'].astype(float)
        a=triangles[:,1,:2]-triangles[:,0,:2]; b2=triangles[:,2,:2]-triangles[:,0,:2]
        up=a[:,0]*b2[:,1]-a[:,1]*b2[:,0]>0
        cap=lambda z:unary_union([Polygon(t[:,:2]) for t in triangles[up & np.all(triangles[:,:,2]==z,axis=1)]])
        walls=cap(12); exposedFloor=cap(6)
        floor=unary_union([exposedFloor,walls])
        geometrySource='actual downloaded STL roof/floor caps'
    # The connected components of floor minus raised walls are the actual compartments.
    free=parts(floor.difference(walls)); free=[f for f in free if not f.is_empty]
    failures=[]; seams=[]; pockets=[]
    if city=='baltimore':
        groups=[['Greenmount East','Clifton-Berea','Midway/Coldstream'],['Oldtown/Middle East','Patterson Park North & East','Madison/East End']]
        for group in groups:
            ids=[]
            for name in group:
                p=original[names.index(name)].representative_point()
                ids.append(next((i for i,f in enumerate(free) if f.contains(p)),None))
            ok=None not in ids and len(set(ids))==len(ids)
            seams.append(dict(communities=group,compartments=ids,passCheck=ok))
            if not ok: failures.append('Open compartments: '+', '.join(group))
        for lon,lat in [(-76.59812435,39.31200034),(-76.59974487,39.31192238),(-76.58768120,39.29602104),(-76.58772795,39.29678385)]:
            covered=walls.covers(project(Point(lon,lat)))
            if not covered: failures.append(f'No raised wall at {lon}, {lat}')
        # These known empty pockets must not acquire artificial closed perimeters.
        enclosed=[Polygon(h) for p in parts(walls) for h in p.interiors]
        for lon,lat in [(-76.588317933211,39.21328936317),(-76.5665,39.2405),(-76.58331793343,39.24928936308)]:
            p=project(Point(lon,lat)); face=next((f for f in enclosed if f.contains(p)),None)
            # A large community compartment here is fine; a mostly unowned pocket is not.
            owned=0 if face is None else face.intersection(source).area/face.area
            ok=face is None or owned>.95
            pockets.append(dict(point=[lon,lat],ownedFraction=owned,enclosed=face is not None,passCheck=ok))
            if not ok: failures.append(f'Processing-created pocket at {lon}, {lat}')
    # Significant exclusive source interiors cannot communicate through any free component.
    conflicts=[[] for g in original]; overlaps=[]
    for i,g in enumerate(original):
        for j in range(i+1,len(original)):
            if not g.intersects(original[j]): continue
            overlap=g.intersection(original[j])
            if overlap.area:
                conflicts[i].append(overlap); conflicts[j].append(overlap); overlaps.append(overlap)
    exclusive=[g.difference(unary_union(conflicts[i])) if conflicts[i] else g for i,g in enumerate(original)]
    ambiguous=unary_union(overlaps).difference(walls)
    ambiguousArea=ambiguous.area*(scale*111195)**2
    mixed=[]; unowned=[]
    enclosed=[Polygon(h) for p in parts(walls) for h in p.interiors]
    ambiguousInCompartments=ambiguous.intersection(unary_union(enclosed)).area*(scale*111195)**2
    if ambiguousInCompartments>0: failures.append(f'{ambiguousInCompartments:.6f} m² of ambiguous source overlap remains in closed compartments')
    # Check every closed wall compartment, including supported island outlines.
    # Permit only the area band implied by the EXISTING STL Float32 conformity
    # bound (2e-5 model units), not a percentage or ownership-repair tolerance.
    for i,f in enumerate(enclosed):
        budget=f.length*2e-5+math.pi*(2e-5)**2
        owners=[names[j] for j,g in enumerate(exclusive) if g.intersection(f).area>budget]
        if len(owners)>1: mixed.append(dict(compartment=i,owners=owners))
        if f.difference(source).difference(rawholes).area>budget: unowned.append(i)
    anchors=[next((i for i,f in enumerate(enclosed) if f.contains(g.representative_point())),None) for g in original]
    if None in anchors or len(set(anchors))!=len(anchors): failures.append('Original community interior anchors are not all separately enclosed')
    if mixed: failures.append(f'{len(mixed)} compartments contain exclusive land from multiple owners beyond STL precision')
    if unowned: failures.append(f'{len(unowned)} compartments contain unassigned land outside raw holes beyond STL precision')
    result=dict(author='Codex app agent',date='2026-09-11',dataset=city,geometrySource=geometrySource,uncoveredSourceOverlapM2=ambiguousArea,overlapInCompartmentsM2=ambiguousInCompartments,communityAnchors=anchors,seams=seams,pockets=pockets,mixed=mixed,unowned=unowned,freeCompartments=len(free),failures=failures)
    print(json.dumps(result,indent=2)); return result
if __name__=='__main__':
    result=check(sys.argv[1]); sys.exit(bool(result['failures']))
