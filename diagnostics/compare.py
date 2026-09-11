"""Author: Codex app agent — 2026-09-11. Exact surfaces, not screenshot similarity."""
import collections
import hashlib
import json
import math
import pathlib
import struct
import sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def mesh_stats(triangles):
    bounds = [[math.inf] * 3, [-math.inf] * 3]
    area = volume = 0.0
    edges = collections.Counter()
    faces = collections.Counter()
    degenerate = 0
    for a, b, c in triangles:
        for p in (a, b, c):
            for k in range(3):
                if not math.isfinite(p[k]):
                    raise ValueError("Nonfinite output coordinate")
                bounds[0][k] = min(bounds[0][k], p[k])
                bounds[1][k] = max(bounds[1][k], p[k])
        ab = [b[k] - a[k] for k in range(3)]
        ac = [c[k] - a[k] for k in range(3)]
        cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
        tri_area = math.sqrt(sum(x*x for x in cross)) / 2
        area += tri_area
        degenerate += tri_area == 0
        volume += sum(a[k]*cross[k] for k in range(3)) / 6
        # Cyclic rotation preserves winding; reversal deliberately does not.
        face = min((a,b,c), (b,c,a), (c,a,b))
        faces[face] += 1
        for p,q in ((a,b),(b,c),(c,a)):
            edges[tuple(sorted((p,q)))] += 1
    return {
        'triangles': sum(faces.values()), 'bounds': bounds, 'area': area,
        'signedVolume': volume, 'zeroAreaTriangles': degenerate,
        'exactEdgeIncidence': dict(sorted(collections.Counter(edges.values()).items())),
        'orientedSurfaceSHA256': digest(repr(sorted(faces.items())).encode()),
    }


def stl_triangles(data):
    count, = struct.unpack_from('<I', data, 80)
    assert len(data) == 84 + 50 * count
    for i in range(count):
        coords = struct.unpack_from('<9f', data, 84 + i*50 + 12)
        yield tuple(coords[:3]), tuple(coords[3:6]), tuple(coords[6:])


def geometry_triangles(geometry):
    positions = geometry['position']
    indices = geometry['index'] or range(len(positions)//3)
    for i in range(0,len(indices),3):
        yield tuple(tuple(positions[3*indices[i+j]:3*indices[i+j]+3]) for j in range(3))


def compare(left, right):
    report = {'left':str(left),'right':str(right)}
    report['preprocessExact'] = (left/'preprocess.json').read_bytes() == (right/'preprocess.json').read_bytes()
    geometries = [json.loads((p/'result-geometry.json').read_bytes()) for p in (left,right)]
    report['attributesExact'] = {key:geometries[0][key] == geometries[1][key] for key in geometries[0]}
    report['csg'] = [mesh_stats(geometry_triangles(g)) for g in geometries]
    stls = [(p/'scene.stl').read_bytes() for p in (left,right)]
    report['stlBytesExact'] = stls[0] == stls[1]
    report['stlSHA256'] = [digest(s) for s in stls]
    report['exportedScene'] = [mesh_stats(stl_triangles(s)) for s in stls]
    print(json.dumps(report,indent=2))
    return report['preprocessExact'] and all(report['attributesExact'].values()) and report['stlBytesExact']


if __name__ == '__main__':
    success = compare(*(pathlib.Path(p) for p in sys.argv[1:3]))
    sys.exit(0 if success else 1)
