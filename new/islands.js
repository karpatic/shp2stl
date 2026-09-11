// Author: Codex app agent, 2026-09-11.
// Artificial print supports only; these footprints never enter community walls.
import pc from './planar-boolean.js';

// Legacy nominal scale retained when no explicit connector minimum is supplied.
const nominalWidth = width => Math.max(1, 4 * width);
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
const area = region => region.reduce((sum,p) => sum+p.reduce((s,r,i) => {
  let a=0; for(let j=1;j<r.length;j++) a+=r[j-1][0]*r[j][1]-r[j][0]*r[j-1][1];
  return s+(i ? -1 : 1)*Math.abs(a)/2;
},0),0);

// Verify an entire band, not samples or summed overlap. Project every missing
// polygon onto the shore tangent: its whole interval is forbidden, including
// arbitrarily narrow notches. The remaining longest interval is a guaranteed
// contiguous patch. Work in model units (the exported XY extent is 200).
export function padEngagement(footprint, base, end, inward, embed, nominal, span) {
  const tangent=[(end[1][0]-end[0][0])/span,(end[1][1]-end[0][1])/span];
  const normalDepth=embed*.55/Math.hypot(...tangent);
  const requiredWidth=Math.max(nominal*.6,span*.65), requiredPenetration=nominal*.15;
  const at=(y,d)=>[end[0][0]+tangent[0]*y+inward[0]*d,end[0][1]+tangent[1]*y+inward[1]*d];
  const band=(lo,hi,near,far)=>[[at(lo,near),at(hi,near),at(hi,far),at(lo,far),at(lo,near)]];
  // The band inside the pad proves actual penetration. A deeper band in the
  // source base proves a local load path beyond the pad's buried end as well.
  const overlap=pc.intersection(footprint,base);
  const missing=pc.union(pc.difference(band(0,span,embed*.4,embed*.95),overlap),
    pc.difference(band(0,span,embed*.4,embed*1.5),base));
  const determinant=tangent[0]*inward[1]-tangent[1]*inward[0];
  const project=p=>((p[0]-end[0][0])*inward[1]-(p[1]-end[0][1])*inward[0])/determinant;
  const blocked=missing.map(p=>{const ys=p[0].map(project);return [Math.max(0,Math.min(...ys)),Math.min(span,Math.max(...ys))];}).sort((a,b)=>a[0]-b[0]);
  let cursor=0,interval=[0,0];
  for(const [lo,hi] of [...blocked,[span,span]]) {
    if(lo-cursor>interval[1]-interval[0])interval=[cursor,lo];
    cursor=Math.max(cursor,hi);
  }
  // Guard the integer clipping/Float32 boundary, not a mechanical allowance.
  const guard=2e-5;
  interval=[interval[0]+guard,interval[1]-guard];
  const width=Math.max(0,interval[1]-interval[0]);
  return {accepted:width>=requiredWidth && normalDepth>=requiredPenetration,
    width,penetration:normalDepth,requiredWidth,requiredPenetration,
    widthMargin:width-requiredWidth,penetrationMargin:normalDepth-requiredPenetration,
    interval,patch:width>0?band(...interval,embed*.4,embed*.95):[],
    backing:width>0?band(...interval,embed*.4,embed*1.5):[],
    end,inward,embed,span,overlapArea:area(overlap)};
}

