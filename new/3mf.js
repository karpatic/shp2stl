// Author: Codex app agent, 2026-09-11.
// 3MF Core only: two named closed meshes, one component assembly, one build item.
import {zipSync, strToU8} from '../three/vendor/fflate/fflate.js';

const core = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
const identity = '1 0 0 0 1 0 0 0 1 0 0 0';

function meshXML(geometry, id, name) {
  if (!geometry?.userData.validation?.closed || !geometry.index)
    throw Error(`Cannot export unvalidated ${name} part`);
  const p = geometry.attributes.position, index = geometry.index.array;
  const vertices = [];
  for (let i = 0; i < p.count; i++) {
    const xyz = [p.getX(i), p.getY(i), p.getZ(i)];
    if (!xyz.every(Number.isFinite)) throw Error('Nonfinite 3MF vertex');
    vertices.push(`<vertex x="${xyz[0]}" y="${xyz[1]}" z="${xyz[2]}"/>`);
  }
  const triangles = [];
  for (let i = 0; i < index.length; i += 3)
    triangles.push(`<triangle v1="${index[i]}" v2="${index[i+1]}" v3="${index[i+2]}"/>`);
  return `<object id="${id}" type="model" name="${name}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
}

export function package3MF({base, walls}) {
  const model = `${declaration}<model unit="millimeter" xml:lang="en-US" xmlns="${core}">
<resources>${meshXML(base, 1, 'Base')}${meshXML(walls, 2, 'Walls')}
<object id="3" type="model" name="Geographic model"><components><component objectid="1" transform="${identity}"/><component objectid="2" transform="${identity}"/></components></object>
</resources><build><item objectid="3" transform="${identity}"/></build></model>`;
  return zipSync({
    '[Content_Types].xml': strToU8(`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`),
    '_rels/.rels': strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>`),
    '3D/3dmodel.model': strToU8(model),
  }, {level: 6});
}

export function exportTo3MF(parts) {
  const blob = new Blob([package3MF(parts)], {type: 'model/3mf'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = 'geojson_model.3mf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
