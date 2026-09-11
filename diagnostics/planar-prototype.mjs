// Author: Codex app agent — 2026-09-11.
// Bounded prototype from frozen preprocessing: no network or historical CSG runs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as THREE from "three";
import { layerGeometry } from "../new/planar.js";
import { STLExporter } from "../three/STLExporter.js";
import {
  createLineShapes,
  createThreeDGeometryLines,
  createThreeDGeometry,
} from "../new/three.js";
import {
  reprojectGeoJSON,
  scaleGeoJSON,
  getMinMaxCoordinates,
} from "../new/leaflet.js";
import pc from "../new/planar-boolean.js";
export const area = (polys) =>
  polys.reduce(
    (sum, poly) =>
      sum +
      poly.reduce(
        (s, ring, i) =>
          s +
          (i ? -1 : 1) *
            Math.abs(
              ring.reduce((a, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return a + p[0] * q[1] - p[1] * q[0];
              }, 0) / 2,
            ),
        0,
      ),
    0,
  );
export function inputs(dataset) {
  const reference =
    dataset === "dc" ? "baseline-dc-3" : "reference-baltimore-cpu";
  const data = JSON.parse(
    readFileSync(`diagnostics/results/${reference}/preprocess.json`),
  );
  let xs = [],
    ys = [];
  function visit(c) {
    if (typeof c[0] === "number") {
      xs.push(c[0]);
      ys.push(c[1]);
    } else c.forEach(visit);
  }
  data.geojson.features.forEach((f) => visit(f.geometry.coordinates));
  const center = {
    lng: (Math.min(...xs) + Math.max(...xs)) / 2,
    lat: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  for (const value of Object.values(data)) reprojectGeoJSON(value, center);
  const bounds = getMinMaxCoordinates(data.hull);
  for (const value of Object.values(data)) scaleGeoJSON(value, bounds);
  return { data, reference };
}
export function outlines(collection) {
  return createLineShapes(collection, { width: 0.5, depth: 6 }).map((shape) => [
    shape.getPoints().map((p) => [p.x, p.y]),
  ]);
}
export function capPolygons(geometry) {
  const pos = geometry.attributes.position,
    idx = geometry.index,
    out = [];
  for (let i = 0; i < (idx?.count ?? pos.count); i += 3) {
    const p = [0, 1, 2].map((j) => {
      const k = idx ? idx.getX(i + j) : i + j;
      return [pos.getX(k), pos.getY(k), pos.getZ(k)];
    });
    if (p.every((v) => v[2] === 6)) {
      const ring = p.map((v) => v.slice(0, 2));
      if (
        Math.abs(
          (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) -
            (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]),
        ) > 0
      )
        out.push([ring]);
    }
  }
  return out;
}
export function audit(collection) {
  const rings = outlines(collection),
    geoms = createThreeDGeometryLines(collection, { width: 0.5, depth: 6 });
  return rings.map((r, i) => {
    const region = pc.union(r),
      caps = capPolygons(geoms[i]),
      capUnion = pc.union(...caps);
    return {
      i,
      vertices: r[0].length,
      regions: region.length,
      area: area(region),
      capArea: area(capUnion),
      capXorArea: area(pc.xor(region, capUnion)),
      triangleArea: area(caps),
    };
  });
}
if (process.argv[1].endsWith("planar-prototype.mjs")) {
  globalThis.window = { shpstl: { depth: 6, width: 0.5 } };
  const dataset = process.argv[2] || "dc",
    start = performance.now();
  const { data, reference } = inputs(dataset);
  const hull = createThreeDGeometry(data.hull)[0].geometry;
  const H = pc.union([data.hull.features[0].geometry.coordinates[0][0]]),
    C = pc.union(...outlines(data.interiorLines)),
    B = pc.union(...outlines(data.hullLines)),
    L = pc.union(...outlines(data.lines));
  const layers = [
    pc.union(pc.difference(H, C), B),
    pc.union(H, B),
    pc.union(B, L),
  ];
  const result = {
    dataset,
    reference,
    ms: performance.now() - start,
    hullShapes: createThreeDGeometry(data.hull).length,
    levels: [0, 1.8, 6, 12],
    layerAreas: layers.map(area),
    layerComponents: layers.map((p) => p.length),
    audit: {
      hullLines: audit(data.hullLines),
      lines: audit(data.lines),
      interiorLines: audit(data.interiorLines),
    },
  };
  const out = `diagnostics/results/planar-prototype-${dataset}`;
  mkdirSync(out, { recursive: true });
  for (const [name, regions, z] of [
    ["base", [pc.difference(H, C), H], [0, Math.fround(1.8), 6]],
    ["scene", layers, [0, Math.fround(1.8), 6, 12]],
  ]) {
    const begin = performance.now(),
      g = layerGeometry(regions, z);
    const geometry = {
      position: Array.from(g.attributes.position.array),
      normal: Array.from(g.attributes.normal.array),
      uv: Array.from(g.attributes.uv.array),
      index: Array.from(g.index.array),
      groups: g.groups,
      drawRange: g.drawRange,
    };
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    const stl = new STLExporter().parse(mesh, { binary: true });
    writeFileSync(out + `/${name}.stl`, Buffer.from(stl.buffer));
    writeFileSync(
      out +
        (name === "base" ? "/result-geometry.json" : "/scene-geometry.json"),
      JSON.stringify(geometry),
    );
    result[name] = {
      ms: performance.now() - begin,
      triangles: g.index.count / 3,
      vertices: g.attributes.position.count,
      rawArea: g.userData.rawArea,
    };
  }
  result.rssMiB = process.memoryUsage().rss / 1024 ** 2;
  writeFileSync(
    out + "/regions.json",
    JSON.stringify({
      H,
      C,
      B,
      L,
      layers,
      source: {
        H: [[data.hull.features[0].geometry.coordinates[0][0]]],
        C: outlines(data.interiorLines),
        B: outlines(data.hullLines),
        L: outlines(data.lines),
      },
    }),
  );
  writeFileSync(out + "/audit.json", JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        ...result,
        audit: Object.fromEntries(
          Object.entries(result.audit).map(([k, v]) => [
            k,
            {
              count: v.length,
              mismatches: v.filter((a) => a.capXorArea > 1e-6),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
}
