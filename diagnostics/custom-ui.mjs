// Author: Codex app agent, 2026-09-11. Real UI actions on existing bounded harness.
import assert from 'node:assert/strict';import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
export async function checkCustomUI(page,out,log,city){
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#download-btn').disabled);
 if(await page.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#toggle-config').click();
 async function apply(fields){for(const [key,value] of Object.entries(fields))await page.locator('#cfg-'+key).fill(String(value));await page.locator('#create-btn').click();await ready();}
 if(city==='baltimore'){
  await page.locator('#cfg-mapSize').fill('40');await page.locator('#create-btn').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('continuous broad engagement'));
  assert(await page.locator('#download-btn').isDisabled());log({kind:'size40-minimum-rejected',minimum:1.2});
  await page.locator('#cfg-islandConnections').selectOption('hull');await ready();
 }else await apply({mapSize:40});
 async function capture(name){const path=out+'/'+name;mkdirSync(path,{recursive:true});for(const [id,ext] of [['download-btn','stl'],['download-3mf-btn','3mf']]){const wait=page.waitForEvent('download');await page.locator('#'+id).click();await(await wait).saveAs(path+'/scene.'+ext);}
  writeFileSync(path+'/regions.json',JSON.stringify(await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();return {regions:s.regions,original:s.originalRegions,dimensions:s.dims,edits:s.edits,options:s.options};})));
 }
 await capture('size40');
 if(city==='baltimore'){log({kind:'size40-hull-recovery',width:.5,minimum:1.2});return;}
 async function point(kind){return page.evaluate(async kind=>{const s=(await import('/new/pipeline.js')).modelState(),{editShape,checkPlacement}=await import('/new/customize.js');for(let y=-16;y<=16;y+=1.5)for(let x=-16;x<=16;x+=1.5){const edit=kind==='hole'?{kind,diameter:3,x:x/40,y:y/40}:{kind,text:'BOA',size:2,x:x/40,y:y/40};try{const shape=await editShape(edit,40);checkPlacement(shape,kind,s.regions,s.regions.holes||[],s.regions.labels||[],.5);const p=new window.THREE.Vector3(x,y,s.dims.baseHeight).project(s.view.camera),r=s.view.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,edit};}catch{}}throw Error('No placement found');},kind);}
 await page.locator('#hole-tool').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#hole-tool').getAttribute('aria-pressed'),'false');
 const hole=await point('hole');await page.locator('#hole-tool').click();await page.mouse.move(hole.x,hole.y);await page.waitForTimeout(150);await page.mouse.click(hole.x,hole.y);await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===1);await capture('hole');
 await page.locator('#remove-placement').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===0);await capture('removed');assert.deepEqual(readFileSync(out+'/size40/scene.stl'),readFileSync(out+'/removed/scene.stl'));
 await page.locator('#undo-placement').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===1);
 await page.locator('#label-text').fill('BOA');await page.locator('#label-size').fill('2');
 const label=await point('label');await page.locator('#label-tool').click();await page.mouse.move(label.x,label.y);await page.waitForTimeout(150);await page.mouse.click(label.x,label.y);await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===2);await capture('decorated');
 await page.locator('#placement-list').selectOption('1');await page.locator('#label-text').fill('B?');await page.locator('#edit-label').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options[1].textContent.includes('B?'));
 await page.locator('#undo-placement').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options[1].textContent.includes('BOA'));
 const before=await page.evaluate(()=>({...window.diagCounts}));await apply({baseHeight:2.5,wallHeight:3.5});await capture('height');
 const counts=await page.evaluate(before=>Object.fromEntries(Object.entries(window.diagCounts).map(([k,v])=>[k,v-(before[k]||0)]).filter(([,v])=>v)),before);
 for(const k of ['geography','wallXY','regions','template','xyBoolean','islandBase','layerGeometry','customXY'])assert(!counts[k],`Height repeated ${k}`);
 const crossBefore=await page.evaluate(()=>({...window.diagCounts}));for(const wallHeight of [.4,.8,3.5])await apply({wallHeight});
 const crossing=await page.evaluate(b=>Object.fromEntries(Object.entries(window.diagCounts).map(([k,v])=>[k,v-(b[k]||0)])),crossBefore);for(const k of ['geography','wallXY','regions','template','xyBoolean','islandBase','layerGeometry','customXY'])assert(!crossing[k],`Emboss crossing repeated ${k}`);
 // Invalid label text and an edge placement produce useful feedback, no mutation.
 await page.locator('#label-text').fill('🚀');await page.locator('#label-tool').click();await page.waitForFunction(()=>document.querySelector('#placement-status').textContent.includes('Unsupported'));
 await page.locator('#hole-tool').click();const r=await page.locator('#threejs canvas').boundingBox();await page.mouse.click(r.x+5,r.y+5);assert.equal(await page.locator('#placement-list option').count(),2);await page.keyboard.press('Escape');
 // The same stored source-relative centers scale; diameters and glyph size do not.
 const physical=await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();const bounds=p=>{const points=p.flat(2);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};return {hole:bounds(s.regions.holes),label:bounds(s.regions.labels),edits:s.edits};});
 await apply({mapSize:80});
 const enlarged=await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();const bounds=p=>{const points=p.flat(2);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};return {hole:bounds(s.regions.holes),label:bounds(s.regions.labels),edits:s.edits};});
 assert.deepEqual(enlarged.edits,physical.edits);for(const key of ['hole','label']){assert(Math.abs(enlarged[key][2]-enlarged[key][0]-(physical[key][2]-physical[key][0]))<.00001);assert(Math.abs(enlarged[key][0]+enlarged[key][2]-2*(physical[key][0]+physical[key][2]))<.00001);}
 await apply({mapSize:40,baseHeight:6,wallHeight:6});await page.locator('#placement-list').selectOption('1');await page.locator('#remove-placement').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===1);await capture('label-removed');assert.deepEqual(readFileSync(out+'/hole/scene.stl'),readFileSync(out+'/label-removed/scene.stl'));
 await page.locator('#undo-placement').click();await ready();await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===2);await apply({baseHeight:2.5,wallHeight:3.5});
 // Test a wall conflict by choosing an actual near-wall candidate, then clicking it.
 const conflict=await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState(),{circle,checkPlacement}=await import('/new/customize.js');for(let y=-15;y<15;y+=1.5)for(let x=-15;x<15;x+=1.5){try{checkPlacement(circle(x,y,3),'hole',s.regions);}catch(e){if(!e.message.includes('wall'))continue;const p=new window.THREE.Vector3(x,y,s.dims.baseHeight).project(s.view.camera),r=s.view.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}}throw Error('No wall conflict found');});
 await page.locator('#hole-tool').click();await page.mouse.move(conflict.x,conflict.y);await page.waitForTimeout(150);await page.mouse.click(conflict.x,conflict.y);await page.waitForFunction(()=>document.querySelector('#placement-status').textContent.includes('wall'));assert.equal(await page.locator('#placement-list option').count(),2);await page.keyboard.press('Escape');
 await page.locator('#toggle-config').click();await page.screenshot({path:out+'/keychain.png'});
 writeFileSync(out+'/custom-ui.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',city,hole,label,counts},null,2));log({kind:'custom-ui',city,hole,label,counts});
}
