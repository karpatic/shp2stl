"""Author: Codex app agent — 2026-09-11. Summarize the existing harness artifacts."""
import collections
import json
import pathlib
from compare import digest, geometry_triangles, mesh_stats, stl_triangles

results = pathlib.Path('diagnostics/results')
report = {}
for dataset, reference in [('dc', 'baseline-dc-3'), ('baltimore', 'reference-baltimore-cpu')]:
    old = results / reference
    new = results / ('planar-final-' + dataset)
    prototype = results / ('planar-prototype-' + dataset)
    summary = json.loads((new / 'summary.json').read_text())
    scene = (new / 'scene.stl').read_bytes()
    geometry = json.loads((new / 'result-geometry.json').read_text())
    assert summary['status'] == 'complete'
    assert (old / 'preprocess.json').read_bytes() == (new / 'preprocess.json').read_bytes()
    assert scene == (prototype / 'scene.stl').read_bytes()
    prototype_geometry = json.loads((prototype / 'result-geometry.json').read_text())
    assert mesh_stats(geometry_triangles(geometry))['orientedSurfaceSHA256'] == mesh_stats(geometry_triangles(prototype_geometry))['orientedSurfaceSHA256']
    stats = mesh_stats(stl_triangles(scene))
    assert stats['zeroAreaTriangles'] == 0 and list(stats['exactEdgeIncidence']) == [2]
    graph = collections.defaultdict(set)
    for a, b, c in stl_triangles(scene):
        for u, v in [(a,b), (b,c), (c,a)]:
            graph[u].add(v)
            graph[v].add(u)
    components = 0
    while graph:
        components += 1
        queue = [next(iter(graph))]
        while queue:
            queue.extend(graph.pop(queue.pop(), ()))
    comparisons = {name: json.loads((prototype / name).read_text()) for name in ['surface.json', 'scene-surface.json']}
    for check in comparisons.values():
        assert check['oracle']['mismatchesOutsideTolerance'][1] == 0
        assert check['coverage']['gridMismatches'] == 0
    stages = [e for e in summary['events'] if e['kind'] == 'stage']
    report[dataset] = {
        'reference': str(old), 'freshRun': str(new),
        'preprocessingExact': True, 'browserExportMatchesPrototype': True,
        'frozenReferenceSHA256': {f: digest((old / f).read_bytes()) for f in ['preprocess.json', 'result-geometry.json', 'scene.stl']},
        'sceneSHA256': digest(scene), 'scene': stats, 'base': mesh_stats(geometry_triangles(geometry)),
        'referenceScene': mesh_stats(stl_triangles((old / 'scene.stl').read_bytes())), 'connectedComponents': components,
        'validation': json.loads((new / 'planar-validation.json').read_text()),
        'endToEndMs': next(e['ms'] for e in summary['events'] if e['kind'] == 'complete'),
        'planarMs': sum(e['ms'] for e in stages if e['name'] in ['heightRegions', 'layerGeometry']),
        'allMeshStagesMs': sum(e['ms'] for e in stages if e['name'] in ['heightRegions', 'layerGeometry', 'createThreeDGeometry', 'createThreeDGeometryLines']),
        'computeCpuSeconds': summary['computeCpuSeconds'], 'peakRSSMiB': summary['peakRSSKiB']/1024,
        'heapAtCompletionMiB': next(e['heap']/1024**2 for e in summary['events'] if e['kind'] == 'complete'),
        'geometryComparisons': comparisons,
    }
path = results / 'planar-evidence.json'
path.write_text(json.dumps(report, indent=2) + '\n')
print('PASS:', path)
