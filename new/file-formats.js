// Author: Codex app agent, 2026-09-11. Bounded polygon-only local file formats.
import {unzipSync,zipSync,strToU8,strFromU8} from '../three/vendor/fflate/fflate.js';
export const LOCAL={version:1,coordinates:'local-mm'};
export function validateGeoJSON(input){
 let json=input;if(json.type==='Polygon'||json.type==='MultiPolygon')json={type:'Feature',properties:{},geometry:json};if(json.type==='Feature')json={type:'FeatureCollection',features:[json]};
 if(json.type!=='FeatureCollection'||!Array.isArray(json.features)||!json.features.length||json.features.length>1000)throw Error('Expected 1–1000 polygon features');
 const local=json.shp2stl?.version===1&&json.shp2stl.coordinates==='local-mm';
 if(json.shp2stl&&!local)throw Error('Unsupported local coordinate metadata');
 if(json.crs)throw Error('Legacy GeoJSON CRS is unsupported. Export WGS84 longitude/latitude or explicit local-mm data.');
 let count=0;
 for(const f of json.features){const g=f.geometry;if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw Error('Only Polygon and MultiPolygon geometry is supported');
 const ps=g.type==='Polygon'?[g.coordinates]:g.coordinates;if(!Array.isArray(ps)||!ps.length)throw Error('Empty polygon');
 for(const p of ps){if(!Array.isArray(p)||!p.length)throw Error('Empty polygon');for(const r of p){if(!Array.isArray(r)||r.length<4)throw Error('A polygon ring needs at least four positions');for(const c of r){if(++count>200000)throw Error('File exceeds 200,000 positions');if(!Array.isArray(c)||c.length<2||!c.slice(0,2).every(Number.isFinite)||Math.abs(c[0])>(local?100000:180)||Math.abs(c[1])>(local?100000:90))throw Error('Invalid coordinates or unsupported projection');}if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])throw Error('Polygon rings must be closed');}}
 }
 return json;
}
export function safeUnzip(bytes){
 if(bytes.length>10*1024*1024)throw Error('ZIP exceeds 10 MB');let total=0,count=0;
 return unzipSync(bytes,{filter:e=>{if(++count>100||e.name.length>180||/\\|(^|\/)\.\.(\/|$)|^\/|^[A-Za-z]:/.test(e.name))throw Error('Unsafe ZIP entry');total+=e.originalSize;if(e.originalSize>20*1024*1024||total>30*1024*1024)throw Error('ZIP expands beyond the 30 MB limit');return true;}});
}
const area=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
function contains(r,p){let inRing=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inRing=!inRing;}return inRing;}
export function readSHP(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<100||v.getInt32(0)!==9994||v.getInt32(28,true)!==1000||v.getInt32(32,true)!==5||v.getInt32(24)*2!==bytes.length)throw Error('Only valid 2D Polygon shapefiles (type 5) are supported');
 const features=[];let at=100,total=0;
 while(at<bytes.length){if(at+8>bytes.length)throw Error('Truncated shape record');const length=v.getInt32(at+4)*2,start=at+8,end=start+length;if(length<4||end>bytes.length)throw Error('Invalid shape record length');at=end;const type=v.getInt32(start,true);if(type===0)continue;if(type!==5||length<44)throw Error('Only polygon records supported');const n=v.getInt32(start+36,true),m=v.getInt32(start+40,true);total+=m;if(n<1||m<4||n>m||total>200000||44+n*4+m*16!==length)throw Error('Invalid or oversized polygon record');
 const rings=[];for(let i=0;i<n;i++){const a=v.getInt32(start+44+i*4,true),b=i+1<n?v.getInt32(start+48+i*4,true):m;if(a<0||b>m||b-a<4||(i===0&&a!==0))throw Error('Invalid ring offsets');const r=[];for(let j=a;j<b;j++){const off=start+44+n*4+j*16;r.push([v.getFloat64(off,true),v.getFloat64(off+8,true)]);}rings.push(r);}
 const outer=rings.filter(r=>area(r)<0).map(r=>[r]);if(!outer.length)throw Error('Polygon has no clockwise exterior');for(const hole of rings.filter(r=>area(r)>=0)){const owners=outer.filter(p=>contains(p[0],hole[0])).sort((a,b)=>Math.abs(area(a[0]))-Math.abs(area(b[0])));if(!owners.length)throw Error('Shapefile hole has no exterior');owners[0].push(hole);}
 features.push({type:'Feature',properties:{record:features.length+1},geometry:{type:'MultiPolygon',coordinates:outer}});if(features.length>1000)throw Error('Too many shape records');
 }
 return {type:'FeatureCollection',features};
}
export function readShapeZIP(bytes){const files=safeUnzip(bytes),names=Object.keys(files),shps=names.filter(n=>/\.shp$/i.test(n));if(shps.length!==1)throw Error('ZIP must contain one polygon .shp with matching .shx and .dbf');const stem=shps[0].slice(0,-4),get=ext=>files[names.find(n=>n.toLowerCase()===(stem+ext).toLowerCase())];if(!get('.shx')||!get('.dbf'))throw Error('ZIP needs matching .shp, .shx and .dbf files');
 const shp=files[shps[0]],shx=get('.shx'),dbf=get('.dbf');
 const sv=new DataView(shp.buffer,shp.byteOffset,shp.byteLength),ix=new DataView(shx.buffer,shx.byteOffset,shx.byteLength),dv=new DataView(dbf.buffer,dbf.byteOffset,dbf.byteLength);
 if(shx.length<100||(shx.length-100)%8||ix.getInt32(0)!==9994||ix.getInt32(24)*2!==shx.length||ix.getInt32(32,true)!==5)throw Error('Invalid SHX index');
 const records=(shx.length-100)/8;let offset=100;for(let i=0;i<records;i++){const bytes=ix.getInt32(104+i*8)*2;if(ix.getInt32(100+i*8)*2!==offset||offset+8>shp.length||sv.getInt32(offset+4)*2!==bytes||bytes<4)throw Error('SHP/SHX index mismatch');offset+=8+bytes;}if(offset!==shp.length)throw Error('Incomplete SHX index');
 if(dbf.length<33||dv.getUint32(4,true)!==records||dv.getUint16(8,true)<33||dv.getUint16(10,true)<1||dv.getUint16(8,true)+records*dv.getUint16(10,true)>dbf.length)throw Error('Invalid DBF record table');
 const json=readSHP(shp),meta=get('.shp2stl.json'),prj=strFromU8(get('.prj')||new Uint8Array());
 if(meta){const m=JSON.parse(strFromU8(meta));if(m.version!==1||m.coordinates!=='local-mm')throw Error('Unsupported drawing metadata');json.shp2stl=LOCAL;}
 else if(!/^\s*GEOGCS\s*\[/i.test(prj)||!/WGS[_ ]?(?:19)?84/i.test(prj)||/PROJCS|PROJCRS|GRAD|FOOT/i.test(prj))throw Error('Only WGS84 geographic .prj is supported. Reproject externally, or use converter local-mm ZIP.');
 return validateGeoJSON(json);
}
export async function readLocalFile(file){if(file.size>10*1024*1024)throw Error('File exceeds 10 MB');if(/\.zip$/i.test(file.name))return readShapeZIP(new Uint8Array(await file.arrayBuffer()));if(!/\.(geojson|json)$/i.test(file.name))throw Error('Choose GeoJSON/JSON or a polygon shapefile ZIP. Convert SVG on the separate converter page.');return validateGeoJSON(JSON.parse(await file.text()));}
function boundsOf(points){let b=[Infinity,Infinity,-Infinity,-Infinity];for(const [x,y] of points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;}
function header(length,bounds){const b=new Uint8Array(length),v=new DataView(b.buffer);v.setInt32(0,9994);v.setInt32(24,length/2);v.setInt32(28,1000,true);v.setInt32(32,5,true);bounds.forEach((n,i)=>v.setFloat64(36+i*8,n,true));return b;}
export function shapeZIP(json){
 validateGeoJSON(json);if(!json.shp2stl)throw Error('Converter export requires explicit local-mm coordinates');
 const records=json.features.map(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return polys.flatMap(p=>p.map((r,i)=>{const q=r.map(p=>p.slice(0,2));if((area(q)<0)!==(i===0))q.reverse();return q;}));});
 const all=records.flat(2),bounds=boundsOf(all);
 const sizes=records.map(rs=>44+rs.length*4+rs.flat().length*16),shp=header(100+sizes.reduce((s,n)=>s+n+8,0),bounds),shx=header(100+records.length*8,bounds),v=new DataView(shp.buffer),ix=new DataView(shx.buffer);let at=100;
 records.forEach((rs,i)=>{const start=at+8,points=rs.flat();v.setInt32(at,i+1);v.setInt32(at+4,sizes[i]/2);ix.setInt32(100+i*8,at/2);ix.setInt32(104+i*8,sizes[i]/2);v.setInt32(start,5,true);const b=boundsOf(points);b.forEach((n,j)=>v.setFloat64(start+4+j*8,n,true));v.setInt32(start+36,rs.length,true);v.setInt32(start+40,points.length,true);let off=0;rs.forEach((r,j)=>{v.setInt32(start+44+j*4,off,true);off+=r.length;});points.forEach((p,j)=>{v.setFloat64(start+44+rs.length*4+j*16,p[0],true);v.setFloat64(start+52+rs.length*4+j*16,p[1],true);});at+=sizes[i]+8;});
 const dbf=new Uint8Array(65+records.length*11+1),d=new DataView(dbf.buffer);dbf[0]=3;dbf[1]=126;dbf[2]=9;dbf[3]=11;d.setUint32(4,records.length,true);d.setUint16(8,65,true);d.setUint16(10,11,true);dbf.set(strToU8('ID'),32);dbf[43]=78;dbf[48]=10;dbf[64]=13;records.forEach((_,i)=>dbf.set(strToU8(' '+String(i+1).padStart(10)),65+i*11));dbf[dbf.length-1]=26;
 return zipSync({'drawing.shp':shp,'drawing.shx':shx,'drawing.dbf':dbf,'drawing.prj':strToU8('LOCAL_CS["SHP2STL drawing",LOCAL_DATUM["Local",0],UNIT["millimetre",0.001],AXIS["X",EAST],AXIS["Y",NORTH]]'),'drawing.shp2stl.json':strToU8(JSON.stringify(LOCAL)),'drawing.geojson':strToU8(JSON.stringify(json)),'README.txt':strToU8('Local Cartesian drawing coordinates in millimeters; no geographic EPSG. Polygon fills only. No printable part roles are encoded in SHP. The GeoJSON companion retains explicit SHP2STL local-mm metadata. Import it or this ZIP in SHP2STL. No projection conversion. Imported DBF attributes are not retained by this converter.')},{level:6});
}
export function download(bytes,name,type='application/octet-stream'){const u=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
