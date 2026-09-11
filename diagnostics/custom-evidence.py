# Author: Codex app agent, 2026-09-11. Actual downloads; explicit edit footprints.
import sys,json,importlib,collections
from pathlib import Path
m=importlib.import_module('3mf-evidence')
root=Path(sys.argv[1]);report={}
for case in ['size40','hole','removed','decorated','height']:
 p=root/case;data=json.load(open(p/'regions.json'));r=data['regions'];original=data['original'];dims=data['dimensions'];b=dims['baseHeight'];w=dims['wallHeight'];z=dims['levels'];T=m.polys(r.get('labels',[]));H=m.polys(r.get('holes',[]));W=m.polys(r['layers'][2]);base=m.polys(r['layers'][1]);budget=sum(m.polys(layer).length for layer in r['layers'])*2e-5
 stl=list(m.stl_triangles((p/'scene.stl').read_bytes()));parts=m.package(p/'scene.3mf');stats={name:m.solid(ts) for name,ts in {'STL':stl,**parts}.items()}
 assert max(stats['Base']['bounds'][1][i]-stats['Base']['bounds'][0][i] for i in [0,1])<=40.0001
 assert abs(stats['STL']['signedVolume']-sum(v['signedVolume'] for k,v in stats.items() if k!='STL'))<.01
 assert abs(stats['STL']['area']-(sum(v['area'] for k,v in stats.items() if k!='STL')-2*(W.area+T.area)))<budget*5,'Internal interface shell or overlap'
 # Original floor ownership changes ONLY at explicitly stored hole regions.
 for i in [0,1]:assert m.polys(r['layers'][i]).symmetric_difference(m.polys(original['layers'][i]).difference(H)).area<budget
 assert W.symmetric_difference(m.polys(original['layers'][2]).difference(H)).area<budget
 assert m.cap(parts['Base'],b,True).symmetric_difference(base).area<budget
 assert m.cap(parts['Walls'],b,False).symmetric_difference(W).area<budget
 assert m.cap(stl,b,True).symmetric_difference(base.difference(W.union(T))).area<budget
 assert m.cap(stl,b,False).area<budget,'Internal downward interface cap'
 differences=[]
 for height in [.1,(z[1]+b)/2,b+.4,b+min(w,.8)/2,b+(w+.8)/2]:
  expected=m.polys(r['layers'][0] if height<z[1] else r['layers'][1]) if height<b else (W if height<b+w else m.Polygon()).union(T if height<b+.8 else m.Polygon())
  actual=m.section(stl,height);assembly=m.unary_union([m.section(ts,height) for ts in parts.values()]);diff=max(actual.symmetric_difference(expected).area,actual.symmetric_difference(assembly).area);assert diff<budget,(case,height,diff,budget);differences.append(diff)
  if not H.is_empty:assert actual.intersection(H.buffer(-.001)).area<1e-7,'Hole is not open'
 if not T.is_empty:
  assert 'Labels' in parts
  assert stats['Labels']['bounds'][0][2]==b and abs(stats['Labels']['bounds'][1][2]-(b+.8))<1e-6
  assert m.cap(parts['Labels'],b,False).symmetric_difference(T).area<budget
  assert T.difference(base).area<budget and T.intersection(W).area<budget
  assert sum(len(p.interiors) for p in (T.geoms if hasattr(T,'geoms') else [T]))==4,'BOA counters missing'
 report[case]={'stats':stats,'maxSectionDifference':max(differences),'budget':budget,'holeArea':H.area,'labelArea':T.area}
 print(case,'PASS',flush=True)
assert (root/'size40/scene.stl').read_bytes()==(root/'removed/scene.stl').read_bytes()
(root/'geometry-evidence.json').write_text(json.dumps({'author':'Codex app agent','date':'2026-09-11','cases':report},indent=2)+'\n')
