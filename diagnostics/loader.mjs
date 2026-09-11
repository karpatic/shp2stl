// Author: Codex app agent — 2026-09-11. Node mapping of the app's import map.
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
const imports = {
  three: 'three/three.module.js',
  'three-mesh-bvh': 'diagnostics/fixtures/bvh.js',
  'three-bvh-csg': 'three/three-bvh-csg.js',
};
export async function resolve(specifier, context, nextResolve) {
  if (imports[specifier]) return { url:pathToFileURL(pathResolve(imports[specifier])).href,shortCircuit:true };
  return nextResolve(specifier,context);
}