function connectingPad(edge, land, nominal) {
  const {a,b,distance:gap}=edge;
  const size=Math.sqrt(Math.min(area([land[edge.i]]),area([land[edge.j]])));
  const width=Math.min(size*.8, Math.max(nominal*2, gap*1.25));
  if(gap<1e-6)return null;
  const axis=[(b[0]-a[0])/gap,(b[1]-a[1])/gap];
  // Keep the broad-pad preference. Only if those fail, search shorter local
  // spans with the very same absolute width and penetration requirements.
  for(const compact of [false,true]) {
    let best;
    for(const angle of [0,-Math.PI/6,Math.PI/6,-Math.PI/3,Math.PI/3]) {
      const n=[axis[0]*Math.cos(angle)-axis[1]*Math.sin(angle),axis[0]*Math.sin(angle)+axis[1]*Math.cos(angle)],t=[-n[1],n[0]];
      const project=p=>[(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1],(p[0]-a[0])*t[0]+(p[1]-a[1])*t[1]];
      const world=([x,y])=>[a[0]+x*n[0]+y*t[0],a[1]+x*n[1]+y*t[1]];
      const rings=[land[edge.i][0],land[edge.j][0]].map(r=>r.map(project)), anchor=project(b);
      const contact=(ring,y,xAnchor)=>{
        const hits=[];
        for(let j=1;j<ring.length;j++) {
          const u=ring[j-1],v=ring[j];
          if((u[1]<=y && v[1]>y)||(v[1]<=y && u[1]>y)) {
            const x=u[0]+(y-u[1])*(v[0]-u[0])/(v[1]-u[1]);
            if(Math.abs(x-xAnchor)<=Math.max(width,nominal)*.8)hits.push(x);
          }
        }
        hits.sort((x,y)=>Math.abs(x-xAnchor)-Math.abs(y-xAnchor)||x-y);
        return hits.length?[hits[0],y]:null;
      };
      const spans=compact ? [nominal*.95,nominal*.8,nominal*.65] : [width,width*.8,width*.6].filter(s=>s>=nominal);
      for(const span of spans)for(const shift of [0,-span/(2*Math.max(width,nominal)),span/(2*Math.max(width,nominal)),-.125,.125,-.25,.25,-.375,.375,-.5,.5,-.75,.75]) {
        const center=anchor[1]/2+Math.max(width,nominal)*shift;
        const contacts=rings.map((r,i)=>[contact(r,center-span/2,i?anchor[0]:0),contact(r,center+span/2,i?anchor[0]:0)]);
        if(contacts.flat().some(p=>!p))continue;
        const [[al,ah],[bl,bh]]=contacts;
        if(Math.min(bl[0]-al[0],bh[0]-ah[0])<=0)continue;
        const embed=nominal*.35;
        const q=[[al[0]-embed,al[1]],[bl[0]+embed,bl[1]],[bh[0]+embed,bh[1]],[ah[0]-embed,ah[1]]].map(world);
        if(!q.every((p,i)=>cross(p,q[(i+1)%4],q[(i+2)%4])>1e-8))continue;
        const footprint=pc.union([[...q,q[0]]]);
        const engagement=contacts.map((end,i)=>padEngagement(footprint,[land[i?edge.j:edge.i]],end.map(world),n.map(v=>v*(i?1:-1)),embed,nominal,span));
        if(engagement.some(e=>!e.accepted))continue;
        // The convex corridor between those patches must also have a broad
        // neck: exact minimum distance between its two longitudinal edges.
        const neckWidth=nearest([q[0],q[1],q[0]],[q[3],q[2],q[3]]).distance;
        if(neckWidth<nominal*.6+2e-5)continue;
        // No automatic inlet/pocket filling. Try another local shore instead.
        if(pc.union([land[edge.i],land[edge.j]],footprint).some(p=>p.length>1))continue;
        const length=((bl[0]-al[0])+(bh[0]-ah[0]))/2;
        const score=length/span+.4*Math.abs(shift)+.7*(1-span/Math.max(width,nominal))+.2*Math.abs(angle);
        if(!best || score<best.score)best={kind:compact?'solid-fallback':'shore-pad',
          ...(compact?{reason:'shorter local span; broad candidates failed engagement or pocket checks'}:{}),
          width:span,contacts:contacts.map(r=>r.map(world)),quad:q,footprint,engagement,
          attachment:engagement.map(e=>e.overlapArea),neckWidth,requiredNeckWidth:nominal*.6,
          filledCornerPockets:0,score};
      }
    }
    if(best)return best;
  }
  return null;
}

function nearest(a, b) {
  let best = {distance: Infinity};
  const scan = (points, ring, reverse) => {
    for (const p of points.slice(0,-1)) for (let i=1;i<ring.length;i++) {
      const u=ring[i-1], v=ring[i], dx=v[0]-u[0], dy=v[1]-u[1];
      const t=Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/(dx*dx+dy*dy)||0));
      const q=[u[0]+t*dx,u[1]+t*dy], distance=Math.hypot(q[0]-p[0],q[1]-p[1]);
      if(distance<best.distance) best={distance,a:reverse?q:p,b:reverse?p:q};
    }
  };
  // For disjoint polygons the closest segment pair has at least one endpoint.
  scan(a,b,false); scan(b,a,true);
  return best;
}

function convexHull(land) {
  const points=land.flatMap(p=>p[0].slice(0,-1)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=ps=>{const out=[];for(const p of ps){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out.slice(0,-1);};
  const ring=[...half(points),...half(points.toReversed())];
  return pc.union([[...ring,ring[0]]]);
}

export function islandBase(land, options) {
  const mode=options.islandConnections ?? 'connections';
  const minimum=options.minConnectorWidth ?? nominalWidth(options.width)*.6;
  if(!Number.isFinite(minimum)||minimum<.01||minimum>200) throw Error('Minimum connector width must be between 0.01 and 200 mm');
  // One dimensional scale drives broad spans, compact fallback, embed depth,
  // continuous-contact width/depth and neck checks. Never relax it on failure.
  const width=minimum/.6;
  if(!['connections','disconnected','hull'].includes(mode)) throw Error('Unknown island connection mode');
  if(!Number.isFinite(width)||options.width<=0) throw Error('Invalid connection width');
  if(!land.length) throw Error('No retained island bases');
  if(mode==='hull') return {mode,width,links:[],footprint:convexHull(land)};
  if(mode==='disconnected'||land.length===1) return {mode,width,links:[],footprint:land};
  const edges=[];
  for(let i=0;i<land.length;i++) for(let j=i+1;j<land.length;j++) edges.push({i,j,...nearest(land[i][0],land[j][0])});
  edges.sort((a,b)=>a.distance-b.distance||a.i-b.i||a.j-b.j);
  const parents=land.map((_,i)=>i), root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
  const links=[], supports=[], rejectedEdges=[];
  // Kruskal selects n-1 short feasible shoreline gaps deterministically. Broad
  // pads may additionally overlap nearby land; only the backing is unioned.
  for(const edge of edges) {
    if(root(edge.i)===root(edge.j))continue;
    const pad=connectingPad(edge,land,width);
    if(!pad){rejectedEdges.push({i:edge.i,j:edge.j,distance:edge.distance,reason:'no local pad passed continuous engagement, neck and pocket checks'});continue;}
    parents[root(edge.i)]=root(edge.j);
    links.push({...edge,...pad}); supports.push(pad.footprint);
    if(links.length===land.length-1)break;
  }
  if(links.length!==land.length-1)throw Error(`No island pad with continuous broad engagement at minimum ${minimum} mm; use Disconnected or Hull base`);
  const footprint=pc.union(land,...supports);
  if(footprint.length!==1) throw Error('Island connections did not form a connected base');
  return {mode,width,links,rejectedEdges,footprint};
}
