// Author: Codex app agent, 2026-09-11.
// Legacy depth meant both the base and the additional wall rise.
export function dimensions(options) {
  const mapSize = options.mapSize ?? 200;
  if (!Number.isFinite(mapSize) || mapSize < 10 || mapSize > 500) throw Error("Map size must be 10–500 mm");
  const baseHeight = options.baseHeight ?? options.depth ?? 6;
  const wallHeight = options.wallHeight ?? options.depth ?? 6;
  const minConnectorWidth = options.minConnectorWidth ?? Math.max(1, 4 * (options.width ?? .5)) * .6;
  for (const [label, value] of [['Base height', baseHeight], ['Wall height above base', wallHeight], ['Wall width', options.width ?? .5], ['Minimum connector width', minConnectorWidth]]) {
    if (!Number.isFinite(value) || value < .01 || value > 200)
      throw Error(`${label} must be between 0.01 and 200 mm`);
  }
  // Preserve the original groove intent: 30% of the BASE height, measured
  // upward from the underside. Lowering the floor also lowers the groove roof.
  const levels = [0, Math.fround(baseHeight * .3), Math.fround(baseHeight), Math.fround(baseHeight + wallHeight)];
  if (levels.some((v, i) => !Number.isFinite(v) || (i && v <= levels[i-1])))
    throw Error('Heights must leave positive floor above the underside grooves and positive wall rise');
  return {mapSize,baseHeight, wallHeight, minConnectorWidth, levels};
}
