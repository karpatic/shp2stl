# Author: Codex app agent, 2026-09-11. Independent pyshp parser, actual converter ZIP.
import sys,zipfile,io,json
from pathlib import Path
sys.path.insert(0,str(Path('.tmp/shape-python').resolve()))
import shapefile
p=Path(sys.argv[1]);z=zipfile.ZipFile(p/'drawing.zip')
r=shapefile.Reader(shp=io.BytesIO(z.read('drawing.shp')),shx=io.BytesIO(z.read('drawing.shx')),dbf=io.BytesIO(z.read('drawing.dbf')))
assert r.shapeType==5 and len(r)==1
s=r.shape(0);assert len(s.parts)==2 and r.record(0)[0]==1
assert abs(max(s.bbox[2]-s.bbox[0],s.bbox[3]-s.bbox[1])-40)<1e-7
assert 'LOCAL_CS' in z.read('drawing.prj').decode() and json.loads(z.read('drawing.shp2stl.json'))['coordinates']=='local-mm'
(p/'shape-evidence.json').write_text(json.dumps({'author':'Codex app agent','date':'2026-09-11','parser':'pyshp 2.3.1','records':len(r),'parts':len(s.parts),'bounds':list(s.bbox),'type':r.shapeType},indent=2)+'\n')
print('PASS: independent polygon SHP/SHX/DBF parse, ID, hole, 40 mm bounds, explicit local units')
