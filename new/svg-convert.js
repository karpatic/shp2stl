// Author: Codex app agent, 2026-09-11. Converter-only sanitized SVG subset.
import {SVGLoader} from '../three/SVGLoader.js';
import pc from './planar-boolean.js';
import {LOCAL,validateGeoJSON} from './file-formats.js';
const tags=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line']);
const attrs=new Set(['d','points','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','viewBox','transform','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','opacity','fill-opacity','stroke-opacity']);
function matrix(text){let m=new DOMMatrix();if(!text)return m;let rest=text;for(const match of text.matchAll(/([A-Za-z]+)\s*\(([^)]*)\)/g)){rest=rest.replace(match[0],'');const a=match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);if(!a.every(Number.isFinite)||a.some(v=>Math.abs(v)>100000))throw Error('Invalid transform');let t=new DOMMatrix();switch(match[1]){case 'matrix':if(a.length!==6)throw Error('Invalid matrix');t=new DOMMatrix(a);break;case 'translate':if(a.length<1||a.length>2)throw Error('Invalid translate');t.translateSelf(a[0],a[1]||0);break;case 'scale':if(a.length<1||a.length>2)throw Error('Invalid scale');t.scaleSelf(a[0],a[1]??a[0]);break;case 'rotate':if(a.length!==1&&a.length!==3)throw Error('Invalid rotate');t.translateSelf(a[1]||0,a[2]||0).rotateSelf(a[0]).translateSelf(-(a[1]||0),-(a[2]||0));break;case 'skewX':if(a.length!==1)throw Error('Invalid skew');t.skewXSelf(a[0]);break;case 'skewY':if(a.length!==1)throw Error('Invalid skew');t.skewYSelf(a[0]);break;default:throw Error('Unsupported transform');}m=m.multiply(t);}if(rest.replace(/[\s,]/g,''))throw Error('Malformed transform');return m;}
export function sanitizeSVG(text){
 if(text.length>1000000)throw Error('SVG exceeds 1 MB');if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('DTD and entities are not allowed');
 const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG XML');
 const clean=document.implementation.createDocument('http://www.w3.org/2000/svg','svg'),warnings=new Set();let count=0,pathChars=0;
 function visit(node,parent,world,depth){if(++count>500||depth>20)throw Error('SVG exceeds 500 elements or 20 nested groups');const tag=node.localName;
  if(!tags.has(tag)){warnings.add(`Ignored <${tag}>; only basic vector geometry is supported.`);return;}
  if(tag==='svg'&&depth>0){warnings.add('Ignored nested SVG viewport.');return;}
  const el=depth===0?clean.documentElement:clean.createElementNS('http://www.w3.org/2000/svg',tag),transform=matrix(node.getAttribute('transform')),m=world.multiply(transform);
  for(const a of node.attributes){if(a.name==='xmlns')continue;if(!attrs.has(a.name)){warnings.add(`Ignored ${a.name} attribute (including CSS, references and events).`);continue;}
   if(/url\s*\(|javascript:|https?:|data:|var\s*\(/i.test(a.value))throw Error('External resources and URL paints are unsupported');
   if(a.value.length>200000)throw Error('Oversized SVG attribute');if(a.name==='d'||a.name==='points')pathChars+=a.value.length;if(pathChars>200000)throw Error('SVG path complexity exceeds limit');
   el.setAttribute(a.name,a.value);
  }
  const sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d),dot=m.a*m.c+m.b*m.d;
  el.setAttribute('data-stroke-scale',Math.abs(sx-sy)<1e-7*Math.max(1,sx)&&Math.abs(dot)<1e-7*Math.max(1,sx*sy)?String(sx):'unsupported');
  if(depth)parent.appendChild(el);for(const child of node.children)visit(child,el,m,depth+1);
 }
 visit(doc.documentElement,null,new DOMMatrix(),0);return {text:new XMLSerializer().serializeToString(clean),warnings:[...warnings]};
}
function flatten(path,tolerance,budget){const result=[];
 const add=p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6)throw Error('SVG coordinates exceed limit');if(++budget.count>30000)throw Error('SVG flattening exceeds 30,000 vertices');result.push([p.x,p.y]);};
 for(const curve of path.curves){const start=curve.getPoint(0);if(!result.length)add(start);const split=(a,b,pa,pb,depth)=>{const ts=[.25,.5,.75].map(f=>a+(b-a)*f),ps=ts.map(t=>curve.getPoint(t)),dx=pb.x-pa.x,dy=pb.y-pa.y,den=dx*dx+dy*dy;const err=Math.max(...ps.map(p=>{const t=den?Math.max(0,Math.min(1,((p.x-pa.x)*dx+(p.y-pa.y)*dy)/den)):0;return Math.hypot(p.x-pa.x-t*dx,p.y-pa.y-t*dy);}));if(err>tolerance){if(depth>=14)throw Error('Curve exceeds flattening budget');split(a,ts[1],pa,ps[1],depth+1);split(ts[1],b,ps[1],pb,depth+1);}else add(pb);};split(0,1,start,curve.getPoint(1),0);}
 return result;
}
const close=r=>{if(r.length&&r[0].join()!==r.at(-1).join())r.push(r[0]);return r;};
function stroke(r,width,style){const C=globalThis.ClipperLib,S=1e6,o=new C.ClipperOffset(4,2000),tree=new C.PolyTree();const closed=r.length>2&&r[0].join()===r.at(-1).join();o.AddPath(r.map(([x,y])=>({X:Math.round(x*S),Y:Math.round(y*S)})),style.strokeLineJoin==='round'?C.JoinType.jtRound:style.strokeLineJoin==='bevel'?C.JoinType.jtSquare:C.JoinType.jtMiter,closed?C.EndType.etClosedLine:style.strokeLineCap==='round'?C.EndType.etOpenRound:style.strokeLineCap==='square'?C.EndType.etOpenSquare:C.EndType.etOpenButt);o.Execute(tree,width*S/2);return C.JS.PolyTreeToExPolygons(tree).map(p=>[p.outer,...p.holes].map(r=>close(r.map(p=>[p.X/S,p.Y/S]))));}
export function convertSVG(text,size=40){
 if(!Number.isFinite(size)||size<10||size>500)throw Error('Drawing size must be 10–500 mm');const sanitized=sanitizeSVG(text),parsed=new SVGLoader().parse(sanitized.text),warnings=sanitized.warnings;
 // Establish a physical error scale before flattening. The final extent includes strokes.
 const rough=parsed.paths.flatMap(p=>p.subPaths.flatMap(s=>s.getPoints(4)));if(!rough.length)throw Error('No supported vector geometry');let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of rough){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}const initial=size/Math.max(maxX-minX,maxY-minY);if(!Number.isFinite(initial))throw Error('SVG has no positive extent');
 let polygons=[],budget={count:0};const toMM=r=>r.map(([x,y])=>[(x-minX)*initial,-(y-minY)*initial]);
 for(const p of parsed.paths){const st=p.userData.style;if(st.opacity===0)continue;
  if(st.fill!=='none'&&st.fillOpacity!==0){const shapes=SVGLoader.createShapes(p);polygons.push(...shapes.map(s=>[s,...s.holes].map(r=>close(toMM(flatten(r,.01/initial,budget))))));}
  if(st.stroke!=='none'&&st.strokeOpacity!==0&&st.strokeWidth>0){const scale=p.userData.node.getAttribute('data-stroke-scale');if(scale==='unsupported'){warnings.push('Skipped stroke under nonuniform scale or skew; filled geometry is preserved.');continue;}for(const sub of p.subPaths){const r=toMM(flatten(sub,.01/initial,budget));if(r.length>=2)polygons.push(...stroke(r,st.strokeWidth*Number(scale)*initial,st));}}
 }
 if(!polygons.length)throw Error('No supported visible filled or stroked geometry');polygons=pc.union(polygons);if(!polygons.length)throw Error('Converted geometry is empty');
 let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity;for(const p of polygons)for(const r of p)for(const [x,y] of r){loX=Math.min(loX,x);loY=Math.min(loY,y);hiX=Math.max(hiX,x);hiY=Math.max(hiY,y);}const factor=size/Math.max(hiX-loX,hiY-loY);if(!Number.isFinite(factor)||factor>1.1)throw Error('Unsupported or invisible geometry changes drawing bounds. Crop the SVG to visible vectors before converting.');const coordinates=polygons.map(p=>p.map(r=>r.map(([x,y])=>[(x-(loX+hiX)/2)*factor,(y-(loY+hiY)/2)*factor])));
 const json=validateGeoJSON({type:'FeatureCollection',shp2stl:LOCAL,features:[{type:'Feature',properties:{source:'SVG supported polygon subset',units:'mm'},geometry:{type:'MultiPolygon',coordinates}}]});
 return {json,warnings:[...new Set(warnings)],vertices:budget.count};
}
