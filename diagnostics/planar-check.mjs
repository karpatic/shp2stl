// Author: Codex app agent — 2026-09-11.
import assert from "node:assert/strict";
import { layerGeometry, validateSolid } from "../new/planar.js";
import pc from "../new/planar-boolean.js";
const rect = (x, y, w, h) => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
];
const H = pc.union(rect(0, 0, 10, 10));
const C = pc.union(rect(-1, 4, 12, 2), rect(4, -1, 2, 12));
const layers = [pc.difference(H, C), H, pc.intersection(H, C)],
  z = [0, 1.8, 6, 12];
const cross = layerGeometry(layers, z);
assert.ok(Math.abs(cross.userData.validation.volume - 751.2) < 1e-4);
const hole = pc.difference(H, rect(2, 2, 6, 6));
const holed = layerGeometry([hole], [0, 6]);
assert.ok(Math.abs(holed.userData.validation.volume - 384) < 1e-6);
const disconnected = layerGeometry(
  [pc.union(rect(0, 0, 1, 1), rect(3, 0, 1, 1))],
  [0, 2],
);
assert.equal(disconnected.userData.validation.volume, 4);
const broken = cross.clone();
broken.setIndex(Array.from(cross.index.array).slice(3));
assert.throws(() => validateSolid(broken, layers, z), /open or nonmanifold/);
assert.throws(() => layerGeometry([H], [0, 0]), /Invalid height/);
assert.throws(() => layerGeometry([[]], [0, 6]), /empty/);
console.log(
  "PASS: crossed underside grooves, raised crossings, holes, disconnected solids, incomplete-output rejection",
);

assert.throws(() => pc.union(rect(6e9, 0, 10, 10)), /integer range/);
