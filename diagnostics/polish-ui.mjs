// Author: Codex app agent · 2026-09-11. Bounded presentation checks on the existing actual-app harness.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
export async function checkPolishUI(page,out,log){
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#download-btn').disabled);
 const snapshot=()=>page.evaluate(()=>({camera:window.diagControls.object.position.toArray(),target:window.diagControls.target.toArray(),counts:{...window.diagCounts}}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const before=await snapshot();await page.locator('#toggle-config').click();await page.waitForTimeout(200);await page.locator('#toggle-config').click();await page.waitForTimeout(200);const after=await snapshot();assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.target,before.target);assert.deepEqual(after.counts,before.counts);
 await page.locator('#toggle-config').click();
 await page.screenshot({path:out+'/desktop.png'});
 await page.locator('#customize-heading').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/settings-customize.png'});
 await page.locator('#advanced-details summary').click();await page.locator('#cfg-simplifyBy').focus();assert(await page.locator('#cfg-simplifyBy').isVisible());await page.locator('#advanced-details summary').click();
 await page.setViewportSize({width:1280,height:540});await page.locator('#import-file').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/short-desktop.png'});assert(await page.locator('#download-btn').isVisible());
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:out+'/compact-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#cfg-geoJsonUrl').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/mobile-settings.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#toggle-config').click();await page.screenshot({path:out+'/mobile-collapsed.png'});await page.locator('#toggle-config').click();
 await page.locator('#hole-tool').click();await page.waitForFunction(()=>document.querySelector('#hole-tool').getAttribute('aria-pressed')==='true');assert(await page.locator('#cancel-placement').isVisible());await page.screenshot({path:out+'/mobile-armed.png'});await page.locator('#cancel-placement').click();assert.equal(await page.locator('#hole-tool').getAttribute('aria-pressed'),'false');
 // Reduced visual viewport approximates a software keyboard, with the field and actions still reachable.
 await page.setViewportSize({width:390,height:480});await page.locator('#cfg-wallHeight').focus();await page.locator('#cfg-wallHeight').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/mobile-keyboard-height.png'});await page.locator('#create-btn').click();await ready();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:960});await page.locator('#cfg-geoJsonUrl').scrollIntoViewIfNeeded();
 const local = await page.context().newPage();await local.goto(new URL('/index.html',page.url()).href);await local.screenshot({path:out+'/home-desktop.png',fullPage:true});await local.setViewportSize({width:390,height:844});await local.screenshot({path:out+'/home-mobile.png',fullPage:true});assert(await local.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await local.locator('script').count(),0);assert((await local.locator('a', {hasText:'Open builder'}).getAttribute('href')).endsWith('app.html'));
 await local.locator('nav a',{hasText:'SVG converter'}).click();assert(await local.locator('#svg-file').isVisible());await local.screenshot({path:out+'/converter-mobile.png',fullPage:true});await local.close();
 // A genuine app render of public DC boundaries. Change only the review camera for the image.
 await page.locator('#toggle-config').click();await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{window.diagControls.target.set(0,0,3);window.diagControls.object.position.set(70,-135,210);window.diagControls.update();});await page.waitForTimeout(600);
 await page.locator('#threejs canvas').screenshot({path:out+'/dc-preview.png'});
 // Save the second actual export alongside the harness STL for before/after parity.
 const download=page.waitForEvent('download');await page.locator('#download-3mf-btn').click();await(await download).saveAs(out+'/scene.3mf');
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(out+'/polish-ui.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',cameraPreserved:true,styleChangesDidNotBuild:true,noHorizontalOverflow:true,errors},null,2));log({kind:'polish-ui',cameraPreserved:true,styleChangesDidNotBuild:true});
}
