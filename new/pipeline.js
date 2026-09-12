// Author: Codex app agent, 2026-09-11.
import * as THREE from 'three';
import { communityBoundaries } from './boundaries.js';
import { createLeafletMap, reprojectGeoJSON, scaleGeoJSON, getMinMaxCoordinates } from './leaflet.js';
import { createScene, exportToSTL } from './three.js';
import { prepareRegionInputs, heightRegions, layerGeometry, retargetGeometry, columnGeometry, retargetColumns } from './planar.js';
import { dimensions } from './dimensions.js';
import { exportTo3MF } from './3mf.js';
import { prepareDrawing, drawingRegions } from './local-drawing.js';
import { textHeight } from './customize.js';
import { editsFor } from './edit-store.js';
import { SessionCache } from './cache.js';

const sources = new SessionCache(3), geography = new SessionCache(3);
const footprints = new SessionCache(3, value => value.walls.dispose());
const regionsCache = new SessionCache(4), editsCache = new SessionCache(4);
const templates = new SessionCache(6, t => {t.complete.dispose(); t.base.dispose();t.labels?.dispose();if(t.ownWalls)t.walls.dispose();});
let view, current, revision = 0, wallKey, mapKey;
export const modelState = () => current;
const localSources = new Map();
export async function registerSource(json) {
 const text=JSON.stringify(json),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,"0")).join("");
 const url="local:"+hash;localSources.delete(url);localSources.set(url,{json,identity:url+"#"+hash});
 while(localSources.size>3)localSources.delete(localSources.keys().next().value);return url;
}
const buttons = () => ['download-btn','download-3mf-btn'].map(id => document.getElementById(id)).filter(Boolean);
const mark = (name, start) => globalThis.shp2stlDiagnostic?.({name, ms:performance.now()-start});
const measure = (name, fn) => {const start = performance.now(); const value = fn(); mark(name,start); return value;};
async function measured(name, fn) {const start = performance.now(); const value = await fn(); mark(name,start); return value;}
const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export function invalidate() { revision++; buttons().forEach(b => b.disabled = true); }

