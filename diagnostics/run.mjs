// Author: Codex app agent — 2026-09-11
// One isolated Chromium run, frozen network inputs, external wall/RSS watchdog.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [variant = 'baseline', dataset = 'dc', label = `${variant}-${dataset}`] = process.argv.slice(2);
const limitMs = Number(process.env.LIMIT_SECONDS || 120) * 1000;
const rssLimit = Number(process.env.RSS_MB || 2048) * 1024;
const root = resolve(['baseline','reference'].includes(variant) ? 'diagnostics/.cache/baseline' : '.');
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
      src = src.replace('// Display the GeoJSON', `window.diagData('preprocess', {geojson,hull,hullLines,lines,interiorLines});\n // Display the GeoJSON`);
      src = src.replace('scene.add(currentResult);', `scene.add(currentResult); window.diagScene=scene; window.diagResult=currentResult; if(typeof exportModel!=='undefined' && exportModel.geometry)window.diagData('planar-validation',exportModel.geometry.userData.validation); window.diag({kind:'complete', ms:performance.now()-window.diagStart,heap:performance.memory?.usedJSHeapSize});`);
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
      data = data.toString() + '\n' + wrappers(['heightRegions','layerGeometry']);
      if (process.env.FAIL_PLANAR) data += `\n{const original=layerGeometry;layerGeometry=(...args)=>{throw Error('Planar diagnostic failure');};}`;
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
    if((process.env.FAIL_CUT && /CSG operation failed/.test(msg.text())) || (process.env.FAIL_PLANAR && /Planar diagnostic failure/.test(msg.text())))status='expected-failure';
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
  localStorage.setItem('shp2stl.appConfig.v1',JSON.stringify(config));
  localStorage.setItem('shp2stl.appConfig.ui.v1',JSON.stringify({collapsed:true}));
  // Identical deterministic colors make screenshots comparable, not geometry.
  window.diagSeed=12345; Math.random=()=>((window.diagSeed=Math.imul(window.diagSeed,1664525)+1013904223>>>0)/4294967296);
  window.diagStart=performance.now();
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
    if(!disabled || !uiStatus.includes('Failed'))throw Error('A failed cut enabled partial output');
    log({kind:'failure-check',disabled,uiStatus});
  }
  if(status==='complete') {
    if(process.env.PROFILE) writeFileSync(out+'/cpu.cpuprofile',JSON.stringify((await cdp.send('Profiler.stop')).profile));
    // CSG completion is earlier than the first painted model frame. In an
    // on-demand view a screenshot must wait for that frame explicitly.
    await page.waitForFunction(()=>window.diagRenderCount>0,null,{timeout:15000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:out+'/browser.png'});
    const downloadPromise=page.waitForEvent('download',{timeout:15000});
    await page.locator('#download-btn').click();
    const download=await downloadPromise;
    await download.saveAs(out+'/scene.stl');
    const geometry=await page.evaluate(()=>{
      const g=window.diagResult.geometry;
      return {position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),uv:Array.from(g.attributes.uv.array),index:g.index?Array.from(g.index.array):null,groups:g.groups,drawRange:g.drawRange};
    });
    writeFileSync(out+'/result-geometry.json',JSON.stringify(geometry));
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
  const sources=Object.fromEntries(['app.html','new/new.js','new/leaflet.js','new/three.js',...(['baseline','reference'].includes(variant)?[]:['new/planar.js','new/planar-boolean.js']),'three/three-bvh-csg.js'].map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
  writeFileSync(out+'/summary.json',JSON.stringify({variant,dataset,status,config,sources,profile:!!process.env.PROFILE,seed:12345,browser:browser.version(),limitMs,rssLimitKiB:rssLimit,peakRSSKiB:peakRSS,computePeakRSSKiB,computeCpuSeconds,processCpuSeconds:[...cpuByPid.values()].reduce((a,b)=>a+b,0),wallMs:Date.now()-wallStart,events},null,2));
  await launch.kill().catch(()=>{}); server.close();
}
console.log(JSON.stringify({label,status,peakRSSMiB:peakRSS/1024,lastCut:events.filter(e=>e.kind==='cut-end').at(-1),complete:events.find(e=>e.kind==='complete')}));
if(!['complete','expected-failure'].includes(status))process.exitCode=1;
