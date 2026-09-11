// Author: Codex app agent — 2026-09-11.
// A piecewise-constant-height solid. Boolean operations happen only in XY.
import * as THREE from "three";
import libtess from "../three/vendor/libtess/libtess.js";
import RBush from "../three/vendor/rbush.js";
import pc, { strokeLines, insetRegion, conditionExterior, FLOAT32_CONFORMITY } from "./planar-boolean.js";
import { createLineShapes } from "./three.js";
import { islandBase } from "./islands.js";
const union = (...polys) => (polys.length ? pc.union(...polys) : []);
export function lineFootprints(lines, options) {
  // Retain the original strip construction in double precision. Float32 conversion
  // before clipping creates artificial hairline folds at coincident joins.
  return createLineShapes(lines, options).map((shape) => [
    shape.getPoints().map((p) => [p.x, p.y]),
  ]);
}
export function heightRegions(
  { hull, hullLines, lines, interiorLines, sourceExterior },
  options,
) {
  // Every retained exterior receives a floor. Interior source voids keep the
  // approved filled-floor convention; their source-facing walls remain above.
  const coastline = sourceExterior ? conditionExterior(sourceExterior.features[0].geometry.coordinates, options.width) : null;
  const feature = coastline ? {type: "MultiPolygon", coordinates: coastline} : hull.features[0].geometry;
  const exteriors = feature.type === "MultiPolygon" ? feature.coordinates.map(p=>[p[0]]) : [[feature.coordinates[0]]];
  const land = union(exteriors);
  const connections = islandBase(land, options);
  const H = connections.footprint;
  const C = options.sourceTopology ? strokeLines(interiorLines, options.width) : union(...lineFootprints(interiorLines, options));
  let B = options.sourceTopology ? strokeLines(hullLines, options.width) : union(...lineFootprints(hullLines, options));
  // Interior rims sit above the existing floor. Only exterior boundaries need
  // base support; extending interior rims downward would fill underside grooves.
  const exteriorLines = {
    ...hullLines,
    features: hullLines.features.filter(f => f.properties?.boundaryRole !== "interior"),
  };
  let support = options.sourceTopology ? strokeLines(exteriorLines, options.width) : union(...lineFootprints(exteriorLines, options));
  let L = options.sourceTopology ? strokeLines(lines, options.width) : union(...lineFootprints(lines, options));
  let sourceCaps, sourceLayers;
  if (sourceExterior) {
    // A centered coastline stroke seals narrow water inlets into false pockets.
    // Put the full nominal exterior wall width INSIDE the original land outline.
    // Source holes stay in the arc network; they are not filled or reassigned.
    const sourceLand = union(coastline);
    const innerLand = insetRegion(sourceLand, options.width), stroke = L;
    B = pc.difference(sourceLand, innerLand);
    L = union(pc.intersection(stroke, sourceLand), B);
    support = B;
    const grooveRoof = pc.intersection(C, innerLand);
    const addedSupport = pc.difference(H, land);
    const lowFloor = pc.difference(H, grooveRoof);
    sourceLayers = [lowFloor, H, L];
    // Factor the height interfaces using the same sets. Re-subtracting full
    // layers repeatedly sweeps thousands of identical coastline edges.
    sourceCaps = [
      null,
      {up: [], down: grooveRoof},
      {up: union(pc.difference(innerLand, stroke), pc.difference(land, sourceLand), addedSupport), down: []},
      {up: L, down: []},
    ];
  } else if (options.sourceTopology) support = pc.intersection(support, L);
  const layers = sourceLayers || [union(pc.difference(H, C), support), union(H, support), options.sourceTopology ? L : union(B, L)];
  if (sourceCaps) sourceCaps[0] = {up: [], down: layers[0]};
  return {
    H,
    land,
    connections,
    C,
    B,
    L,
    layers,
    caps: sourceCaps,
  };
}
export function layerGeometry(layers, levels, caps) {
  if (
    levels.length !== layers.length + 1 ||
    levels.some((v, i) => !Number.isFinite(v) || (i && v <= levels[i - 1]))
  )
    throw Error("Invalid height layers");
  const triangles = [];
  const add = (a, b, c) => triangles.push([a, b, c]);
  function cap(region, z, up) {
    const tess = new libtess.GluTesselator(),
      points = [];
    tess.gluTessNormal(0, 0, 1);
    tess.gluTessProperty(
      libtess.gluEnum.GLU_TESS_WINDING_RULE,
      libtess.windingRule.GLU_TESS_WINDING_NONZERO,
    );
    tess.gluTessCallback(libtess.gluEnum.GLU_TESS_EDGE_FLAG, () => {});
    tess.gluTessCallback(libtess.gluEnum.GLU_TESS_VERTEX, (p) =>
      points.push(p),
    );
    tess.gluTessCallback(libtess.gluEnum.GLU_TESS_COMBINE, (p) => p);
    tess.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, (e) => {
      throw Error(`Planar tessellation error ${e}`);
    });
    tess.gluTessBeginPolygon(null);
    for (const polygon of region)
      for (const ring of polygon) {
        tess.gluTessBeginContour();
        for (const [x, y] of ring.slice(0, -1)) {
          const p = [x, y, z];
          tess.gluTessVertex(p, p);
        }
        tess.gluTessEndContour();
      }
    tess.gluTessEndPolygon();
    let area = 0;
    for (let i = 0; i < points.length; i += 3) {
      const [a, b, c] = points.slice(i, i + 3);
      area +=
        ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      add(a, up ? b : c, up ? c : b);
    }
    if (
      Math.abs(area - regionArea(region)) >
      Math.max(1e-7, Math.abs(area) * 1e-10)
    )
      throw Error("Incomplete planar cap triangulation");
  }
  for (let i = 0; i <= layers.length; i++) {
    const below = layers[i - 1] ?? [],
      above = layers[i] ?? [];
    // These are already normalized regions. At the outer height levels, an
    // empty operand needs no sweep over thousands of shoreline segments.
    cap(caps ? caps[i].up : !below.length ? [] : !above.length ? below : pc.difference(below, above), levels[i], true);
    cap(caps ? caps[i].down : !above.length ? [] : !below.length ? above : pc.difference(above, below), levels[i], false);
  }
  for (let i = 0; i < layers.length; i++)
    for (const polygon of layers[i])
      for (const ring of polygon)
        for (let j = 1; j < ring.length; j++) {
          const [p, q] = [ring[j - 1], ring[j]],
            lo = levels[i],
            hi = levels[i + 1];
          add([...p, lo], [...q, lo], [...q, hi]);
          add([...p, lo], [...q, hi], [...p, hi]);
        }
  // Node triangulation edges at existing vertices. Tessellation can omit collinear
  // boundary points; adjacent height patches must use the SAME segmented edge.
  // This is conformity, not another boolean or geometric simplification.
  const rawArea = triangles.reduce(
    (s, [a, b, c]) =>
      s +
      new THREE.Vector3(...b)
        .sub(new THREE.Vector3(...a))
        .cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)))
        .length() /
        2,
    0,
  );
  const vertexMap = new Map(),
    vertices = [];
  const key = (p) => p.join(",");
  const weldTree = new RBush();
  function vertex(p) {
    p = p.map(Math.fround);
    const k = key(p);
    if (!vertexMap.has(k)) {
      const near = weldTree
        .search({
          minX: p[0] - FLOAT32_CONFORMITY,
          maxX: p[0] + FLOAT32_CONFORMITY,
          minY: p[1] - FLOAT32_CONFORMITY,
          maxY: p[1] + FLOAT32_CONFORMITY,
        })
        .find(
          (v) =>
            vertices[v.id][2] === p[2] &&
            Math.hypot(vertices[v.id][0] - p[0], vertices[v.id][1] - p[1]) <=
              FLOAT32_CONFORMITY,
        );
      if (near) vertexMap.set(k, near.id);
      else {
        const id = vertices.length;
        vertexMap.set(k, id);
        vertices.push(p);
        weldTree.insert({ minX: p[0], maxX: p[0], minY: p[1], maxY: p[1], id });
      }
    }
    return vertexMap.get(k);
  }
  const faces = triangles.map((t) => t.map(vertex));
  const tree = new RBush();
  tree.load(
    vertices.map((p, id) => ({
      minX: p[0],
      maxX: p[0],
      minY: p[1],
      maxY: p[1],
      id,
    })),
  );
  const edgeCache = new Map(),
    eps = FLOAT32_CONFORMITY;
  function edge(a, b) {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!edgeCache.has(k)) {
      const low = Math.min(a, b),
        high = Math.max(a, b),
        p = vertices[low],
        q = vertices[high];
      const d = q.map((v, i) => v - p[i]),
        len = d.reduce((s, v) => s + v * v, 0),
        nodes = [];
      for (const { id } of tree.search({
        minX: Math.min(p[0], q[0]) - eps,
        maxX: Math.max(p[0], q[0]) + eps,
        minY: Math.min(p[1], q[1]) - eps,
        maxY: Math.max(p[1], q[1]) + eps,
      })) {
        if (id === low || id === high) continue;
        const r = vertices[id],
          t = r.reduce((s, v, i) => s + (v - p[i]) * d[i], 0) / len;
        if (t <= 0 || t >= 1) continue;
        const dist = Math.hypot(...r.map((v, i) => v - p[i] - t * d[i]));
        if (dist <= eps) nodes.push({ id, t });
      }
      nodes.sort((a, b) => a.t - b.t);
      edgeCache.set(k, [low, ...nodes.map((n) => n.id), high]);
    }
    const ids = edgeCache.get(k);
    return a < b ? ids : ids.toReversed();
  }
  const indices = [];
  for (const [a, b, c] of faces) {
    if (a === b || b === c || c === a) continue;
    const perimeter = [
      ...edge(a, b).slice(0, -1),
      ...edge(b, c).slice(0, -1),
      ...edge(c, a).slice(0, -1),
    ];
    if (perimeter.length === 3) {
      indices.push(a, b, c);
      continue;
    }
    const center = vertex(
      [0, 1, 2].map(
        (i) => (vertices[a][i] + vertices[b][i] + vertices[c][i]) / 3,
      ),
    );
    for (let j = 0; j < perimeter.length; j++)
      indices.push(center, perimeter[j], perimeter[(j + 1) % perimeter.length]);
  }
  // Cancel coincident opposite faces after Float32 vertex conformity.
  const unique = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const t = indices.slice(i, i + 3),
      [a, b, c] = t.map((i) => new THREE.Vector3(...vertices[i]));
    if (b.sub(a).cross(c.sub(a)).lengthSq() === 0) continue;
    const k = t.toSorted((a, b) => a - b).join(",");
    if (unique.has(k)) {
      const old = unique.get(k),
        j = old.indexOf(t[0]);
      if (old[(j + 1) % 3] === t[1])
        throw Error("Duplicate outward planar face");
      unique.delete(k);
    } else unique.set(k, t);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices.flat(), 3),
  );
  geometry.setIndex([...unique.values()].flat());
  geometry.computeVertexNormals();
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      vertices.flatMap((p) => p.slice(0, 2)),
      2,
    ),
  );
  geometry.userData.rawArea = rawArea;
  geometry.userData.validation = validateSolid(geometry, layers, levels);
  return geometry;
}

