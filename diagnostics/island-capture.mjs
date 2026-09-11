// Author: Codex app agent, 2026-09-11.
import {chromium} from 'playwright-core';import fs from 'node:fs';import path from 'node:path';
process.env.TMPDIR=path.resolve('.tmp');fs.mkdirSync('diagnostics/results/island-pads',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1740,height:880}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8765/diagnostics/island-review.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
for(const area of ['whole','pad0','pad1','pad2']){
 await page.locator('#area').selectOption(area);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`diagnostics/results/island-pads/${area}-top.png`});
 await page.locator('#under').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`diagnostics/results/island-pads/${area}-underside.png`});
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
