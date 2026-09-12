# Author: Codex app agent, 2026-09-12. Reuses the existing independent download audit.
import sys,json,importlib,struct
from pathlib import Path
m=importlib.import_module('3mf-evidence')
root=Path(sys.argv[1]);report={}
f32=lambda v:struct.unpack('f',struct.pack('f',v))[0]
for case in ['default-labels','different-labels','wall-0.4','wall-1.6','wall-3.5','base-2.5']:
 p=root/case;data=json.load(open(p/'state.json'));r=data['regions'];d=data['dims'];b=f32(d['baseHeight']);w=f32(d['baseHeight']+d['wallHeight']);labels=[m.polys(s) for s in r['labelShapes']];tops=[f32(d['baseHeight']+e['height']) for e in data['edits'] if e['kind']=='label'];W=m.polys(r['layers'][2]);T=m.polys(r['labels']);B=m.polys(r['layers'][1]);budget=sum(m.polys(s).length for s in r['layers'])*2e-5
 stl=list(m.stl_triangles((p/'scene.stl').read_bytes()));parts=m.package(p/'scene.3mf');stats={k:m.solid(ts) for k,ts in {'STL':stl,**parts}.items()}
 assert abs(stats['STL']['signedVolume']-sum(v['signedVolume'] for k,v in stats.items() if k!='STL'))<.01
 assert abs(stats['STL']['area']-(sum(v['area'] for k,v in stats.items() if k!='STL')-2*(W.area+T.area)))<budget*5,'Duplicate interface caps or overlapping volume'
 assert stats['Labels']['bounds'][0][2]==b and stats['Labels']['bounds'][1][2]==max(tops)
 assert stats['STL']['bounds'][1][2]==max(w,*tops)
 assert m.cap(stl,b,True).symmetric_difference(B.difference(W.union(T))).area<budget
 assert m.cap(stl,b,False).area==0
 assert m.cap(parts['Labels'],b,False).symmetric_difference(T).area<budget
 for top in set(tops+[w]):
  expected=m.unary_union([s for s,z in zip(labels,tops) if z==top]+([W] if w==top else []))
  assert m.cap(stl,top,True).symmetric_difference(expected).area<budget
  assert m.cap(stl,top,False).area==0
 levels=sorted(set([0,d['levels'][1],b,w,*tops]));diffs=[]
 for lo,hi in zip(levels,levels[1:]):
  z=(lo+hi)/2;expected=m.polys(r['layers'][0] if z<d['levels'][1] else r['layers'][1]) if z<b else m.unary_union([s for s,top in zip(labels,tops) if z<top]+([W] if z<w else []))
  actual=m.section(stl,z);assembly=m.unary_union([m.section(ts,z) for ts in parts.values()]);diff=max(actual.symmetric_difference(expected).area,actual.symmetric_difference(assembly).area);assert diff<budget,(case,z,diff,budget);diffs.append(diff)
 report[case]={'stats':stats,'maxSectionDifference':max(diffs),'budget':budget};print(case,'PASS',flush=True)
(root/'text-height-geometry.json').write_text(json.dumps({'author':'Codex app agent','date':'2026-09-12','cases':report},indent=2)+'\n')
