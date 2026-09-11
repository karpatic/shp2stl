// Author: Codex app agent, 2026-09-11.
import {chromium} from 'playwright-core';import fs from 'node:fs';import path from 'node:path';
process.env.TMPDIR=path.resolve('.tmp');
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1740,height:980}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const root='diagnostics/results/dimensions';fs.mkdirSync(root,{recursive:true});
for(const city of ['baltimore','dc']) {
 await page.goto(`http://127.0.0.1:8765/diagnostics/3mf-review.html?city=${city}&case=minimum-1.6`);
 await page.waitForFunction(()=>document.body.dataset.ready==='true');
 for(const [name,action] of [
  ['aligned',async()=>{}],
  ['exploded',()=>page.locator('#explode').check()],
  ['base',async()=>{await page.locator('#explode').uncheck();await page.locator('#walls').uncheck()}],
  ['base-underside',()=>page.locator('#under').click()],
  ['walls-underside',async()=>{await page.locator('#base').uncheck();await page.locator('#walls').check()}],
  ['side',async()=>{await page.locator('#base').check();await page.locator('#side').click()}],
 ]) {
  await action();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:`${root}/${city}-${name}.png`});
 }
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