async function source(url, refresh) {
  if (localSources.has(url)) return localSources.get(url);
  if (url.startsWith("local:")) throw Error("Reimport this local file to restore its source");
  if (refresh) sources.delete(url);
  return sources.get(url, signal => measured('fetch', async () => {
    const response = await fetch(url, {signal, cache:refresh ? 'reload' : 'default'});
    if (!response.ok) throw Error(`Source request failed (${response.status})`);
    const text = await response.text();
    if(text.length>10*1024*1024)throw Error("Source exceeds 10 MB");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))), n=>n.toString(16).padStart(2,'0')).join('');
    const {validateGeoJSON}=await import("./file-formats.js");
    return {json:validateGeoJSON(JSON.parse(text)), identity:url+'#'+hash};
  }));
}
function prepare(source, options) {
  if(source.json.shp2stl?.coordinates==='local-mm')return prepareDrawing(source.json,options);
  // Reprojection mutates its inputs; never hand the cached source to that code.
  const data = communityBoundaries(structuredClone(source.json), options);
  const bounds = L.geoJSON(data.geojson).getBounds(), center = bounds.getCenter();
  for (const value of Object.values(data)) if (value?.type === 'FeatureCollection') reprojectGeoJSON(value, center);
  const minMax = getMinMaxCoordinates(data.sourceExterior || data.hull);
  for (const value of Object.values(data)) if (value?.type === 'FeatureCollection') scaleGeoJSON(value, minMax, options.mapSize ?? 200);
  return {...data,center,minMax,mapBounds:[[bounds.getSouth(),bounds.getWest()],[bounds.getNorth(),bounds.getEast()]]};
}
function compile(regions, wallTemplate) {
  const levels = dimensions({}).levels;
  let complete, base, walls;
  try {
    complete = layerGeometry(regions.layers, levels, regions.caps);
    base = layerGeometry(regions.layers.slice(0,2), levels.slice(0,3), regions.caps ? [regions.caps[0],regions.caps[1],{up:regions.layers[1],down:[]}] : undefined);
    walls = wallTemplate;
    const p = complete.attributes.position, index = complete.index.array;
    const colors = new Float32Array(index.length*3);
    const wallColor = new THREE.Color(0x46959a), floorColor = new THREE.Color(0xdce5e5);
    for (let i=0;i<index.length;i+=3) {
      const color = Math.max(p.getZ(index[i]),p.getZ(index[i+1]),p.getZ(index[i+2]))>levels[2] ? wallColor : floorColor;
      for (let j=0;j<3;j++) color.toArray(colors,(i+j)*3);
    }
    return {regions,complete,base,walls,colors};
  } catch(error) {complete?.dispose();base?.dispose();throw error;}
}
function output(template, dims, heights) {
  if(template.custom)return outputCustom(template,dims,heights);
  let complete,base,walls,preview;
  try {
    complete=retargetGeometry(template.complete,template.regions.layers,dims.levels);
    base=retargetGeometry(template.base,template.regions.layers.slice(0,2),dims.levels.slice(0,3));
    walls=retargetGeometry(template.walls,[template.regions.layers[2]],dims.levels.slice(2));
    preview=complete.toNonIndexed(); preview.computeVertexNormals();
    preview.setAttribute('color',new THREE.BufferAttribute(template.colors.slice(),3));
    preview.computeBoundingBox();preview.computeBoundingSphere();
    return {complete,base,walls,preview};
  } catch(error) {complete?.dispose();base?.dispose();walls?.dispose();preview?.dispose();throw error;}
}
function dispose(output) { if(output) for(const key of ['complete','base','walls','labels','preview']) output[key]?.dispose(); }
function getView() {
  if (view) return view;
  const {map} = createLeafletMap(), scene = createScene('threejs');
  scene.scene.add(new THREE.AmbientLight(0xffffff,.8));
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshPhongMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}));
  scene.scene.add(mesh);
  view = {...scene,map,mesh};
  document.getElementById('download-btn').onclick = () => {if(current) exportToSTL(current.exportModel);};
  const button=document.getElementById('download-3mf-btn');
  if(button) button.onclick=()=>{try {if(current) exportTo3MF(current);} catch(error) {invalidate();document.getElementById('status').textContent=`Export failed: ${error.message}. Create to retry.`;}};
  return view;
}
export async function build(options, {refresh=false} = {}) {
  const token = ++revision, dims = dimensions(options), start=performance.now();
  options = {...options, sourceTopology:true};
  buttons().forEach(b=>b.disabled=true);
  const valid=()=>token===revision;
  const status=document.getElementById('status');
  if(status) status.textContent=refresh?'Refreshing source…':'Creating…';
  await paint(); if(!valid()) return false;
  const url = new URL(options.geoJsonUrl, location.href).href;
  const data = await source(url,refresh); if(!valid()) return false;
  // Source content hash plus every preprocessing input. Fixed pipeline version is
  // implicit in this module lifetime; no geometry survives a page/code reload.
  const geoKey=JSON.stringify([data.identity,options.width,options.simplifyBy,options.simplifyHullBy,dims.mapSize]);
  const regionKey=JSON.stringify([geoKey,options.islandConnections,options.islandConnections==='connections'?dims.minConnectorWidth:null]);
  const edits=editsFor(data.identity),heights=edits.filter(e=>e.kind==='label').map(textHeight);
  const editKey=JSON.stringify([regionKey,edits.map(({height,...xy})=>xy)]);
  const templateKey=edits.length?editKey:regionKey;
  const readyKey=JSON.stringify([templateKey,dims.levels,heights]);
  if(current?.key===readyKey) {
    readback(dims,current.prepared); buttons().forEach(b=>b.disabled=false); mark('readyReuse',start); return true;
  }
  const prepared=await geography.get(geoKey,()=>measure('geography',()=>prepare(data,options))); if(!valid()) return false;
  const staticRegions=await footprints.get(geoKey,()=>{
    const inputs=measure('wallXY',()=>prepared.local?{L:prepared.L}:prepareRegionInputs(prepared,options));
    const walls=measure('wallTemplate',()=>layerGeometry([inputs.L],dimensions({}).levels.slice(2)));
    return {inputs,walls};
  }); if(!valid()) return false;
  const originalRegions=await regionsCache.get(regionKey,()=>measure('regions',()=>prepared.local?drawingRegions(prepared):heightRegions(prepared,options,staticRegions.inputs))); if(!valid())return false;
  const edited=edits.length?await editsCache.get(editKey,async()=>{
    const {customize}=await import('./customize.js');
    return measured('customXY',()=>customize(originalRegions,edits,options));
  }):originalRegions; if(!valid())return false;
  const template=await templates.get(templateKey,async()=>{
    if(!edits.length)return measure('template',()=>compile(originalRegions,staticRegions.walls));
    return measure('template',()=>compileCustom(edited));
  }); if(!valid())return false;
  const result=measure('heightCompute',()=>output(template,dims,heights));
  if(!valid()) {dispose(result);return false;}
  const v=getView();
  if(current?.dims.mapSize!==dims.mapSize){v.controls.target.set(0,0,0);v.camera.position.set(0,0,Math.max(dims.mapSize,40));v.controls.update();}
  const note=document.getElementById('local-note');if(note)note.hidden=!prepared.local;
  document.getElementById('map').classList.toggle('local-drawing',!!prepared.local);
  document.querySelector('.container').classList.toggle('drawing-source',!!prepared.local);
  if(prepared.local){v.wallLayer?.remove();wallKey=null;}
  if(!prepared.local && wallKey!==geoKey) {
    v.map.invalidateSize();
    measure('svg',()=>{
      const {minMax,center}=prepared;
      const factor=Math.max(minMax.maxX-minMax.minX,minMax.maxY-minMax.minY)/dims.mapSize;
      const cx=(minMax.minX+minMax.maxX)/2,cy=(minMax.minY+minMax.maxY)/2,cos=Math.cos(center.lat*Math.PI/180);
      const coordinates=template.regions.layers[2].map(p=>p.map(r=>r.map(([x,y])=>[(x*factor+cx)/cos+center.lng,y*factor+cy+center.lat])));
      v.wallLayer?.remove();v.wallLayer=L.geoJSON({type:'MultiPolygon',coordinates},{stroke:false,fillColor:'#004433',fillOpacity:1}).addTo(v.map);
      if(mapKey!==data.identity) v.map.fitBounds(prepared.mapBounds);
      mapKey=data.identity;wallKey=geoKey;
    });
  }
  if(!current) v.mesh.geometry.dispose();
  v.mesh.geometry=result.preview;
  dispose(current);
  const exportModel=new THREE.Mesh(result.complete);exportModel.updateMatrixWorld();
  current={...result,key:readyKey,exportModel,prepared,identity:data.identity,dims,options,regions:edited,originalRegions,edits,view:v};
  document.dispatchEvent(new CustomEvent("shp2stl-ready"));
  v.requestRender();readback(dims,prepared);
  document.getElementById('download-btn').dataset.islandConnections=options.islandConnections;
  buttons().forEach(b=>b.disabled=false);
  // Optional diagnostic hook is read-only and absent during normal app use.
  globalThis.shp2stlInspect?.({view:v,regions:template.regions,prepared,dimensions:dims,options,validation:result.complete.userData.validation});
  mark('exportReady',start);
  await paint(); if(valid()) mark('painted',start);
  return valid();
}
function readback(dims,prepared) {
  const el=document.getElementById('dimension-readback');
  if(prepared?.local){if(el)el.textContent=`Applied: local drawing ${dims.mapSize} mm maximum XY extent; base ${dims.baseHeight} mm + perimeter walls ${dims.wallHeight} mm. Wall width ${current?.options.width ?? .5} mm. No geographic grooves, island filtering or connectors are added.`;return;}
  if(el) el.textContent=`Applied: map ${dims.mapSize} mm maximum XY extent; base ${dims.baseHeight} mm + walls ${dims.wallHeight} mm = ${dims.baseHeight+dims.wallHeight} mm wall top; ${dims.baseHeight+Math.max(dims.wallHeight,...(current?.edits||[]).filter(e=>e.kind==='label').map(textHeight))} mm overall height. Underside grooves: ${Number((dims.baseHeight*.3).toFixed(6))} mm deep (30% of base); ${Number((dims.baseHeight*.7).toFixed(6))} mm floor remains above them. Connector minimum: ${dims.minConnectorWidth} mm.`;
}

