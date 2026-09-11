# Author: Codex app agent, 2026-09-11. Official schema, independent XMLSchema engine.
# Development only: python3 -m pip install --target .tmp/3mf-python xmlschema==4.1.0
import hashlib, json, re, sys, time, urllib.request, zipfile
from pathlib import Path
sys.path.insert(0,str(Path('.tmp/3mf-python').resolve()))
import xmlschema
cache=Path('diagnostics/.cache/3mf');cache.mkdir(parents=True,exist_ok=True)
sources={
 'spec.md':('https://raw.githubusercontent.com/3MFConsortium/spec_core/997b385e06f3181cf9aae0c578e0b45ccd48ccb2/3MF%20Core%20Specification.md','4db7a7a13e7f757c6afc1a9ad731b56d8d068b1a766025692ff757d0f7f16940'),
 'xml.xsd':('https://www.w3.org/2001/xml.xsd','61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c'),
}
for name,(url,digest) in sources.items():
 p=cache/name
 if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=20).read())
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,'Upstream schema changed'
schemaText=re.search(r'```xml\n(<\?xml[^`]+?<xs:schema.*?</xs:schema>)',(cache/'spec.md').read_text(),re.S)[1]
(cache/'core.xsd').write_text(schemaText)
# libxml2 rejects the specification's 2147483647 maxOccurs at schema compile
# time. XMLSchema handles it without modifying or weakening the official XSD.
schema=xmlschema.XMLSchema(str(cache/'core.xsd'),locations={'http://www.w3.org/XML/1998/namespace':str((cache/'xml.xsd').resolve())})
start=time.monotonic();results=[]
paths=[Path(p) for p in sys.argv[1:]] if len(sys.argv)>1 else [p for city in ['dc','baltimore'] for p in sorted(Path('diagnostics/results/dimensions-'+city).glob('*/scene.3mf'))]
for p in paths:
 with zipfile.ZipFile(p) as z:schema.validate(z.read('3D/3dmodel.model'))
 results.append(dict(file=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),valid=True))
assert len(results)==len(paths) and results
report=dict(author='Codex app agent',date='2026-09-11',engine=xmlschema.__version__,sources=sources,schemaSHA256=hashlib.sha256(schemaText.encode()).hexdigest(),seconds=time.monotonic()-start,packages=results)
Path('diagnostics/results/'+('custom-schema.json' if len(sys.argv)>1 else 'dimensions/schema.json')).write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS: {len(results)} downloaded packages against unmodified official Core 1.4 appendix XSD ({report["seconds"]:.3f} s)')