export function regionArea(polygons) {
  return polygons.reduce(
    (a, poly) =>
      a +
      poly.reduce(
        (s, ring) =>
          s +
          ring
            .slice(1)
            .reduce((v, p, i) => v + ring[i][0] * p[1] - p[0] * ring[i][1], 0) /
            2,
        0,
      ),
    0,
  );
}

export function validateSolid(geometry, layers, levels) {
  const p = geometry.attributes.position,
    index = geometry.index.array,
    edges = new Map(),
    links = new Map();
  let volume = 0,
    area = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    cross = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    const ids = Array.from(index.slice(i, i + 3));
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    cross.subVectors(b, a).cross(c.clone().sub(a));
    const length = cross.length();
    if (!Number.isFinite(length) || length === 0)
      throw Error("Nonfinite or collapsed planar face");
    area += length / 2;
    volume += a.dot(cross) / 6;
    for (let j = 0; j < 3; j++) {
      const u = ids[j],
        v = ids[(j + 1) % 3],
        w = ids[(j + 2) % 3],
        key = u < v ? `${u},${v}` : `${v},${u}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count++;
      edge.balance += u < v ? 1 : -1;
      edges.set(key, edge);
      if (!links.has(u)) links.set(u, new Map());
      const link = links.get(u);
      for (const [x, y] of [
        [v, w],
        [w, v],
      ]) {
        if (!link.has(x)) link.set(x, []);
        link.get(x).push(y);
      }
    }
  }
  if (!index.length) throw Error("The planar solid is empty");
  for (const edge of edges.values())
    if (edge.count !== 2 || edge.balance !== 0)
      throw Error("The planar solid has an open or nonmanifold edge");
  // A vertex can join two shells at a point even if every edge has incidence 2.
  for (const link of links.values()) {
    if ([...link.values()].some((v) => v.length !== 2))
      throw Error("Nonmanifold planar vertex");
    const visited = new Set(),
      queue = [link.keys().next().value];
    while (queue.length) {
      const v = queue.pop();
      if (visited.has(v)) continue;
      visited.add(v);
      queue.push(...link.get(v).filter((n) => !visited.has(n)));
    }
    if (visited.size !== link.size)
      throw Error("Planar shells touch at a nonmanifold vertex");
  }
  const expectedVolume = layers.reduce(
    (v, region, i) => v + regionArea(region) * (levels[i + 1] - levels[i]),
    0,
  );
  const volumeTolerance = Math.max(0.002, Math.abs(expectedVolume) * 1e-7);
  if (volume <= 0 || Math.abs(volume - expectedVolume) > volumeTolerance)
    throw Error("Planar volume does not match its height regions");
  return {
    triangles: index.length / 3,
    vertices: links.size,
    edges: edges.size,
    area,
    volume,
    expectedVolume,
    volumeTolerance,
    closed: true,
  };
}
