// Author: Codex app agent, 2026-09-11. Focused extension of the frozen browser harness.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('diagnostics/fixtures/manifest.json'));
export async function checkCacheUI(page,out,log,city,before) {
  await page.locator('#toggle-config').click();
  const counts=()=>page.evaluate(()=>({...window.diagCounts}));
  const difference=(a,b)=>Object.fromEntries(Object.keys(b).map(k=>[k,b[k]-(a[k]||0)]).filter(([,n])=>n));
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#download-btn').disabled && !document.querySelector('#download-3mf-btn').disabled);
  const rows=[{case:'cold',...await page.evaluate(()=>window.diagActions[0]),counts:await counts()}];
  async function action(name,fields={},mode,button='#create-btn') {
    const old=await counts(),n=await page.evaluate(()=>window.diagActions.length),frames=await page.evaluate(()=>window.diagRenderCount);
    for(const [key,value] of Object.entries(fields)) await page.locator('#cfg-'+key).fill(String(value));
    if(Object.keys(fields).length) assert(await page.locator('#download-btn').isDisabled());
    if(mode) await page.locator('#cfg-islandConnections').selectOption(mode); else await page.locator(button).click();
    await ready();await page.waitForFunction(n=>window.diagActions.length>n,n);
    const row={case:name,...await page.evaluate(()=>window.diagActions.at(-1)),counts:difference(old,await counts())};
    row.frames=await page.evaluate(()=>window.diagRenderCount)-frames;
    rows.push(row);log({kind:'cache-action',...row});return row;
  }
  const expensive=['fetch','geography','wallXY','regions','template','svg','communityBoundaries','nodePolygons','simplifyTopology','heightRegions','layerGeometry','islandBase','xyBoolean','topologyValidation','wallTemplate'];
  for(const [name,fields] of [['base-2.5',{baseHeight:2.5}],['wall-3.5',{wallHeight:3.5}],['height-return',{baseHeight:6,wallHeight:6}],['unchanged',{}]]) {
    const row=await action(name,fields);
    if(!before) for(const key of expensive) assert(!row.counts[key],`${name} repeated ${key}`);
    if(name==='unchanged'&&!before) {assert(!row.counts.heightCompute);assert.equal(row.frames,0);}
  }
  if(process.env.HEIGHT_CHECK) {
    writeFileSync(out+'/cache-actions.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',city,before,rows},null,2));
    await page.locator('#toggle-config').click();return;
  }
  for(const [name,value] of [['minimum-1.6',1.6],['minimum-return',1.2]]) {
    const row=await action(name,{minConnectorWidth:value});
    if(!before) {assert(!row.counts.geography && !row.counts.wallXY && !row.counts.svg);if(name==='minimum-return')assert(!row.counts.template);}
  }
  for(const mode of ['disconnected','hull','connections']) {
    const row=await action(mode,{},mode);
    if(!before) {assert(!row.counts.wallXY&&!row.counts.svg);if(mode==='connections')assert(!row.counts.template);}
  }
  if(!before) {
    const other=city==='dc'?'baltimore':'dc';
    await action('city-other',{},null,'#preset-'+other);
    assert.equal(await page.locator('#cfg-geoJsonUrl').inputValue(),manifest[other+'.geojson'].url);
    const back=await action('city-return',{},null,'#preset-'+city);
    for(const k of expensive.filter(k=>k!=='svg')) assert(!back.counts[k],`City return repeated ${k}`);
    await action('width-0.6',{width:.6});
    const widthBack=await action('width-return',{width:.5});assert(!widthBack.counts.fetch && !widthBack.counts.geography);
    await action('refresh-unchanged',{},null,'#refresh-source');
    const badUrl='https://cache-test.invalid/source.geojson';
    let requests=0,release;
    await page.route(badUrl,async route=>{
      requests++;
      if(requests===1) return route.fulfill({status:503,body:'Unavailable'});
      await new Promise(r=>release=r);
      return route.fulfill({contentType:'application/json',body:readFileSync('diagnostics/fixtures/'+other+'.geojson')});
    });
    await page.locator('#cfg-geoJsonUrl').fill(badUrl);await page.locator('#create-btn').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('503'));
    assert(await page.locator('#download-btn').isDisabled());
    await page.locator('#create-btn').click();
    await page.waitForTimeout(100);
    // A second Create shares the pending request. Changing city must win even
    // when the earlier source finally arrives.
    await page.locator('#create-btn').click();await page.waitForTimeout(100);assert.equal(requests,2);
    await action('latest-city',{},null,'#preset-'+city);
    release();await page.waitForTimeout(200);
    assert.equal(await page.locator('#cfg-geoJsonUrl').inputValue(),manifest[city+'.geojson'].url);
    assert.equal(await page.locator('#cfg-baseHeight').inputValue(),'6');
    assert(!await page.locator('#download-btn').isDisabled());
    assert.equal(await page.evaluate(()=>window.diagRegionData.options.geoJsonUrl),manifest[city+'.geojson'].url);
    log({kind:'cache-recovery',requests,sharedPending:true,latestWins:true});
    // A new body at the SAME URL invalidates geometry; identical refresh reuses it.
    let changed=false;
    const cityUrl=manifest[city+'.geojson'].url;
    await page.route(cityUrl,route=>route.fulfill({contentType:'application/json',body:readFileSync('diagnostics/fixtures/'+(changed?other:city)+'.geojson')}));
    changed=true;
    const refreshed=await action('refresh-changed',{},null,'#refresh-source');assert(refreshed.counts.geography&&refreshed.counts.template);
    changed=false;await action('refresh-restored',{},null,'#refresh-source');
  }
  if(!before) {
    for(const [name,saved,url,expected] of [
      ['fresh',null,'',manifest['dc.geojson'].url],
      ['saved-custom','https://custom.invalid/boundaries.geojson','', 'https://custom.invalid/boundaries.geojson'],
      ['query','https://custom.invalid/boundaries.geojson','?geoJsonUrl='+encodeURIComponent(manifest['dc.geojson'].url),manifest['dc.geojson'].url],
    ]) {
      const fresh=await page.context().newPage();
      await fresh.addInitScript(saved=>{
        localStorage.removeItem('shp2stl.appConfig.v1');
        if(saved)localStorage.setItem('shp2stl.appConfig.v1',JSON.stringify({shpstl:{geoJsonUrl:saved}}));
      },saved);
      await fresh.route('**/*',route=>route.request().resourceType()==='fetch'?route.abort():route.fallback());
      await fresh.goto(new URL('/app.html'+url,page.url()).href,{waitUntil:'domcontentloaded'});
      await fresh.waitForFunction(()=>!document.querySelector('#cfg-islandConnections').disabled);
      assert.equal(await fresh.locator('#cfg-geoJsonUrl').inputValue(),expected);
      await fresh.close();log({kind:'preset-selection',name,expected});
    }
  }
  writeFileSync(out+'/cache-actions.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',city,before,rows},null,2));
  await page.screenshot({path:out+'/cache-final.png'});
  await page.locator('#toggle-config').click();
}
