// Author: Codex app agent, 2026-09-12. Focused extension of the existing browser runner.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export async function checkTextHeightUI(page,out,log){
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#download-btn').disabled&&!document.querySelector('#download-3mf-btn').disabled);
 const state=()=>page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();return {edits:s.edits,dims:s.dims,camera:s.view.camera.position.toArray(),target:s.view.controls.target.toArray(),validation:s.complete.userData.validation};});
 if(await page.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#toggle-config').click();
 await page.locator('#view-splitter').focus();await page.keyboard.press('Home');
 const apply=async fields=>{for(const [k,v]of Object.entries(fields))await page.locator('#cfg-'+k).fill(String(v));await page.locator('#create-btn').click();await ready();};
 await apply({mapSize:80,wallHeight:.8});
 assert.equal(await page.locator('#label-height').inputValue(),'0.8');
 async function place(text,height){
  await page.locator('#label-text').fill(text);await page.locator('#label-size').fill('4');await page.locator('#label-height').fill(String(height));
  const point=await page.evaluate(async ({text,height})=>{const s=(await import('/new/pipeline.js')).modelState(),{editShape,checkPlacement}=await import('/new/customize.js');for(let y=-30;y<30;y+=3)for(let x=-30;x<30;x+=3){try{const shape=await editShape({kind:'label',text,size:4,height,x:x/80,y:y/80},80);checkPlacement(shape,'label',s.regions,[],s.regions.labels||[],.5);const p=new window.THREE.Vector3(x,y,s.dims.baseHeight).project(s.view.camera),r=s.view.renderer.domElement.getBoundingClientRect();return {x,y,z:s.dims.baseHeight};}catch{}}throw Error('No label position');},{text,height});
  const count=(await state()).edits.length;await page.locator('#label-tool').click();await page.waitForFunction(()=>document.querySelector('#label-tool').getAttribute('aria-pressed')==='true');await page.locator('#toggle-config').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const screen=await page.evaluate(async point=>{const s=(await import('/new/pipeline.js')).modelState(),p=new window.THREE.Vector3(point.x,point.y,point.z).project(s.view.camera),r=s.view.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},point);await page.mouse.move(screen.x,screen.y);await page.mouse.click(screen.x,screen.y);await page.waitForFunction(n=>document.querySelector('#placement-list').options.length===n,count+1);await ready();await page.locator('#toggle-config').click();
 }
 async function capture(name){assert(await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState(),p=s.preview.attributes.position.array,q=s.complete.attributes.position.array,ids=s.complete.index.array;return p.every((v,i)=>v===q[ids[Math.floor(i/3)]*3+i%3]);}),'Painted mesh must match the unified export');const dir=out+'/'+name;mkdirSync(dir,{recursive:true});for(const [id,ext]of [['download-btn','stl'],['download-3mf-btn','3mf']]){const wait=page.waitForEvent('download');await page.locator('#'+id).click();await(await wait).saveAs(dir+'/scene.'+ext);}writeFileSync(dir+'/state.json',JSON.stringify({...await state(),regions:await page.evaluate(async()=>(await import('/new/pipeline.js')).modelState().regions)}));}
 await place('BO',.8);await place('A',1.6);assert.deepEqual((await state()).edits.map(e=>e.height),[.8,1.6]);await page.locator('#placement-list').selectOption('1');await page.locator('#label-height').fill('.8');await page.locator('#edit-label').click();await ready();await capture('default-labels');
 const before=await state(),counts=await page.evaluate(()=>({...window.diagCounts}));
 await page.locator('#placement-list').selectOption('1');
 await page.locator('#label-height').fill('0');await page.locator('#edit-label').click();assert(await page.locator('#download-btn').isDisabled());assert(await page.locator('#download-3mf-btn').isDisabled());assert.match(await page.locator('#placement-status').textContent(),/0.01 and 200/);assert.deepEqual((await state()).edits,before.edits);
 await page.locator('#label-height').fill('1.6');await page.locator('#edit-label').click();await ready();
 const changed=await state();assert.equal(changed.edits[0].height,.8);assert.equal(changed.edits[1].height,1.6);assert.deepEqual(changed.camera,before.camera);assert.deepEqual(changed.target,before.target);assert.equal(await page.locator('#placement-list').inputValue(),'1');await capture('different-labels');
 for(const wallHeight of [.4,1.6,3.5]){await apply({wallHeight});await capture('wall-'+wallHeight);}
 await apply({baseHeight:2.5,wallHeight:.8});await capture('base-2.5');
 const delta=await page.evaluate(b=>Object.fromEntries(Object.entries(window.diagCounts).map(([k,v])=>[k,v-(b[k]||0)]).filter(([,v])=>v)),counts);
 for(const k of ['fetch','geography','wallXY','regions','template','xyBoolean','islandBase','layerGeometry','customXY','communityBoundaries'])assert(!delta[k],`Text Z repeated ${k}`);
 await page.locator('#undo-placement').click();await ready();assert.deepEqual((await state()).edits.map(e=>e.height),[.8,.8]);
 await page.locator('#placement-list').selectOption('1');await page.locator('#label-height').fill('1.6');await page.locator('#edit-label').click();await ready();
 await page.locator('#remove-placement').click();await ready();assert.equal((await state()).edits.length,1);await page.locator('#undo-placement').click();await ready();assert.deepEqual((await state()).edits.map(e=>e.height),[.8,1.6]);
 await page.reload();await ready();if(await page.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#toggle-config').click();assert.deepEqual((await state()).edits.map(e=>e.height),[.8,1.6]);await page.locator('#placement-list').selectOption('1');assert.equal(await page.locator('#label-height').inputValue(),'1.6');
 // Migrate a genuinely old saved placement, leaving the other height intact.
 await page.evaluate(()=>{const key='shp2stl.placements.v1',v=JSON.parse(localStorage.getItem(key));for(const edits of Object.values(v))delete edits[0].height;localStorage.setItem(key,JSON.stringify(v));});await page.reload();await ready();if(await page.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#toggle-config').click();assert.deepEqual((await state()).edits.map(e=>e.height),[.8,1.6]);
 // One painted close side view of the actual production preview.
 await page.locator('#toggle-config').click();await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();s.view.controls.target.set(-1,-27,3);s.view.camera.position.set(-1,-53,12);s.view.controls.update();s.view.requestRender();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 await page.locator('#threejs').screenshot({path:out+'/text-height-side.png'});
 writeFileSync(out+'/text-height.json',JSON.stringify({author:'Codex app agent',date:'2026-09-12',delta,final:await state()},null,2));log({kind:'text-height-pass',delta});
}
