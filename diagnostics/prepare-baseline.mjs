// Author: Codex app agent — 2026-09-11
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const revision='919e9d656352be041a5d3118e325e088a137e760';
const destination='diagnostics/.cache/baseline';
mkdirSync(destination,{recursive:true});
const archive=execFileSync('git',['archive',revision],{maxBuffer:32*1024*1024});
execFileSync('tar',['-x','-C',destination],{input:archive});
console.log(`Prepared local baseline ${revision} in ${destination}`);
