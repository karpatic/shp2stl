// Author: Codex app agent, 2026-09-11.
import * as THREE from 'three';
import { communityBoundaries } from './boundaries.js';
import { createLeafletMap, reprojectGeoJSON, scaleGeoJSON, getMinMaxCoordinates } from './leaflet.js';
import { createScene, exportToSTL } from './three.js';
import { prepareRegionInputs, heightRegions, layerGeometry, retargetGeometry } from './planar.js';
import { dimensions } from './dimensions.js';
import { exportTo3MF } from './3mf.js';
import { SessionCache } from './cache.js';

const sources = new SessionCache(3), geography = new SessionCache(3);
const footprints = new SessionCache(3, value => value.walls.dispose());
const templates = new SessionCache(6, t => {t.complete.dispose(); t.base.dispose();});
let view, current, revision = 0, wallKey, mapKey;
const buttons = () => ['download-btn','download-3mf-btn'].map(id => document.getElementById(id)).filter(Boolean);
const mark = (name, start) => globalThis.shp2stlDiagnostic?.({name, ms:performance.now()-start});
const measure = (name, fn) => {const start = performance.now(); const value = fn(); mark(name,start); return value;};
async function measured(name, fn) {const start = performance.now(); const value = await fn(); mark(name,start); return value;}
const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export function invalidate() { revision++; buttons().forEach(b => b.disabled = true); }

async function source(url, refresh) {
  if (refresh) sources.delete(url);
  return sources.get(url, signal => measured('fetch', async () => {
    const response = await fetch(url, {signal, cache:refresh ? 'reload' : 'default'});
    if (!response.ok) throw Error(`Source request failed (${response.status})`);
    const text = await response.text();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))), n=>n.toString(16).padStart(2,'0')).join('');
    return {json:JSON.parse(text), identity:url+'#'+hash};
  }));
}
function prepare(source, options) {
  // Reprojection mutates its inputs; never hand the cached source to that code.
  const data = communityBoundaries(structuredClone(source.json), options);
  const bounds = L.geoJSON(data.geojson).getBounds(), center = bounds.getCenter();
  for (const value of Object.values(data)) if (value?.type === 'FeatureCollection') reprojectGeoJSON(value, center);
  const minMax = getMinMaxCoordinates(data.sourceExterior || data.hull);
  for (const value of Object.values(data)) if (value?.type === 'FeatureCollection') scaleGeoJSON(value, minMax);
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
function output(template, dims) {
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
function dispose(output) { if(output) for(const key of ['complete','base','walls','preview']) output[key].dispose(); }
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
  const geoKey=JSON.stringify([data.identity,options.width,options.simplifyBy,options.simplifyHullBy]);
  const regionKey=JSON.stringify([geoKey,options.islandConnections,options.islandConnections==='connections'?dims.minConnectorWidth:null]);
  const readyKey=JSON.stringify([regionKey,dims.levels]);
  if(current?.key===readyKey) {
    readback(dims); buttons().forEach(b=>b.disabled=false); mark('readyReuse',start); return true;
  }
  const prepared=await geography.get(geoKey,()=>measure('geography',()=>prepare(data,options))); if(!valid()) return false;
  const staticRegions=await footprints.get(geoKey,()=>{
    const inputs=measure('wallXY',()=>prepareRegionInputs(prepared,options));
    const walls=measure('wallTemplate',()=>layerGeometry([inputs.L],dimensions({}).levels.slice(2)));
    return {inputs,walls};
  }); if(!valid()) return false;
  const template=await templates.get(regionKey,()=>{
    const regions=measure('regions',()=>heightRegions(prepared,options,staticRegions.inputs));
    return measure('template',()=>compile(regions,staticRegions.walls));
  }); if(!valid()) return false;
  const result=measure('heightCompute',()=>output(template,dims));
  if(!valid()) {dispose(result);return false;}
  const v=getView();
  if(wallKey!==geoKey) {
    measure('svg',()=>{
      const {minMax,center}=prepared;
      const factor=Math.max(minMax.maxX-minMax.minX,minMax.maxY-minMax.minY)/200;
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
  current={...result,key:readyKey,exportModel};
  v.requestRender();readback(dims);
  document.getElementById('download-btn').dataset.islandConnections=options.islandConnections;
  buttons().forEach(b=>b.disabled=false);
  // Optional diagnostic hook is read-only and absent during normal app use.
  globalThis.shp2stlInspect?.({view:v,regions:template.regions,prepared,dimensions:dims,options,validation:result.complete.userData.validation});
  mark('exportReady',start);
  await paint(); if(valid()) mark('painted',start);
  return valid();
}
function readback(dims) {
  const el=document.getElementById('dimension-readback');
  if(el) el.textContent=`Applied: base ${dims.baseHeight} mm + walls ${dims.wallHeight} mm = ${dims.baseHeight+dims.wallHeight} mm total. Underside grooves: ${Number((dims.baseHeight*.3).toFixed(6))} mm deep (30% of base); ${Number((dims.baseHeight*.7).toFixed(6))} mm floor remains above them. Connector minimum: ${dims.minConnectorWidth} mm.`;
}
