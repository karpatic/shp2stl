// Author: Codex app agent, 2026-09-11.
// One source-derived topology for polygons, raised walls, and groove paths.
import RBush from '../three/vendor/rbush.js';
import {getConvexHull, getInteriorLines} from './leaflet.js';

// Node intersections before TopoJSON: its topology builder only shares vertices
// already present in the input. Keep the actual source coordinates; no snapping.
export function nodePolygons(input) {
  const result=structuredClone(input), segments=[], rings=[];
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  for(const f of result.features) {
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const poly of polys) for(const ring of poly) {
      const list=[]; rings.push({ring,list});
      for(let i=1;i<ring.length;i++) {
        const a=ring[i-1],b=ring[i];if(same(a,b))continue;
        const s={a,b,id:segments.length,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1]),cuts:[[0,a],[1,b]]};
        segments.push(s);list.push(s);
      }
    }
  }
  const tree=new RBush();tree.load(segments);
  for(const a of segments) for(const b of tree.search(a)) {
    if(b.id<=a.id)continue;
    const u=sub(a.b,a.a),v=sub(b.b,b.a),w=sub(b.a,a.a),den=cross(u,v);
    if(den===0) {
      if(cross(w,u)!==0)continue;
      for(const [s,p] of [[a,b.a],[a,b.b],[b,a.a],[b,a.b]]) {
        const d=sub(s.b,s.a),k=Math.abs(d[0])>=Math.abs(d[1])?0:1,t=(p[k]-s.a[k])/d[k];
        if(t>0&&t<1)s.cuts.push([t,p]);
      }
    } else {
      const t=cross(w,v)/den,q=cross(w,u)/den;
      if(t<0||t>1||q<0||q>1)continue;
      let p=t===0?a.a:t===1?a.b:q===0?b.a:q===1?b.b:[a.a[0]+t*u[0],a.a[1]+t*u[1]];
      // Reuse an endpoint when interpolation differs only by Float64 rounding.
      // The four-epsilon coordinate band limits endpoint reuse to Float64
      // roundoff scale; it does not move or quantize original source vertices.
      const endpoint=[a.a,a.b,b.a,b.b].find(e=>e.every((v,k)=>Math.abs(v-p[k])<=4*Number.EPSILON*Math.max(1,Math.abs(v),Math.abs(p[k]))));
      if(endpoint)p=endpoint;
      a.cuts.push([t,p]);b.cuts.push([q,p]);
    }
  }
  for(const {ring,list} of rings) {
    const coords=[];
    for(const s of list) for(const [,p] of s.cuts.sort((a,b)=>a[0]-b[0]))
      if(!coords.length||!same(coords.at(-1),p))coords.push(p);
    ring.splice(0,ring.length,...coords);
  }
  return result;
}

export function simplifyTopology(topology, quantile, width, bbox, mapSize = 200) {
  const co=Math.cos((bbox[1]+bbox[3])*Math.PI/360);
  const modelScale=mapSize/Math.max((bbox[2]-bbox[0])*co,bbox[3]-bbox[1]);
  const limit=width/8, weight=topojson.quantile(topology,quantile);
  const distance=(p,a,b)=>{
    const x=(p[0]-a[0])*co,y=p[1]-a[1],dx=(b[0]-a[0])*co,dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)||0));
    return Math.hypot(x-t*dx,y-t*dy)*modelScale;
  };
  // Quantile selects the desired detail. Restore vertices until every shortcut
  // stays within one eighth of wall width. This limits approximation, not source
  // repair: coordinates and ownership are never snapped or reassigned.
  topology.arcs=topology.arcs.map(arc=>{
    const keep=new Set(arc.flatMap((p,i)=>p[2]>=weight||!i||i===arc.length-1?[i]:[]));
    const ids=[...keep], pending=ids.slice(1).map((b,i)=>[ids[i],b]);
    while(pending.length) {
      const [a,b]=pending.pop();let best=limit,index=-1;
      for(let i=a+1;i<b;i++){const d=distance(arc[i],arc[a],arc[b]);if(d>best){best=d;index=i;}}
      if(index>=0){keep.add(index);pending.push([a,index],[index,b]);}
    }
    return arc.filter((p,i)=>keep.has(i)).map(p=>p.slice(0,2));
  });
  return topology;
}

export function communityBoundaries(source, options) {
  const retained=getConvexHull(source);
  const sourceExterior=turf.featureCollection([turf.multiPolygon(retained.features[0].geometry.coordinates.map(p=>[structuredClone(p[0])]))]);
  // Filter exterior components using the existing area policy BEFORE building
  // topology. Multipolygons receive the same treatment as Polygons, no rounding.
  const clipped=turf.featureCollection(source.features.map(f=>{
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    const kept=polys.filter(p=>turf.intersect(turf.polygon(p),retained.features[0]));
    return kept.length?turf.multiPolygon(kept,{...f.properties}):null;
  }).filter(Boolean));
  let topology=topojson.presimplify(topojson.topology({collection:nodePolygons(clipped)}));
  topology=simplifyTopology(topology,Math.max(options.simplifyBy,options.simplifyHullBy ?? options.simplifyBy),options.width,turf.bbox(clipped),options.mapSize ?? 200);
  const geojson=topojson.feature(topology,topology.objects.collection);
  const hull=getConvexHull(geojson);
  const hullLines=turf.featureCollection(hull.features[0].geometry.coordinates.map(p=>turf.lineString(p[0],{boundaryRole:'exterior'})));
  // Each unique arc is stroked separately. Stitching return paths into one strip
  // lets opposite winding cancel material and enclose artificial sliver pockets.
  const owners=topology.arcs.map(()=>new Set());
  const visit=(arcs,owner)=>{for(const a of arcs) {if(Array.isArray(a))visit(a,owner);else owners[a<0?~a:a].add(owner);}};
  topology.objects.collection.geometries.forEach((g,i)=>visit(g.arcs,i));
  const lines=turf.featureCollection(topology.arcs.flatMap((a,i)=>a.length>=2?[turf.lineString(a,{sourceFeatures:[...owners[i]]})]:[]));
  // Preserve the distinction between community grooves and source-void rims.
  // A singly-owned source edge raises a wall but does not add an underside cut.
  const shared=turf.featureCollection(lines.features.filter(f=>f.properties.sourceFeatures.length>1));
  const interiorLines=getInteriorLines(shared,hull);
  return {geojson,hull,hullLines,lines,interiorLines,sourceExterior};
}
