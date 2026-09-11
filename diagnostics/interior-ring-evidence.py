"""Author: Codex app agent — 2026-09-11. Bounded retained-run comparison."""
import collections, json, pathlib, re
from compare import mesh_stats, stl_triangles, digest
from PIL import Image, ImageDraw
root=pathlib.Path('diagnostics/results'); out=root/'interior-ring-fix'; report={}
for dataset in ['dc','baltimore']:
    before=root/f'hull-after-{dataset}'; after=root/f'interior-ring-final-{dataset}'
    a,b=[json.loads((p/'preprocess.json').read_text()) for p in [before,after]]
    same={k:a[k]==b[k] for k in a}
    assert all(same[k] for k in ['geojson','lines','interiorLines'])
    assert a['hull']['features'][0]['geometry']['coordinates'][0][0]==b['hull']['features'][0]['geometry']['coordinates'][0][0]
    base_equal=(before/'result-geometry.json').read_bytes()==(after/'result-geometry.json').read_bytes()
    assert base_equal
    stls=[(p/'scene.stl').read_bytes() for p in [before,after]]
    stats=[mesh_stats(stl_triangles(s)) for s in stls]
    assert stats[1]['zeroAreaTriangles']==0 and list(stats[1]['exactEdgeIncidence'])==[2]
    directed=collections.Counter(); graph=collections.defaultdict(set)
    for tri in stl_triangles(stls[1]):
        for u,v in zip(tri,tri[1:]+tri[:1]):
            directed[u,v]+=1;graph[u].add(v);graph[v].add(u)
    assert all(n==directed[v,u] for (u,v),n in directed.items())
    components=0; component_bounds=[]
    while graph:
        components+=1; queue=[next(iter(graph))]
        vertices=set()
        while queue:
            v=queue.pop()
            if v in vertices:continue
            vertices.add(v);queue.extend(graph.pop(v,()))
        component_bounds.append([[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]])
    paths=[json.loads((p/'map-paths.json').read_text()) for p in [before,after]]
    assert [p for p in paths[0] if p['stroke']=='#004433']==[p for p in paths[1] if p['stroke']=='#004433']
    if dataset=='dc':assert stls[0]==stls[1]
    report[dataset]={'preprocessingEqual':same,'baseGeometryBytesExact':base_equal,'sharedSvgPathsExact':True,
        'stlBytesExact':stls[0]==stls[1],'exportBeforeAfter':stats,'orientedClosedComponents':components,'componentBounds':component_bounds,
        'boundaryPathsBeforeAfter':[[len(f['geometry']['coordinates']) for f in d['hullLines']['features']] for d in [a,b]],
        'validation':json.loads((after/'planar-validation.json').read_text()),
        'completeMs':next(e['ms'] for e in json.loads((after/'summary.json').read_text())['events'] if e['kind']=='complete')}
    assert json.loads((after/'summary.json').read_text())['status']=='complete'
    if dataset=='baltimore':
        raw=json.loads((root/'central-gap/hull-stages.json').read_text())['truncated']['centralHoles'][0]['coords']
        indices=[i for i,f in enumerate(b['hullLines']['features']) if f['geometry']['coordinates']==raw]
        assert len(indices)==1
        red=[p for p in paths[1] if p['stroke']=='#ff0000']; central=red[indices[0]]['d']
        pixels=list(zip(*[iter(map(float,re.findall(r'-?\d+(?:\.\d+)?',central)))]*2))
        assert pixels[0]==pixels[-1]
        evidence=json.loads((root/'central-gap/evidence.json').read_text())
        junctions=[]
        for j in evidence['junctions']:
            pixel=tuple(round(v) for v in j['svgPixel']); assert pixel in pixels
            green=[p for p in paths[1] if p['stroke']=='#004433'][j['incidentSharedLines'][0]['lineIndex']]['d']
            xy=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',green)))
            assert pixel in [tuple(xy[:2]),tuple(xy[-2:])]
            junctions.append({'label':j['label'],'pixel':pixel,'sharedSvg':green})
        report[dataset].update({'centralRawRingExact':True,'centralSvg':central,'junctions':junctions,
            'retainedInteriorPaths':sum(f['properties']['boundaryRole']=='interior' for f in b['hullLines']['features']),
            'meshProbe':json.loads((after/'mesh-evidence.json').read_text())})
        # Paint evidence uses actual browser pixels, enlarged without smoothing.
        canvas=Image.new('RGB',(1400,600),'white'); draw=ImageDraw.Draw(canvas)
        for i,p in enumerate([before,after]):
            crop=Image.open(p/'map.png').crop((360,380,460,460)).resize((600,480),Image.Resampling.NEAREST)
            canvas.paste(crop,(i*700+40,55));draw.text((i*700+40,20),'Before: filtered interior perimeter' if i==0 else 'After: preserved closed perimeter',fill='black')
        draw.text((40,560),'Actual painted Leaflet crops. A/B/C shared walls meet the restored red rim. Author: Codex app agent · 2026-09-11',fill='black')
        canvas.save(out/'central-before-after.png')
(out/'evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: unchanged source/shared boundaries/base preview; DC exact STL; oriented closed exports; central raw ring and three actual SVG junctions')
print(json.dumps({k:{'triangles':[s['triangles'] for s in v['exportBeforeAfter']], 'components':v['orientedClosedComponents'],'volume':[s['signedVolume'] for s in v['exportBeforeAfter']]} for k,v in report.items()},indent=2))
