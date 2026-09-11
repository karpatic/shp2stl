// Author: Codex app agent, 2026-09-11. Reuse exported preprocessing, no mesh rebuild.
import fs from 'node:fs';
import {heightRegions} from '../new/planar.js';
import {reprojectGeoJSON,scaleGeoJSON,getMinMaxCoordinates} from '../new/leaflet.js';
const [dir,dataset='baltimore',mode='source']=process.argv.slice(2);
const data=JSON.parse(fs.readFileSync(dir+'/preprocess.json'));
const xs=[],ys=[];function visit(c){if(typeof c[0]==='number'){xs.push(c[0]);ys.push(c[1]);}else c.forEach(visit)}data.geojson.features.forEach(f=>visit(f.geometry.coordinates));
const center={lng:(Math.min(...xs)+Math.max(...xs))/2,lat:(Math.min(...ys)+Math.max(...ys))/2};
for(const value of Object.values(data))reprojectGeoJSON(value,center);
const bounds=getMinMaxCoordinates(data.sourceExterior || data.hull);
for(const value of Object.values(data))scaleGeoJSON(value,bounds);
const regions=heightRegions(data,{width:.5,depth:6,sourceTopology:mode!=='legacy'});
fs.writeFileSync(dir+'/regions.json',JSON.stringify({dataset,center,bounds,regions}));
