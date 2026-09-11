// Author: Codex app agent, 2026-09-11. Font is loaded only for lettering.
import {Font} from '../three/FontLoader.js';
let pending;
export async function loadFont() {
  if (!pending) pending=fetch(new URL('../three/vendor/helvetiker/regular.typeface.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Bundled font unavailable');return r.json();}).then(data=>new Font(data)).catch(e=>{pending=null;throw e;});
  return pending;
}
export function textPolygons(font,text,size) {
  if(typeof text!=='string'||!text.trim()||Array.from(text).length>24)throw Error('Enter 1–24 visible characters');
  if(!Number.isFinite(size)||size<1||size>30)throw Error('Text size must be 1–30 mm');
  const unsupported=[...new Set(Array.from(text).filter(c=>!font.data.glyphs[c]||/[\r\n\t]/.test(c)))];
  if(unsupported.length)throw Error('Unsupported characters: '+unsupported.join(' '));
  const polygons=font.generateShapes(text,size).map(s=>[s,...s.holes].map(r=>r.getPoints(12).map(p=>[p.x,p.y])));
  const points=polygons.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  return polygons.map(p=>p.map(r=>{const v=r.map(([x,y])=>[x-cx,y-cy]);if(v[0][0]!==v.at(-1)[0]||v[0][1]!==v.at(-1)[1])v.push(v[0]);return v;}));
}
