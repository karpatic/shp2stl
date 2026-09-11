// Author: Codex app agent — 2026-09-11.
import "../three/vendor/clipper/clipper.js";
const C = globalThis.ClipperLib;
// The library's browser default alerts and continues. Geometry failures must
// propagate to initialize(), which keeps Download disabled.
C.Error = (message) => { throw new Error(`Planar clipping failed: ${message}`); };
const SCALE = 1e6;
function paths(geometry) {
  if (!geometry.length) return [];
  const polygons =
    typeof geometry[0][0][0] === "number" ? [geometry] : geometry;
  return polygons
    .flatMap((poly) =>
      poly
        .map((ring, i) => {
          const path = ring.map(([x, y]) => ({
            X: Math.round(x * SCALE),
            Y: Math.round(y * SCALE),
          }));
          if (
            path.some(
              (p) => !Number.isSafeInteger(p.X) || !Number.isSafeInteger(p.Y)
                || Math.abs(p.X) > C.ClipperBase.hiRange
                || Math.abs(p.Y) > C.ClipperBase.hiRange,
            )
          )
            throw Error("Planar coordinate exceeds integer range");
          if (C.Clipper.Orientation(path) !== (i === 0)) path.reverse();
          return path;
        })
        .filter((r) => r.length),
    )
    .filter((p) => p.length);
}
function operation(kind, a, ...b) {
  const clipper = new C.Clipper(C.Clipper.ioStrictlySimple),
    tree = new C.PolyTree();
  const subject = paths(a),
    others = b.map(paths);
  if (!subject.length && others.every((p) => !p.length)) return [];
  clipper.AddPaths(subject, C.PolyType.ptSubject, true);
  if (kind === "union")
    others.forEach((p) => clipper.AddPaths(p, C.PolyType.ptSubject, true));
  else others.forEach((p) => clipper.AddPaths(p, C.PolyType.ptClip, true));
  if (
    !clipper.Execute(
      C.ClipType[
        {
          union: "ctUnion",
          difference: "ctDifference",
          intersection: "ctIntersection",
          xor: "ctXor",
        }[kind]
      ],
      tree,
      C.PolyFillType.pftNonZero,
      C.PolyFillType.pftNonZero,
    )
  )
    throw Error("Planar boolean operation failed");
  return C.JS.PolyTreeToExPolygons(tree).flatMap((p) => {
    // Resolve only grid-scale collinearity and spikes (2 millionths of a unit).
    // No geography simplification, offsets, or hole-area filtering occurs here.
    const clean = (r) =>
      C.Clipper.CleanPolygon(r, 2).map((p) => [p.X / SCALE, p.Y / SCALE]);
    const outer = clean(p.outer),
      holes = p.holes.map(clean).filter((r) => r.length >= 3);
    if (outer.length < 3) {
      if (holes.length) throw Error("Collapsed outer ring contains holes");
      return [];
    }
    return [[outer, ...holes].map((points) => [...points, points[0]])];
  });
}
export default Object.fromEntries(
  ["union", "difference", "intersection", "xor"].map((k) => [
    k,
    (a = [], ...b) => operation(k, a, ...b),
  ]),
);
