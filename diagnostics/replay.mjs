// Author: Codex app agent — 2026-09-11. Bounded by the calling timeout command.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
const snapshot=JSON.parse(readFileSync(process.argv[2]));
const warn=console.warn;
console.warn=(...args)=>warn(String(args[0]));
function restore(data) {
  const geometry=new THREE.BufferGeometry();
  for(const [key,a] of Object.entries(data.attributes))geometry.setAttribute(key,new THREE.Float32BufferAttribute(a.array,a.itemSize));
  if(data.index)geometry.setIndex(data.index);
  geometry.groups=data.groups;
  const materials=Array.from({length:data.materials},()=>new THREE.MeshPhongMaterial());
  const brush=new Brush(geometry,materials.length===1?materials[0]:materials);
  brush.matrixWorld.fromArray(data.matrix);
  return brush;
}
const a=restore(snapshot.a),b=restore(snapshot.b);
let seed=snapshot.seed;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const start=performance.now(),result=new Evaluator().evaluate(a,b,SUBTRACTION);
console.log(JSON.stringify({ms:performance.now()-start,triangles:result.geometry.attributes.position.count/3,memory:process.memoryUsage(),seed}));
