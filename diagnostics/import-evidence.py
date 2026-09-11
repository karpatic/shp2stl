# Author: Codex app agent, 2026-09-11.
import sys,json,importlib
from pathlib import Path
m=importlib.import_module('3mf-evidence');root=Path(sys.argv[1]);report={}
for name in ['handoff','zip-roundtrip']:
 p=root/name;data=json.load(open(p/'regions.json'));r=data['regions'];b=data['dimensions']['baseHeight'];w=data['dimensions']['wallHeight'];H=m.polys(r['layers'][1]);W=m.polys(r['layers'][2]);budget=(H.length+W.length)*2e-5
 stl=list(m.stl_triangles((p/'scene.stl').read_bytes()));parts=m.package(p/'scene.3mf');stats={n:m.solid(ts) for n,ts in {'STL':stl,**parts}.items()}
 assert set(parts)=={'Base','Walls'} and abs(max(stats['Base']['bounds'][1][i]-stats['Base']['bounds'][0][i] for i in [0,1])-40)<1e-5
 assert sum(len(p.interiors) for p in (H.geoms if hasattr(H,'geoms') else [H]))==1
 assert W.symmetric_difference(H.difference(H.buffer(-.5,join_style=2))).area<budget
 assert abs(stats['STL']['signedVolume']-stats['Base']['signedVolume']-stats['Walls']['signedVolume'])<.01
 assert abs(stats['STL']['area']-(stats['Base']['area']+stats['Walls']['area']-2*W.area))<budget*5
 for z,region,part in [(b/2,H,'Base'),(b+w/2,W,'Walls')]:
  assert m.section(stl,z).symmetric_difference(region).area<budget
  assert m.section(parts[part],z).symmetric_difference(region).area<budget
 assert m.cap(parts['Base'],b,True).symmetric_difference(H).area<budget
 assert m.cap(stl,b,True).symmetric_difference(H.difference(W)).area<budget
 report[name]={'stats':stats,'baseHoles':1,'width':.5,'units':'mm'}
 print(name,'PASS',flush=True)
assert (root/'handoff/scene.stl').read_bytes()==(root/'zip-roundtrip/scene.stl').read_bytes()
(root/'geometry-evidence.json').write_text(json.dumps({'author':'Codex app agent','date':'2026-09-11','cases':report},indent=2)+'\n')
