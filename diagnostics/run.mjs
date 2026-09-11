// Author: Codex app agent — 2026-09-11
// One isolated Chromium run, frozen network inputs, external wall/RSS watchdog.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkDimensionsUI } from './dimensions-ui.mjs';
import { checkCacheUI } from './cache-ui.mjs';

const [variant = 'baseline', dataset = 'dc', label = `${variant}-${dataset}`] = process.argv.slice(2);
const limitMs = Number(process.env.LIMIT_SECONDS || 120) * 1000;
const rssLimit = Number(process.env.RSS_MB || 2048) * 1024;
const root = process.env.SOURCE_ROOT ? resolve(process.env.SOURCE_ROOT) : resolve(['baseline','reference'].includes(variant) ? 'diagnostics/.cache/baseline' : '.');
const out = resolve('diagnostics/results', label);
mkdirSync(out, { recursive: true });
// Keep Playwright's disposable profile/download directories in this repository.
// A short path is necessary for Chromium's Unix-domain singleton socket.
process.env.TMPDIR = resolve('.tmp');
mkdirSync(process.env.TMPDIR, { recursive: true });
const manifest = JSON.parse(readFileSync('diagnostics/fixtures/manifest.json'));
for (const [file, entry] of Object.entries(manifest)) {
  const bytes = readFileSync(`diagnostics/fixtures/${file}`);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error(`Fixture changed: ${file}`);
}
const wrappers = (names) => names.map(name => `{
 const original = ${name};
 ${name} = function(...args) {
   const start = performance.now();
   window.diagCounts ||= {}; window.diagCounts['${name}'] = (window.diagCounts['${name}']||0)+1;
   if('${name}'==='validateSolid') {const key=args[3]?'heightValidation':'topologyValidation';window.diagCounts[key]=(window.diagCounts[key]||0)+1;}
   const result = original.apply(this, args);
   const done = value => { window.diag({kind:'stage', name:'${name}', ms:performance.now()-start}); return value; };
   return result?.then ? result.then(done) : done(result);
 };
}`).join('\n');
const instrumentation = `
let diagnosticCut = 0;
const originalEvaluate = Evaluator.prototype.evaluate;
function geometryStats(g) {
 return { triangles: Math.min(g.index?.count ?? g.attributes.position.count, g.drawRange.count)/3,
   vertices:g.attributes.position.count, groups:g.groups.length,
   bytes:Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength, g.index?.array.byteLength||0) };
}
Evaluator.prototype.evaluate = function(a,b,...args) {
 const cut = ++diagnosticCut; window.diagCut=cut;
 if (${Number(process.env.FAIL_CUT || 0)}===cut) throw new Error('Diagnostic injected CSG failure');
 if (${Number(process.env.CHECKPOINT || 0)}===cut) {
   const serialize=brush=>({attributes:Object.fromEntries(Object.entries(brush.geometry.attributes).map(([k,v])=>[k,{array:Array.from(v.array),itemSize:v.itemSize}])),index:brush.geometry.index?Array.from(brush.geometry.index.array):null,groups:brush.geometry.groups,matrix:brush.matrixWorld.toArray(),materials:Array.isArray(brush.material)?brush.material.length:1});
   window.diagData('checkpoint',{a:serialize(a),b:serialize(b),seed:window.diagSeed,cut});
 }
 window.diag({kind:'cut-start',cut,input:geometryStats(a.geometry),cutter:geometryStats(b.geometry),heap:performance.memory?.usedJSHeapSize});
 const start=performance.now(); const result=originalEvaluate.call(this,a,b,...args);
 window.diag({kind:'cut-end',cut,ms:performance.now()-start,output:geometryStats(result.geometry),heap:performance.memory?.usedJSHeapSize});
 return result;
};
`;
const server = createServer((req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) throw Error('Outside root');
    let data = readFileSync(path);
    if (path.endsWith('/new/new.js')) {
      let src = data.toString().replace('export async function initialize()', instrumentation + '\nexport async function initialize()');
      src = src.replace('// Display the GeoJSON', `window.diagData('preprocess', {geojson,hull,hullLines,lines,interiorLines,...(typeof sourceExterior!=='undefined'&&sourceExterior?{sourceExterior}:{})});\n // Display the GeoJSON`);
      src = src.replace('scene.add(currentResult);', `scene.add(currentResult); window.diagScene=scene; window.diagResult=currentResult; if(typeof exportModel!=='undefined' && exportModel.geometry)window.diagData('planar-validation',exportModel.geometry.userData.validation); window.diag({kind:'complete', ms:performance.now()-window.diagStart,heap:performance.memory?.usedJSHeapSize});`);
      if (process.env.ISLAND_CHECK || process.env.THREEMF_CHECK) src = src.replace('const depth = Math.fround', `window.diagRegionData={dataset:'${dataset}',center,bounds:minMax,regions,dimensions:dims,options:{...window.shpstl}};
    const depth = Math.fround`);
      data = src;
    } else if (path.endsWith('/three/three-bvh-csg.js') && process.env.FRAGMENTS) {
      data = data.toString().replace('const tri = triangles[ i ];', `const tri = triangles[ i ];
        if(i%4096===0 && performance.now()-(window.diagFragmentTime||0)>1000) {
          window.diagFragmentTime=performance.now();
          window.diag({kind:'fragments',cut:window.diagCut,count:triangles.length,iteration:i,initial:l});
        }`);
      data = data.replace('const intersectingIndices = intersectionSet[ ia ];', `const intersectingIndices = intersectionSet[ ia ];
        if(window.diagCut===81) window.diag({kind:'split-input',invert,i,total:splitIds.length,intersections:intersectingIndices.length});`);
      data = data.replace('splitter.splitByTriangle( _triB );', `splitter.splitByTriangle( _triB );
        if(window.diagCut===81 && performance.now()-(window.diagSplitTime||0)>1000) {
          window.diagSplitTime=performance.now();
          window.diag({kind:'split-progress',invert,i,ib,total:intersectingIndices.length,fragments:splitter.triangles.length});
        }`);
    } else if (path.endsWith('/new/leaflet.js')) {
      data = data.toString() + '\n' + wrappers(['truncateGeoJSON','getConvexHull','getConvexHullLines','simplifyGeoJSON','getOverlappingLines','getInteriorLines','reprojectGeoJSON','scaleGeoJSON','getMinMaxCoordinates']);
    } else if (path.endsWith('/new/planar.js')) {
      data = data.toString() + '\n' + wrappers(['heightRegions','layerGeometry','validateSolid']);
      if (process.env.FAIL_ISLAND) data += `\n{const original=heightRegions;heightRegions=(input,options)=>{if(options.islandConnections==='connections')throw Error('No island pad with continuous broad engagement at this model scale; use Disconnected or Hull base');return original(input,options);};}`;
      if (process.env.FAIL_PLANAR) data += `\n{const original=layerGeometry;layerGeometry=(...args)=>{throw Error('Planar diagnostic failure');};}`;
    } else if (path.endsWith('/new/planar-boolean.js')) {
      data = data.toString() + `\n{const original=operation;operation=(...args)=>{window.diagCounts ||= {};window.diagCounts.xyBoolean=(window.diagCounts.xyBoolean||0)+1;return original(...args);};}`;
    } else if (path.endsWith('/new/boundaries.js')) {
      data = data.toString() + '\n' + wrappers(['communityBoundaries','nodePolygons','simplifyTopology']);
    } else if (path.endsWith('/new/islands.js')) {
      data = data.toString() + '\n' + wrappers(['islandBase']);
    } else if (path.endsWith('/new/three.js')) {
      data = data.toString() + '\n' + wrappers(['createThreeDGeometry','createThreeDGeometryLines']);
      data += `\n{
        const original=createScene;
        createScene=function(...args) {
          const result=original(...args), render=result.renderer.render.bind(result.renderer);
          window.diagControls=result.controls;
          result.renderer.render=(...args)=>{window.diagRenderCount=(window.diagRenderCount||0)+1;return render(...args);};
          return result;
        };
      }`;
    }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/app.html${process.env.CSG_FALLBACK?'?geometry=csg':''}`;
const launch = await chromium.launchServer({executablePath:process.env.CHROME || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-precise-memory-info','--js-flags=--max-old-space-size=1024']});
const browser = await chromium.connect(launch.wsEndpoint());
const context = await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
const page = await context.newPage();
const events = [];
let status = 'running', peakRSS = 0;
const cpuByPid = new Map();
let computeCpuSeconds = null, computePeakRSSKiB = null;
const log = event => {
  events.push(event); appendFileSync(out+'/events.jsonl',JSON.stringify(event)+'\n');
  if (event.kind === 'complete') {
    status = 'complete';
    computeCpuSeconds = [...cpuByPid.values()].reduce((a,b)=>a+b,0);
    computePeakRSSKiB = peakRSS;
  }
};
writeFileSync(out+'/events.jsonl','');
await page.exposeFunction('diag', log);
await page.exposeFunction('diagData', (name, data) => writeFileSync(`${out}/${name}.json`,JSON.stringify(data)));
page.on('console', msg => {
  if (msg.type()==='warning') log({kind:'warning',text:msg.text().slice(0,240)});
  if (msg.type() === 'error') {
    log({kind:'error',text:msg.text()});
    if((process.env.FAIL_CUT && /CSG operation failed/.test(msg.text())) || (process.env.FAIL_PLANAR && /Planar diagnostic failure/.test(msg.text())) || (process.env.FAIL_ISLAND && /continuous broad engagement/.test(msg.text())))status='expected-failure';
  }
});
page.on('pageerror', e => log({kind:'error',text:e.message}));
page.on('crash', () => {status='crashed';});
await context.route('**/*', async route => {
  const requestUrl = route.request().url();
  if (requestUrl.startsWith('http://127.0.0.1:')) return route.continue();
  // All external assets are frozen; the map background is intentionally offline.
  const match = Object.entries(manifest).find(([,e])=>e.url===requestUrl);
  if (match) {
    let body=readFileSync(resolve('diagnostics/fixtures',match[0]));
    // Minimal compatibility reference: CSG reads face.normal, never this optional
    // interpolated normal. r176 can return null for a singular interpolation.
    if (variant==='reference' && match[0]==='bvh.js') body=body.toString().replace('if ( intersection.normal.dot( ray.direction ) > 0 )','if ( intersection.normal && intersection.normal.dot( ray.direction ) > 0 )');
    return route.fulfill({body,contentType:match[0].endsWith('.css')?'text/css':match[0].endsWith('.geojson')?'application/json':'text/javascript'});
  }
  if (/^https:\/\/[^/]+\.tile\.openstreetmap\.org\//.test(requestUrl)) {
    return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ddd"/></svg>'});
  }
  return route.abort();
});
const config = { props:{innerHeight:600,innerWidth:800,precision:100,scaleToThisSize:180},shpstl:{depth:6,width:.5,simplifyBy:.01,simplifyHullBy:.01,geoJsonUrl:manifest[dataset+'.geojson'].url} };
await page.addInitScript(config => {
  if(!localStorage.getItem('shp2stl.appConfig.v1'))localStorage.setItem('shp2stl.appConfig.v1',JSON.stringify(config));
  localStorage.setItem('shp2stl.appConfig.ui.v1',JSON.stringify({collapsed:true}));
  // Identical deterministic colors make screenshots comparable, not geometry.
  window.diagSeed=12345; Math.random=()=>((window.diagSeed=Math.imul(window.diagSeed,1664525)+1013904223>>>0)/4294967296);
  window.diagStart=performance.now();
  window.diagCounts={}; window.diagActions=[];
  window.shp2stlDiagnostic=event=>{
    window.diagCounts[event.name]=(window.diagCounts[event.name]||0)+1;
    window.diag({kind:'stage',...event});
  };
  window.shp2stlInspect=({view,regions,prepared,dimensions,options,validation})=>{
    window.diagResult=view.mesh;window.diagScene=view.scene;window.diagControls=view.controls;window.diagRenderer=view.renderer;
    window.diagRegionData={dataset:config.shpstl.geoJsonUrl.includes('arcgis')?'baltimore':'dc',center:prepared.center,bounds:prepared.minMax,regions,dimensions,options};
    if(!window.diagCompleted) {
      window.diagCompleted=true;
      window.diagData('planar-validation',validation);
      window.diag({kind:'complete',ms:performance.now()-window.diagStart,heap:performance.memory?.usedJSHeapSize});
    }
  };
  let action={name:'cold',start:window.diagStart},pending=false;
  document.addEventListener('click',e=>{
    if(['create-btn','preset-dc','preset-baltimore','refresh-source'].includes(e.target.id)) action={name:e.target.id,start:performance.now()};
  },true);
  document.addEventListener('change',e=>{if(e.target.id==='cfg-islandConnections')action={name:'mode',start:performance.now()};},true);
  document.addEventListener('DOMContentLoaded',()=>{
    new MutationObserver(()=>{
      if(document.querySelector('#download-btn').disabled || pending || !action) return;
      pending=true;const saved=action,ready=performance.now()-saved.start;action=null;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        window.diagActions.push({name:saved.name,readyMs:ready,paintedMs:performance.now()-saved.start});pending=false;
      }));
    }).observe(document.querySelector('#download-btn'),{attributes:true,attributeFilter:['disabled']});
  });
},config);
const cdp = await context.newCDPSession(page);
if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
const wallStart=Date.now();
let stopping = false;
const watchdog = setInterval(async () => {
  if (stopping) return;
  const rows = execFileSync('ps',['-eo','pid=,ppid=,rss=,cputimes='],{encoding:'utf8'}).trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
  const pids = new Set([launch.process().pid]);
  for(let pass=0;pass<5;pass++) for(const [pid,ppid] of rows) if(pids.has(ppid)) pids.add(pid);
  const rss=rows.reduce((n,[pid,,rss])=>n+(pids.has(pid)?rss:0),0);
  for(const [pid,,,cpu] of rows)if(pids.has(pid))cpuByPid.set(pid,Math.max(cpu,cpuByPid.get(pid)||0));
  peakRSS=Math.max(peakRSS,rss);
  if (rss>rssLimit || Date.now()-wallStart>limitMs) {
    stopping = true;
    status=rss>rssLimit?'rss-limit':'time-limit';
    log({kind:'limit',status,wallMs:Date.now()-wallStart,rssKiB:rss});
    if (process.env.PROFILE) await Promise.race([
      cdp.send('Profiler.stop').then(p=>writeFileSync(out+'/cpu.cpuprofile',JSON.stringify(p.profile))).catch(()=>{}),
      new Promise(r=>setTimeout(r,1500)),
    ]);
    launch.kill().catch(()=>{});
  }
},500);
try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:limitMs});
  while(status==='running') await new Promise(r=>setTimeout(r,200));
  if(status==='expected-failure') {
    const disabled=await page.locator('#download-btn').isDisabled();
    const uiStatus=await page.locator('#status').textContent();
    if(!disabled || !/Failed|failure|continuous broad engagement/.test(uiStatus))throw Error('A failed cut enabled partial output');
    log({kind:'failure-check',disabled,uiStatus});
    if(process.env.FAIL_ISLAND) {
      const select=page.locator('#cfg-islandConnections');
      if(await select.isDisabled())throw Error('Failed start prevents selecting another island mode');
      await page.locator('#toggle-config').click();
      await select.selectOption('disconnected');
      await page.waitForFunction(()=>document.querySelector('#download-btn')?.dataset.islandConnections==='disconnected' && !document.querySelector('#download-btn').disabled);
      if(await page.locator('#config-panel').evaluate(el=>el.classList.contains('collapsed'))) await page.locator('#toggle-config').click();
      await select.selectOption('connections');
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Choose a mode to retry'));
      if(!await page.locator('#download-btn').isDisabled())throw Error('Failed rebuild enabled stale download');
      await select.selectOption('hull');
      await page.waitForFunction(()=>document.querySelector('#download-btn').dataset.islandConnections==='hull' && !document.querySelector('#download-btn').disabled);
      log({kind:'island-failure-recovery',startRecovery:'disconnected',rebuildRecovery:'hull',staleDownloadDisabled:true});
      await page.screenshot({path:out+'/recovered.png'});
      status='expected-failure';
    }
  }
  if(status==='complete') {
    if(process.env.PROFILE) writeFileSync(out+'/cpu.cpuprofile',JSON.stringify((await cdp.send('Profiler.stop')).profile));
    // CSG completion is earlier than the first painted model frame. In an
    // on-demand view a screenshot must wait for that frame explicitly.
    await page.waitForFunction(()=>window.diagRenderCount>0,null,{timeout:15000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:out+'/browser.png'});
    if (process.env.HULL_CHECK) {
      // Capture the actual painted Leaflet SVG, including its path commands.
      writeFileSync(out+'/map.svg', await page.locator('#map .leaflet-overlay-pane svg').evaluate(svg=>svg.outerHTML));
      writeFileSync(out+'/map-paths.json', JSON.stringify(await page.locator('#map .leaflet-overlay-pane svg path').evaluateAll(paths=>paths.map(p=>({stroke:p.getAttribute('stroke'),d:p.getAttribute('d')}))),null,2));
      await page.locator('#map').screenshot({path:out+'/map.png'});
    }
    const downloadPromise=page.waitForEvent('download',{timeout:15000});
    await page.locator('#download-btn').click();
    const download=await downloadPromise;
    await download.saveAs(out+'/scene.stl');
    const geometry=await page.evaluate(()=>{
      const g=window.diagResult.geometry;
      return {position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),uv:Array.from(g.attributes.uv.array),index:g.index?Array.from(g.index.array):null,groups:g.groups,drawRange:g.drawRange};
    });
    writeFileSync(out+'/result-geometry.json',JSON.stringify(geometry));
    if(process.env.CACHE_CHECK) await checkCacheUI(page,out,log,dataset,!!process.env.SOURCE_ROOT);
    if(process.env.ISLAND_CHECK) {
      const select=page.locator('#cfg-islandConnections');
      if(await select.inputValue()!=='connections')throw Error('Fresh default is not Connections');
      const choices=await select.locator('option').allTextContents();
      if(JSON.stringify(choices)!==JSON.stringify(['Connections','Disconnected','Hull base']))throw Error('Unexpected mode options');
      await page.locator('#toggle-config').click();
      const camera=()=>page.evaluate(()=>({position:window.diagControls.object.position.toArray(),target:window.diagControls.target.toArray()}));
      for(const mode of ['connections','disconnected','hull','connections']) {
        const before=await camera(),start=Date.now();
        if(await select.inputValue()!==mode) {
          await select.selectOption(mode);
          await page.waitForFunction(mode=>!document.querySelector('#download-btn').disabled && document.querySelector('#download-btn').dataset.islandConnections===mode,mode);
        }
        if(JSON.stringify(await camera())!==JSON.stringify(before))throw Error('Mode switch changed review camera');
        const dir=out+'/'+mode;mkdirSync(dir,{recursive:true});
        writeFileSync(dir+'/regions.json',JSON.stringify(await page.evaluate(()=>window.diagRegionData)));
        const downloading=page.waitForEvent('download');await page.locator('#download-btn').click();await (await downloading).saveAs(dir+'/scene.stl');
        if(process.env.THREEMF_CHECK) {
          const exporting=page.waitForEvent('download');await page.locator('#download-3mf-btn').click();await (await exporting).saveAs(dir+'/scene.3mf');
        }
        const preview=await page.evaluate(()=>Array.from(window.diagResult.geometry.attributes.position.array));
        writeFileSync(dir+'/preview-position.json',JSON.stringify(preview));
        await page.screenshot({path:dir+'/browser.png'});
        await page.locator('#toggle-config').click();
        for(const [name,position] of [['top',[0,-60,235]],['underside',[0,-60,-235]]]) {
          await page.evaluate(position=>{window.diagControls.target.set(0,0,3);window.diagControls.object.position.fromArray(position);window.diagControls.update();},position);
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          await page.locator('#threejs').screenshot({path:dir+'/'+name+'.png'});
        }
        const links=await page.evaluate(()=>window.diagRegionData.regions.connections.links);
        if(mode==='connections') for(const [i,link] of links.entries()) {
          const x=(link.a[0]+link.b[0])/2,y=(link.a[1]+link.b[1])/2;
          for(const [name,sign] of [['pad-top',1],['pad-underside',-1]]) {
            await page.evaluate(({x,y,sign})=>{window.diagControls.target.set(x,y,3);window.diagControls.object.position.set(x,y-12,sign*32);window.diagControls.update();},{x,y,sign});
            await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            await page.locator('#threejs').screenshot({path:dir+'/'+name+'-'+i+'.png'});
          }
        }
        await page.locator('#toggle-config').click();
        await page.evaluate(before=>{window.diagControls.target.fromArray(before.target);window.diagControls.object.position.fromArray(before.position);window.diagControls.update();},before);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        log({kind:'island-mode-check',mode,ms:Date.now()-start,cameraPreserved:true});
      }
    }
    if(process.env.THREEMF_CHECK) await checkDimensionsUI(page,out,log,dataset);
    if(process.env.UI_CHECK) {
      const before=await page.evaluate(()=>({frames:window.diagRenderCount,angle:window.diagControls.getAzimuthalAngle(),distance:window.diagControls.object.position.distanceTo(window.diagControls.target)}));
      await page.waitForTimeout(1000);
      const idleFrames=await page.evaluate(before=>window.diagRenderCount-before,before.frames);
      const box=await page.locator('#threejs canvas').boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6,{steps:8});
      await page.mouse.up();
      await page.mouse.wheel(0,-100);
      await page.waitForTimeout(1000);
      const after=await page.evaluate(()=>({frames:window.diagRenderCount,angle:window.diagControls.getAzimuthalAngle(),distance:window.diagControls.object.position.distanceTo(window.diagControls.target)}));
      if(Math.abs(after.angle-before.angle)<.001 || Math.abs(after.distance-before.distance)<.001)throw Error('Orbit/zoom did not update');
      if(variant==='optimized' && idleFrames!==0)throw Error('Stationary view kept rendering');
      log({kind:'ui-check',idleFrames,before,after});
      const resources=await page.evaluate(()=>window.diagRenderer?{gpu:window.diagRenderer.info.memory,heap:performance.memory?.usedJSHeapSize}:null);
      if(resources) {if(resources.gpu.geometries>1)throw Error('Replaced preview GPU geometries retained');log({kind:'cache-resources',...resources});}
      await page.screenshot({path:out+'/orbit.png'});
      await page.evaluate(()=>{
        window.diagControls.object.position.set(90,-120,-180);
        window.diagControls.update();
      });
      await page.waitForTimeout(500);
      await page.screenshot({path:out+'/underside.png'});
    }
  }
} catch(e) {
  log({kind:'harness-error',text:e.message});
  if(['running','complete','expected-failure'].includes(status))status='error';
}
finally {
  clearInterval(watchdog);
  if (status==='complete' && events.some(e=>e.kind==='error' && /CSG operation failed|Error creating/.test(e.text))) status='partial-output';
  const sources=Object.fromEntries(['app.html','new/new.js','new/leaflet.js','new/three.js',...(['baseline','reference'].includes(variant)?[]:['new/planar.js','new/planar-boolean.js','new/boundaries.js','new/islands.js','new/dimensions.js','new/3mf.js','three/vendor/fflate/fflate.js']),'three/three-bvh-csg.js',...(process.env.SOURCE_ROOT?[]:['new/cache.js','new/pipeline.js','new/presets.js'])].map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
  writeFileSync(out+'/summary.json',JSON.stringify({variant,dataset,status,config,sources,profile:!!process.env.PROFILE,seed:12345,browser:browser.version(),limitMs,rssLimitKiB:rssLimit,peakRSSKiB:peakRSS,computePeakRSSKiB,computeCpuSeconds,processCpuSeconds:[...cpuByPid.values()].reduce((a,b)=>a+b,0),wallMs:Date.now()-wallStart,events},null,2));
  await launch.kill().catch(()=>{}); server.close();
}
console.log(JSON.stringify({label,status,peakRSSMiB:peakRSS/1024,lastCut:events.filter(e=>e.kind==='cut-end').at(-1),complete:events.find(e=>e.kind==='complete')}));
if(!['complete','expected-failure'].includes(status))process.exitCode=1;
