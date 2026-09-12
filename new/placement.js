// Author: Codex app agent, 2026-09-11. One placement controller for holes and labels.
import * as THREE from 'three';
import {modelState,invalidate} from './pipeline.js';
import {editShape,checkPlacement,textHeight} from './customize.js';
import {editsFor,saveEdits,undoEdits} from './edit-store.js';
export function setupPlacement(rebuild) {
 const $=id=>document.getElementById(id),message=text=>{$('placement-status').textContent=text;};
 let mode=null,preview=null,down=null,serial=0,last=null,canvas,pendingLabel=false;
 const fields=kind=>kind==='hole'?{kind,diameter:Number($('hole-diameter').value)}:{kind,text:$('label-text').value,size:Number($('label-size').value),height:Number($('label-height').value)};
 function clear(){serial++;if(preview){const v=modelState()?.view;v?.scene.remove(preview);preview.geometry.dispose();preview.material.dispose();preview=null;v?.requestRender();}}
 function cancel(){pendingLabel=false;mode=null;last=null;clear();$('hole-tool').ariaPressed='false';$('label-tool').ariaPressed='false';$('cancel-placement').disabled=true;message('Choose Place hole or Place label, or drag to orbit.');}
 function list(){const s=modelState();if(!s)return;const select=$('placement-list'),selected=select.value;select.replaceChildren();s.edits.forEach((e,i)=>{const o=document.createElement('option');o.value=i;o.textContent=e.kind==='hole'?`Hole ${i+1} · Ø ${e.diameter} mm`:`Label ${i+1} · ${e.text} · ${e.size} mm · ${textHeight(e)} mm raised`;select.append(o);});if([...select.options].some(o=>o.value===selected))select.value=selected;select.disabled=!s.edits.length;$('remove-placement').disabled=!s.edits.length;$('placement-list').onchange?.();}
 async function start(kind){
  if($('download-btn').disabled&&!pendingLabel){message('Create the current parameters before placing.');return;}
  try{const draft=fields(kind);await editShape({...draft,x:0,y:0},modelState().dims.mapSize);if(pendingLabel){await rebuild();if($('download-btn').disabled){message('Create the current parameters before placing.');return;}if(kind==='label'){$('label-text').value=draft.text;$('label-size').value=draft.size;$('label-height').value=draft.height;}}cancel();mode=kind;$('cancel-placement').disabled=false;if(matchMedia('(max-width:760px)').matches)document.querySelector('.model-workspace').scrollIntoView({block:'start'});$('hole-tool').ariaPressed=String(kind==='hole');$('label-tool').ariaPressed=String(kind==='label');message(`Move over an open face, then click to place ${kind}. Escape cancels; dragging orbits.`);}catch(e){message(e.message);}
 }
 async function candidate(event,paint=true){
  const s=modelState();if(!mode||!s||$('download-btn').disabled)return null;
  const r=canvas.getBoundingClientRect(),mouse=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(mouse,s.view.camera);const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-s.dims.baseHeight),new THREE.Vector3());
  if(!point)return null;
  const edit={...fields(mode),x:point.x/s.dims.mapSize,y:point.y/s.dims.mapSize},token=++serial;
  try{
   const shape=await editShape(edit,s.dims.mapSize);if(token!==serial)return null;
   let error;try{checkPlacement(shape,mode,s.regions,s.regions.holes||[],s.regions.labels||[],s.options.width);}catch(e){error=e.message;}
   if(paint){clear();const shapes=shape.map(p=>{const t=new THREE.Shape(p[0].map(([x,y])=>new THREE.Vector2(x,y)));t.holes=p.slice(1).map(r=>new THREE.Path(r.map(([x,y])=>new THREE.Vector2(x,y))));return t;});preview=new THREE.Mesh(new THREE.ShapeGeometry(shapes),new THREE.MeshBasicMaterial({color:error?0xc23636:0xe3a328,transparent:true,opacity:.7,side:THREE.DoubleSide,depthTest:false}));preview.position.z=s.dims.baseHeight+.03;preview.renderOrder=10;s.view.scene.add(preview);s.view.requestRender();message(error||`Click to place ${mode}; ${mode==='label'?`${textHeight(edit)} mm raised`:'full-depth cut'}.`);}
   return error?null:edit;
  }catch(e){message(e.message);return null;}
 }
 async function commit(edits){if(edits.length>16){message('At most 16 placements per source. Remove one first.');return;}const s=modelState();saveEdits(s.identity,edits);invalidate();cancel();await rebuild();list();}
 document.addEventListener('shp2stl-ready',()=>{cancel();list();const s=modelState();if(canvas)return;canvas=s.view.renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointermove',e=>{if(!mode||e.buttons)return;last=e;if(!canvas.previewFrame)canvas.previewFrame=requestAnimationFrame(()=>{canvas.previewFrame=null;candidate(last);});});
  canvas.addEventListener('pointerup',async e=>{if(e.button!==0||!mode||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const edit=await candidate(e,false);if(edit)await commit([...editsFor(modelState().identity),edit]);});
 });
 $('hole-tool').onclick=()=>start('hole');$('label-tool').onclick=()=>start('label');$('cancel-placement').onclick=cancel;
 document.querySelectorAll('input[id^=cfg-]').forEach(e=>e.addEventListener('input',cancel));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
 $('undo-placement').onclick=async()=>{const s=modelState();if(s&&undoEdits(s.identity)){invalidate();cancel();await rebuild();list();}};
 $('remove-placement').onclick=()=>{const s=modelState(),edits=editsFor(s.identity);edits.splice(Number($('placement-list').value),1);commit(edits);};
 $('placement-list').onchange=()=>{const e=modelState().edits[Number($('placement-list').value)];$('edit-label').disabled=e?.kind!=='label';if(e?.kind==='label'){$('label-text').value=e.text;$('label-size').value=e.size;$('label-height').value=textHeight(e);}};
 for(const id of ['label-text','label-size','label-height'])$(id).addEventListener('input',()=>{if(!mode&&modelState()?.edits[Number($('placement-list').value)]?.kind==='label'){pendingLabel=true;invalidate();}});
 $('edit-label').onclick=async()=>{const s=modelState(),edits=editsFor(s.identity),i=Number($('placement-list').value);if(edits[i]?.kind!=='label'){message('Select a label first.');return;}const edit={...edits[i],...fields('label')};try{const others=edits.filter((_,j)=>j!==i);const {customize}=await import('./customize.js');textHeight(edit);if(edit.text!==edits[i].text||edit.size!==edits[i].size)await customize(s.originalRegions,[...others,edit],s.options);edits[i]=edit;await commit(edits);}catch(e){message(e.message);}};
}
