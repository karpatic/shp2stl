// Author: Codex app agent, 2026-09-11. Extends the existing bounded browser run.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';

export async function checkDimensionsUI(page, out, log, dataset) {
  const camera = () => page.evaluate(() => ({position:window.diagControls.object.position.toArray(),target:window.diagControls.target.toArray()}));
  const enabled = () => page.waitForFunction(() => !document.querySelector('#download-btn').disabled && !document.querySelector('#download-3mf-btn').disabled);
  const disabled = async () => {
    assert(await page.locator('#download-btn').isDisabled());
    assert(await page.locator('#download-3mf-btn').isDisabled());
  };
  const checkCamera = async before => assert.deepEqual(await camera(), before);
  assert.equal(await page.locator('#cfg-baseHeight').inputValue(), '6');
  assert.equal(await page.locator('#cfg-wallHeight').inputValue(), '6');
  assert.equal(await page.locator('#cfg-minConnectorWidth').inputValue(), '1.2');
  assert.equal(await page.locator('#cfg-depth').count(), 0, 'No duplicate depth control');
  assert.equal(await page.locator('#cfg-width').inputValue(), '0.5');
  const capture = async name => {
    const dir = out+'/'+name; mkdirSync(dir,{recursive:true});
    for (const [button,ext] of [['#download-btn','stl'],['#download-3mf-btn','3mf']]) {
      const start = Date.now(), downloading = page.waitForEvent('download');
      await page.locator(button).click();
      await (await downloading).saveAs(dir+'/scene.'+ext);
      log({kind:'format-download',name,ext,ms:Date.now()-start});
    }
    writeFileSync(dir+'/regions.json',JSON.stringify(await page.evaluate(()=>window.diagRegionData)));
    writeFileSync(dir+'/preview-position.json',JSON.stringify(await page.evaluate(()=>Array.from(window.diagResult.geometry.attributes.position.array))));
    await page.screenshot({path:dir+'/settings.png'});
    const before = await camera();
    await page.locator('#toggle-config').click();
    for (const [view,position] of [['side',[0,-220,28]],['underside',[0,-80,-210]]]) {
      await page.evaluate(position=>{window.diagControls.target.set(0,0,3);window.diagControls.object.position.fromArray(position);window.diagControls.update();},position);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.locator('#threejs').screenshot({path:dir+'/'+view+'.png'});
    }
    await page.evaluate(before=>{window.diagControls.target.fromArray(before.target);window.diagControls.object.position.fromArray(before.position);window.diagControls.update();},before);
    await page.locator('#toggle-config').click();
  };
  for (const [name,fields,mode] of [
    ['base-2.5',{baseHeight:'2.5'},'connections'],
    ['wall-3.5',{wallHeight:'3.5'},'connections'],
    ['minimum-1.6',{minConnectorWidth:'1.6'},'connections'],
    ['changed-disconnected',{},'disconnected'],
    ['changed-hull',{},'hull'],
  ]) {
    const before = await camera(), start = Date.now();
    for (const [key,value] of Object.entries(fields)) {await page.locator('#cfg-'+key).fill(value);await disabled();}
    if (await page.locator('#cfg-islandConnections').inputValue() !== mode)
      await page.locator('#cfg-islandConnections').selectOption(mode);
    else await page.locator('#create-btn').click();
    await enabled(); await checkCamera(before);
    log({kind:'dimensions-rebuild',name,ms:Date.now()-start,cameraPreserved:true});
    await capture(name);
  }
  // Positive heights and bounded numeric input fail visibly, preserving recovery.
  for(const [field,value] of [['baseHeight','0'],['wallHeight','-1'],['minConnectorWidth','201']]) {
    const old = await page.locator('#cfg-'+field).inputValue();
    await page.locator('#cfg-'+field).fill(value);await page.locator('#create-btn').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('must be between'));
    await disabled();
    log({kind:'invalid-dimension',field,value,message:await page.locator('#status').textContent()});
    await page.locator('#cfg-'+field).fill(old);
  }
  if(dataset==='baltimore') {
    await page.locator('#cfg-minConnectorWidth').fill('20');
    await page.locator('#cfg-islandConnections').selectOption('connections');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('continuous broad engagement'));
    await disabled();
    log({kind:'infeasible-minimum',value:20,message:await page.locator('#status').textContent()});
    await page.screenshot({path:out+'/infeasible.png'});
    await page.locator('#cfg-islandConnections').selectOption('disconnected');
    await enabled();
    await page.locator('#cfg-islandConnections').selectOption('hull');
    await enabled();
  }
  // Saved controls survive a real reload; dimensional state applies to new downloads.
  await page.locator('#cfg-minConnectorWidth').fill('1.6');
  await page.locator('#create-btn').click();await enabled();
  await page.reload({waitUntil:'domcontentloaded'});await enabled();
  for(const [field,value] of [['baseHeight','2.5'],['wallHeight','3.5'],['minConnectorWidth','1.6']])
    assert.equal(await page.locator('#cfg-'+field).inputValue(),value);
  assert.equal(await page.locator('#cfg-islandConnections').inputValue(),'hull');
  await page.locator('#toggle-config').click();
  await capture('saved-hull');
  log({kind:'saved-dimensions',baseHeight:2.5,wallHeight:3.5,minConnectorWidth:1.6});
  // Leave the panel collapsed for the existing actual orbit/zoom/idle check.
  await page.locator('#toggle-config').click();
}
