"""Author: Codex app agent — 2026-09-11. Audit the four focused browser runs."""
import collections
import json
import pathlib
import re
from compare import digest, mesh_stats, stl_triangles

results = pathlib.Path('diagnostics/results')
report = {}
for dataset in ['dc', 'baltimore']:
    runs = [results / f'hull-{version}-{dataset}' for version in ['before', 'after']]
    before, after = runs
    preprocessing = [json.loads((p / 'preprocess.json').read_text()) for p in runs]
    same = {k: preprocessing[0][k] == preprocessing[1][k] for k in preprocessing[0]}
    assert all(v for k, v in same.items() if k != 'hullLines')
    assert (before / 'result-geometry.json').read_bytes() == (after / 'result-geometry.json').read_bytes()
    stls = [(p / 'scene.stl').read_bytes() for p in runs]
    if dataset == 'dc':
        assert stls[0] == stls[1] and all(same.values())
    stats = mesh_stats(stl_triangles(stls[1]))
    assert stats['zeroAreaTriangles'] == 0 and list(stats['exactEdgeIncidence']) == [2]
    directed = collections.Counter()
    graph = collections.defaultdict(set)
    for tri in stl_triangles(stls[1]):
        for u, v in zip(tri, tri[1:] + tri[:1]):
            directed[u, v] += 1
            graph[u].add(v)
            graph[v].add(u)
    assert all(n == directed[v, u] for (u, v), n in directed.items())
    components = 0
    while graph:
        components += 1
        queue = [next(iter(graph))]
        while queue:
            queue.extend(graph.pop(queue.pop(), ()))
    assert components == (1 if dataset == 'dc' else 3)
    all_paths = [json.loads((p / 'map-paths.json').read_text()) for p in runs]
    paths = [[x for x in group if x['stroke'] == '#ff0000'] for group in all_paths]
    assert [x for x in all_paths[0] if x['stroke'] != '#ff0000'] == [
        x for x in all_paths[1] if x['stroke'] != '#ff0000']
    assert len(paths[0]) == 1 and len(paths[1]) == (1 if dataset == 'dc' else 3)
    assert all('z' not in x['d'].lower() for group in paths for x in group)
    for path in paths[1]:
        assert path['d'].count('M') == 1
        coords = re.findall(r'-?\d+(?:\.\d+)?', path['d'])
        assert coords[:2] == coords[-2:]
    for p in runs:
        assert json.loads((p / 'summary.json').read_text())['status'] == 'complete'
    report[dataset] = {
        'preprocessingEqual': same,
        'baseGeometryBytesExact': True,
        'stlBytesExact': stls[0] == stls[1],
        'stlSHA256': [digest(s) for s in stls],
        'redSvgPaths': [len(p) for p in paths], 'svgCloseCommands': 0,
        'eachPaintedRingClosed': True, 'interiorSvgPathsExact': True,
        'export': stats, 'oppositeEdgeOrientation': True, 'components': components,
        'validation': json.loads((after / 'planar-validation.json').read_text()),
    }
path = results / 'hull-evidence.json'
path.write_text(json.dumps(report, indent=2) + '\n')
print('PASS:', path, '— exact DC STL/base geometry; closed, oriented DC/Baltimore exports')
