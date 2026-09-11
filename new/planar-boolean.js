import RBush from "../three/vendor/rbush.js";
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
  return fromTree(tree);
}
function fromTree(tree) {
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
// Stroke an entire source topology together on the existing planar integer grid.
// Square end caps give junctions positive area; bounded miter joins match the
// existing strip miter limit. No stitched-strip winding can cancel material.
export function strokeLines(lines, width) {
  if (!Number.isFinite(width) || width <= 0) throw Error('Invalid wall width');
  const offset = new C.ClipperOffset(4);
  for (const f of lines.features) {
    const points = f.geometry.coordinates;
    const path = points.map(([x,y])=>({X:Math.round(x*SCALE),Y:Math.round(y*SCALE)}));
    const closed = path.length>2 && path[0].X===path.at(-1).X && path[0].Y===path.at(-1).Y;
    offset.AddPath(path,C.JoinType.jtMiter,closed?C.EndType.etClosedLine:C.EndType.etOpenSquare);
  }
  const tree = new C.PolyTree();
  offset.Execute(tree, width * SCALE / 2);
  return fromTree(tree);
}
// Existing mesh conformity budget; this is not a geography-repair tolerance.
export const FLOAT32_CONFORMITY = 2e-5;
// Simplify exterior boundaries within the same width/8 approximation bound as
// interior arcs, rejecting shortcuts that cross another current boundary edge.
// Updating the edge index after each accepted shortcut preserves open inlets
// and separation between exterior components. Original vertices are not moved.
export function conditionExterior(polygons, width) {
  const rings=polygons.map(p=>p[0]), tree=new RBush(), edgeLists=[];
  const edge=(a,b)=>({a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
  rings.forEach((ring,r)=>{edgeLists[r]=ring.slice(1).map((b,i)=>({...edge(ring[i],b),ring:r,start:i,end:i+1}));});
  tree.load(edgeLists.flat());
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0], sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const intersects=(a,b,c,d)=>{
    const u=sub(b,a),v=sub(d,c),w=sub(c,a),den=cross(u,v);
    if (den===0) {
      if(cross(w,u)!==0)return false;
      const k=Math.abs(u[0])>=Math.abs(u[1])?0:1;
      if(!u[k])return true;
      const x=(c[k]-a[k])/u[k],y=(d[k]-a[k])/u[k];
      return Math.min(1,Math.max(x,y))>Math.max(0,Math.min(x,y));
    }
    const t=cross(w,v)/den,q=cross(w,u)/den;
    return t>=0&&t<=1&&q>=0&&q<=1&&((t>0&&t<1)||(q>0&&q<1));
  };
  return rings.map((ring,r)=>{
    const keep=new Set([0,ring.length-1]), pending=[[0,ring.length-1]];
    while(pending.length) {
      const [a,b]=pending.pop();if(b-a===1)continue;
      const p=ring[a],q=ring[b],dx=q[0]-p[0],dy=q[1]-p[1];
      let best=-1,index=a+1;
      for(let i=a+1;i<b;i++) {
        const x=ring[i][0]-p[0],y=ring[i][1]-p[1],t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)||0));
        const d=Math.hypot(x-t*dx,y-t*dy);
        if(d>best){best=d;index=i;}
      }
      const chord={...edge(p,q),ring:r,start:a,end:b};
      const blocked=(!dx&&!dy)||tree.search(chord).some(e=>
        !(e.ring===r&&e.start>=a&&e.end<=b)&&intersects(p,q,e.a,e.b));
      if(best>width/8||blocked) {keep.add(index);pending.push([a,index],[index,b]);}
      else {for(let i=a;i<b;i++)tree.remove(edgeLists[r][i]);tree.insert(chord);}
    }
    const points=ring.filter((p,i)=>keep.has(i));
    if(points.length<4)throw Error('Exterior collapsed during topology simplification');
    return [points];
  });
}
export function insetRegion(region, distance) {
  const offset = new C.ClipperOffset(4), tree = new C.PolyTree();
  offset.AddPaths(paths(region), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  offset.Execute(tree, -distance * SCALE);
  return fromTree(tree);
}
export default Object.fromEntries(
  ["union", "difference", "intersection", "xor"].map((k) => [
    k,
    (a = [], ...b) => operation(k, a, ...b),
  ]),
);