function compileCustom(regions) {
 const t={custom:true,ownWalls:true,regions};
 try {
  t.layers=[...regions.layers.slice(0,2),regions.raised||regions.layers[2]];
  t.columns=[regions.layers[2],...regions.labelShapes];
  t.complete=columnGeometry(t.layers,dimensions({}).levels,t.columns);
  t.base=layerGeometry(regions.layers.slice(0,2),dimensions({}).levels.slice(0,3));
  t.walls=layerGeometry([regions.layers[2]],[6,12]);
  if(regions.labels.length)t.labels=columnGeometry([regions.labels],[6,12],regions.labelShapes);
  return t;
 }catch(e){for(const k of ['complete','base','walls','labels'])t[k]?.dispose();throw e;}
}
function outputCustom(t,dims,heights) {
 const result={},tops=heights.map(h=>Math.fround(dims.baseHeight+h));
 try {
  result.complete=retargetColumns(t.complete,t.layers,dims.levels,[dims.levels[3],...tops]);
  result.base=retargetGeometry(t.base,t.regions.layers.slice(0,2),dims.levels.slice(0,3));
  result.walls=retargetGeometry(t.walls,[t.regions.layers[2]],dims.levels.slice(2));
  if(t.labels)result.labels=retargetColumns(t.labels,[t.regions.labels],dims.levels.slice(2),tops);
  result.preview=result.complete.toNonIndexed();result.preview.computeVertexNormals();
  const p=result.preview.attributes.position,colors=[];
  for(let i=0;i<p.count;i+=3){const high=Math.max(p.getZ(i),p.getZ(i+1),p.getZ(i+2))>dims.baseHeight;
   const c=new THREE.Color(high?0x46959a:0xdce5e5);for(let j=0;j<3;j++)colors.push(c.r,c.g,c.b);}
  result.preview.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return result;
 }catch(e){dispose(result);throw e;}
}
