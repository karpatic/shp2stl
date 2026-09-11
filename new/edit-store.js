// Author: Codex app agent, 2026-09-11. Small source-content-scoped local history.
const key='shp2stl.placements.v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const memory=new Map();
const sourceKey=id=>id.slice(id.lastIndexOf('#')+1);
export function editsFor(id){const v=saved[sourceKey(id)];return Array.isArray(v)?structuredClone(v):[];}
export function saveEdits(id,edits){
 const k=sourceKey(id),old=editsFor(id);memory.set(k,[...(memory.get(k)||[]).slice(-19),old]);
 delete saved[k];saved[k]=structuredClone(edits);
 const keys=Object.keys(saved);while(keys.length>12)delete saved[keys.shift()];
 try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
}
export function undoEdits(id){const k=sourceKey(id),h=memory.get(k);if(!h?.length)return false;saved[k]=h.pop();try{localStorage.setItem(key,JSON.stringify(saved));}catch{}return true;}
