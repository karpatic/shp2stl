// Author: Codex app agent, 2026-09-11. Small real binary roundtrip and bounded-input checks.
import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
import {LOCAL,shapeZIP,readShapeZIP,validateGeoJSON,safeUnzip} from '../new/file-formats.js';
import {zipSync,strToU8} from '../three/vendor/fflate/fflate.js';
const outer=[[-20,-12],[20,-12],[20,12],[-20,12],[-20,-12]],hole=[[-17,-2],[-17,2],[-13,2],[-13,-2],[-17,-2]];
const json={type:'FeatureCollection',shp2stl:LOCAL,features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[outer,hole]}}]};
const zip=shapeZIP(json),round=readShapeZIP(zip);assert.equal(round.shp2stl.coordinates,'local-mm');assert.equal(round.features[0].geometry.coordinates[0].length,2);
const files=safeUnzip(zip);assert.equal(new DataView(files['drawing.shp'].buffer).getInt32(0),9994);assert.equal(new DataView(files['drawing.dbf'].buffer).getInt32(4,true),1);
assert.throws(()=>safeUnzip(zipSync({'../oops':strToU8('bad')})),/Unsafe/);assert.throws(()=>validateGeoJSON({...json,shp2stl:{version:2}}),/metadata/);
mkdirSync('diagnostics/results/formats',{recursive:true});writeFileSync('diagnostics/results/formats/drawing.zip',zip);writeFileSync('diagnostics/results/formats/drawing.geojson',JSON.stringify(json));
console.log('PASS: real polygon SHP/SHX/DBF, local-mm roundtrip, hole rings, unsafe ZIP path and metadata rejection');
