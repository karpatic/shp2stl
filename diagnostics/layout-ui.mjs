// Author: Codex app agent · 2026-09-12. Focused comparison reveal checks.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function checkLayoutUI(page,out,log) {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();return {camera:s.view.camera.position.toArray(),target:s.view.controls.target.toArray(),zoom:s.view.map.getZoom(),center:s.view.map.getCenter(),counts:{...window.diagCounts}};});
 page.setDefaultTimeout(7000);
 const before=await state();
 const check=async()=>{await page.waitForTimeout(240);const r=await page.evaluate(async()=>{const b=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};const s=(await import('/new/pipeline.js')).modelState(),v=s.view;return {map:b('map-pane'),model:b('model-pane'),canvas:b('threejs'),drawer:b('config-panel'),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,aspect:v.camera.aspect,render:v.renderer.getSize(new window.THREE.Vector2()).toArray(),mapSize:v.map.getSize(),mapBox:b('map'),actions:b('download-btn')};});assert(!r.overflow);assert.equal(r.map.x,r.model.x);assert.equal(r.map.w,r.model.w);assert.deepEqual(r.map,r.model);assert.deepEqual(r.mapBox,r.canvas);assert(r.canvas.h>25);assert(Math.abs(r.aspect-Math.round(r.canvas.w)/Math.round(r.canvas.h))<.01);assert.equal(r.render[0],Math.round(r.canvas.w));assert(Math.abs(r.mapSize.y-r.mapBox.h)<1);assert(r.actions.bottom<=page.viewportSize().height);return r;};
 for(const [name,width,height] of [['desktop',1440,960],['mobile',390,844],['short',1280,540],['mobile-short',390,480],['landscape',844,390]]) {
  await page.setViewportSize({width,height});await check();
  for(const key of ['Home','End','Home']){await page.locator('#view-splitter').focus();await page.keyboard.press(key);const r=await check();const h=await page.locator('#view-splitter').boundingBox();assert.equal(h.height,r.map.h);assert(Math.abs(h.x+h.width/2-(key==='End'?r.map.w:0))<1);const hit=await page.evaluate(()=>{const r=document.getElementById('views').getBoundingClientRect();return document.elementFromPoint(r.width/2,r.y+r.height/2)?.closest('section')?.id;});assert.equal(hit,key==='End'?'map-pane':'model-pane');}
  for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await check();
  const routing=await page.evaluate(()=>{const r=document.getElementById('views').getBoundingClientRect();return [.25,.75].map(f=>document.elementFromPoint(r.x+r.width*f,r.y+r.height/2)?.closest('section')?.id);});assert.deepEqual(routing,['map-pane','model-pane']);
await page.screenshot({path:`${out}/${name}-closed.png`});
  await page.locator('#toggle-config').click();const r=await check();assert.equal(r.drawer.w,Math.min(380,r.map.w));assert.equal(r.drawer.x+r.drawer.w,r.map.x+r.map.w);await page.locator('#cfg-wallHeight').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}-open.png`});await page.locator('#cfg-wallHeight').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#toggle-config').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.id),'toggle-config');
 }
 await page.setViewportSize({width:1440,height:960});await check();
 const splitter=page.locator('#view-splitter');await splitter.focus();await page.keyboard.press('Home');await check();await page.screenshot({path:out+'/expanded-3d.png'});await page.keyboard.press('End');await check();await page.screenshot({path:out+'/expanded-map.png'});
 const box=await splitter.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-200,box.y+box.height/2,{steps:12});await page.mouse.up();await check();assert.equal(await splitter.evaluate(e=>e.hasPointerCapture(1)),false);
 log({kind:'layout-progress',stage:'mouse'});
 // Touch pointer capture/cancellation in Chromium via its input protocol.
 const cdp=await page.context().newCDPSession(page),t=await splitter.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x+t.width/2,y:t.y+12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:t.x-80,y:t.y+12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await check();await cdp.detach();
 log({kind:'layout-progress',stage:'touch'});
 const after=await state();assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.target,before.target);assert.equal(after.zoom,before.zoom);assert(Math.abs(after.center.lat-before.center.lat)<.002);assert.deepEqual(after.counts,before.counts);
 await page.waitForTimeout(500);const frames=await page.evaluate(()=>window.diagRenderCount);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.diagRenderCount),frames);
 // A wipe alone must not even render a frame or invalidate the map.
 await page.evaluate(async()=>{const v=(await import('/new/pipeline.js')).modelState().view;window.wipeResizes=0;for(const [o,k] of [[v.map,'invalidateSize'],[v.renderer,'setSize']]){const f=o[k];o[k]=function(...args){window.wipeResizes++;return f.apply(this,args);};}});
 for(const key of ['Home','End','Home']){await splitter.focus();await page.keyboard.press(key);await check();}
 assert.equal(await page.evaluate(()=>window.diagRenderCount),frames);assert.equal(await page.evaluate(()=>window.wipeResizes),0);
 // Actual map pan and orbit route independently across the half reveal.
 for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await check();
 const panBefore=await state();await page.mouse.move(250,400);await page.mouse.down();await page.mouse.move(300,430,{steps:8});await page.mouse.up();await page.waitForTimeout(500);const panAfter=await state();assert.notDeepEqual(panAfter.center,panBefore.center);assert.deepEqual(panAfter.camera,panBefore.camera);
 await page.mouse.move(1000,400);await page.mouse.down();await page.mouse.move(1050,430,{steps:8});await page.mouse.up();await page.waitForTimeout(700);const orbitAfter=await state();assert.notDeepEqual(orbitAfter.camera,panAfter.camera);assert.deepEqual(orbitAfter.center,panAfter.center);
 // Project a validated world point after resize, then place through the actual canvas.
 await page.locator('#toggle-config').click();await page.locator('#hole-tool').click();await page.waitForFunction(()=>document.querySelector('#hole-tool').ariaPressed==='true');
 log({kind:'layout-progress',stage:'armed'});
 const armed=await state();await page.locator('#customize-heading').click();await page.mouse.wheel(0,100);assert.deepEqual((await state()).camera,armed.camera);assert.equal(await page.locator('#placement-list option').count(),0);await page.locator('#toggle-config').click();
 await page.mouse.click(250,400);assert.equal(await page.locator('#placement-list option').count(),0);
 await splitter.focus();await page.keyboard.press('Home');await check();
 const dragState=await state();await page.mouse.move(8,400);await page.mouse.down();await page.mouse.move(180,400,{steps:8});await page.mouse.up();await check();assert.equal(await page.locator('#placement-list option').count(),0);assert.deepEqual((await state()).camera,dragState.camera);
 await splitter.focus();await page.keyboard.press('Home');await check();
 const point=await page.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState(),{circle,checkPlacement}=await import('/new/customize.js');for(let y=-65;y<65;y+=5)for(let x=-65;x<65;x+=5){try{checkPlacement(circle(x,y,3),'hole',s.regions,[],[],s.options.width);}catch{continue;}const p=new window.THREE.Vector3(x,y,s.dims.baseHeight).project(s.view.camera),r=s.view.renderer.domElement.getBoundingClientRect();if(Math.abs(p.x)>.85||Math.abs(p.y)>.85)continue;return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,world:[x/s.dims.mapSize,y/s.dims.mapSize]};}throw Error('No placement point');});
 log({kind:'layout-progress',stage:'placing',point});
 await page.mouse.move(point.x,point.y);await page.waitForTimeout(150);await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>document.querySelector('#placement-list').options.length===1,null,{timeout:4000}).catch(async e=>{throw Error(e.message+' '+await page.locator('#placement-status').innerText()+' '+JSON.stringify(await page.evaluate(({x,y})=>({hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,180),pressed:document.querySelector('#hole-tool').ariaPressed}),point)));});const edit=await page.evaluate(async()=>(await import('/new/pipeline.js')).modelState().edits[0]);assert(Math.abs(edit.x-point.world[0])<1e-6);assert(Math.abs(edit.y-point.world[1])<1e-6);
 await page.locator('#toggle-config').click();await page.locator('#undo-placement').click();await page.waitForFunction(()=>!document.querySelector('#download-btn').disabled&&document.querySelector('#placement-list').options.length===0);
 await page.locator('#cfg-baseHeight').fill('0');await page.locator('#create-btn').click();await page.waitForTimeout(100);assert(await page.locator('#download-btn').isDisabled());assert((await page.locator('#status').innerText()).length>20);await page.locator('#cfg-baseHeight').fill('6');await page.locator('#create-btn').click();await page.waitForFunction(()=>!document.querySelector('#download-btn').disabled);
 for(const [id,ext] of [['download-btn','stl'],['download-3mf-btn','3mf']]){const pending=page.waitForEvent('download');await page.locator('#'+id).click();await(await pending).saveAs(`${out}/restored.${ext}`);}
 assert(errors.every(e=>e.includes('height')||e.includes('Height')),errors.join('\n'));
 const result={author:'Codex app agent',date:'2026-09-12',overlappingAllViewports:true,pointerKeyboardTouch:true,cameraStable:true,noGeometryWork:true,idleFrames:0,placement:edit,failureRecovery:true,errors};writeFileSync(out+'/layout-ui.json',JSON.stringify(result,null,2));log({kind:'layout-ui',...result});
}
