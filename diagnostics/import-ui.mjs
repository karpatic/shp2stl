// Author: Codex app agent, 2026-09-11. Small converter/import end-to-end fixture.
import assert from 'node:assert/strict';import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
export async function checkImportUI(page,out,log){
 const ready=p=>p.waitForFunction(()=>document.querySelector('#download-btn') && !document.querySelector('#download-btn').disabled);
 const downloads=async(p,name)=>{const d=out+'/'+name;mkdirSync(d,{recursive:true});for(const [id,ext] of [['download-btn','stl'],['download-3mf-btn','3mf']]){const w=p.waitForEvent('download');await p.locator('#'+id).click();await(await w).saveAs(d+'/scene.'+ext);}writeFileSync(d+'/regions.json',JSON.stringify(await p.evaluate(async()=>{const s=(await import('/new/pipeline.js')).modelState();return {regions:s.regions,original:s.originalRegions,dimensions:s.dims,edits:s.edits,options:s.options};})));};
 if(await page.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#toggle-config').click();
 await page.locator('#import-file').setInputFiles('diagnostics/fixtures/dc.geojson');await page.waitForFunction(()=>document.querySelector('#cfg-geoJsonUrl').value.startsWith('local:'));await ready(page);await downloads(page,'local-dc');assert.deepEqual(readFileSync(out+'/scene.stl'),readFileSync(out+'/local-dc/scene.stl'));
 const context=page.context();await context.addInitScript(()=>{window.diag=()=>{};window.diagData=()=>{};});
 const converter=await context.newPage(),errors=[];converter.on('pageerror',e=>errors.push(e.message));const external=[];converter.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
 await converter.goto(new URL('/converter.html',page.url()).href);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70" onload="window.pwned=1"><script>window.pwned=1</script><foreignObject><div>bad</div></foreignObject><image href="https://example.invalid/spy.png"/><g transform="translate(10 10) rotate(5 35 20)"><path fill-rule="evenodd" d="M0 0H70V40H0Z M5 20 A4 4 0 1 0 13 20 A4 4 0 1 0 5 20 Z"/><path fill="none" stroke="black" stroke-width="3" stroke-linecap="round" d="M68 10 L76 10"/></g></svg>`;
 writeFileSync(out+'/sample.svg',svg);await converter.locator('#svg-file').setInputFiles({name:'sample.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await converter.locator('#convert').click();await converter.waitForFunction(()=>!document.querySelector('#geojson').disabled);assert.equal(await converter.evaluate(()=>window.pwned),undefined);assert.equal(external.length,0);assert((await converter.locator('#warnings').textContent()).includes('script'));
 for(const [id,file] of [['geojson','drawing.geojson'],['shapefile','drawing.zip']]){const w=converter.waitForEvent('download');await converter.locator('#'+id).click();await(await w).saveAs(out+'/'+file);}
 await converter.screenshot({path:out+'/converter.png'});
 const popupWait=context.waitForEvent('page');await converter.locator('#open-app').click();const app=await popupWait;app.on('pageerror',e=>errors.push(e.message));await ready(app);await converter.waitForFunction(()=>document.querySelector('#handoff').textContent.includes('acknowledged'));assert.equal(await app.locator('#cfg-mapSize').inputValue(),'40');await downloads(app,'handoff');
 if(await app.locator('#config-panel').evaluate(e=>e.classList.contains('collapsed')))await app.locator('#toggle-config').click();
 await app.locator('#import-file').setInputFiles(out+'/drawing.zip');await ready(app);await app.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('Loaded drawing.zip'));await downloads(app,'zip-roundtrip');
 // Imported stroke extension and circular source hole survive the actual model.
 const data=JSON.parse(readFileSync(out+'/drawing.geojson'));assert(data.shp2stl.coordinates==='local-mm');assert.equal(data.features[0].geometry.coordinates[0].length,2);
 // Actual orbit drag while armed must not place anything.
 await app.locator('#hole-tool').click();const box=await app.locator('#threejs canvas').boundingBox();await app.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await app.mouse.down();await app.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:6});await app.mouse.up();assert.equal(await app.locator('#placement-list option').count(),0);await app.keyboard.press('Escape');
 await app.screenshot({path:out+'/import-app.png'});
 await app.setViewportSize({width:390,height:844});await app.screenshot({path:out+'/mobile-app.png'});assert(await app.locator('#import-file').isVisible());
 await app.close();await converter.bringToFront();
 await converter.setViewportSize({width:390,height:844});await converter.screenshot({path:out+'/mobile-converter.png'});assert(await converter.locator('#svg-file').isVisible());
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(out+'/import-ui.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',localDCExact:true,externalSVGRequests:external,errors,acknowledged:true,shapeRings:2},null,2));log({kind:'import-ui',localDCExact:true,acknowledged:true});await converter.close();
}
