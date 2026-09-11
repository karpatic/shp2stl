import * as THREE from "three";
import {
  createLeafletMap,
  simplifyGeoJSON,
  getConvexHull,
  getConvexHullLines,
  reprojectGeoJSON,
  getInteriorLines,
  getOverlappingLines,
  scaleGeoJSON,
  getMinMaxCoordinates,
  truncateGeoJSON,
} from "./leaflet.js";
import {
  createScene,
  createThreeDGeometry,
  createMesh,
  createBrush,
  createThreeDGeometryLines,
  exportToSTL,
  createMeshesFromGeometries,
} from "./three.js";
import { Evaluator, SUBTRACTION } from "three-bvh-csg";
import { heightRegions, layerGeometry } from "./planar.js";
import planarBoolean from "./planar-boolean.js";

async function stage(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

export async function initialize() {
  const downloadButton = document.getElementById("download-btn");
  downloadButton.disabled = true;
  const defaults = {
    depth: 6,
    width: 0.5,
    simplifyBy: 0.01,
    simplifyHullBy: 0.01,
    geoJsonUrl:
      "https://raw.githubusercontent.com/benbalter/dc-maps/master/maps/ward-2012.geojson",
  };
  window.shpstl = Object.assign({}, defaults, window.shpstl || {});

  const useCSG = new URLSearchParams(location.search).get("geometry") === "csg";
  await stage("Loading geography…");
  // Load the GeoJSON data
  let geojson = await (await fetch(window.shpstl.geoJsonUrl)).json();
  await stage("Preparing boundaries…");
  truncateGeoJSON(geojson);
  let hullLines = getConvexHullLines(geojson);
  hullLines = await simplifyGeoJSON(hullLines, window.shpstl.simplifyHullBy);
  geojson = await simplifyGeoJSON(geojson, window.shpstl.simplifyBy);
  let hull = getConvexHull(geojson);
  let lines = getOverlappingLines(geojson);
  let interiorLines = getInteriorLines(lines, hull);

  // Display the GeoJSON data on the map
  let { map } = createLeafletMap();
  const { scene, requestRender } = createScene("threejs");
  L.geoJSON(hullLines, {
    style: {
      color: "#ff0000",
      weight: 8,
      opacity: 1,
      fillColor: "#ff4433",
      fillOpacity: 0.2,
    },
  }).addTo(map);
  L.geoJSON(interiorLines, {
    style: {
      color: "#004433",
      weight: 8,
      opacity: 1,
      fillColor: "#ff4433",
      fillOpacity: 0.2,
    },
  }).addTo(map);
  map.fitBounds(L.geoJSON(geojson).getBounds());

  // Reproject everything using the same center so meshes stay aligned
  let bounds = L.geoJSON(geojson).getBounds();
  const center = bounds.getCenter();
  reprojectGeoJSON(geojson, center);
  reprojectGeoJSON(hull, center);
  reprojectGeoJSON(hullLines, center);
  reprojectGeoJSON(lines, center);
  reprojectGeoJSON(interiorLines, center);

  const minMax = getMinMaxCoordinates(hull);

  await stage("Building boundary shapes…");
  // Create the hull
  scaleGeoJSON(hull, minMax);
  const hullGeometries = createThreeDGeometry(hull);
  const hullMeshGroup = new THREE.Group();
  hullGeometries?.forEach(({ geometry }) => {
    hullMeshGroup.add(createMesh(geometry));
  });

  // Create the hull lines
  scaleGeoJSON(hullLines, minMax);
  const hullLinesGeometries = createThreeDGeometryLines(hullLines);
  const hullLineMeshGroup = createMeshesFromGeometries(hullLinesGeometries);
  hullLineMeshGroup.scale.set(1, 1, 2); // twice the depth
  scene.add(hullLineMeshGroup);

  // Create the lines
  scaleGeoJSON(lines, minMax);
  const lineGeometries = createThreeDGeometryLines(lines);
  const lineMeshGroup = createMeshesFromGeometries(lineGeometries);
  lineMeshGroup.position.z = window.shpstl.depth;
  lineMeshGroup.updateMatrixWorld();
  scene.add(lineMeshGroup);

  // Create the interior-lines
  scaleGeoJSON(interiorLines, minMax);
  const interiorLineGeometries = useCSG
    ? createThreeDGeometryLines(interiorLines)
    : [];
  // Iterate through each line geometry and subtract it from the hull
  const hullBrush = createBrush(hullGeometries[0].geometry);
  hullBrush.updateMatrixWorld();
  let currentResult = hullBrush;
  let exportModel = scene;
  if (!useCSG) {
    await stage("Combining planar regions…");
    const regions = heightRegions(
      { hull, hullLines, lines, interiorLines },
      window.shpstl,
    );
    const depth = Math.fround(window.shpstl.depth);
    const grooveHeight = Math.fround(depth * 0.3);
    await stage("Extruding and checking the complete solid…");
    const completeGeometry = layerGeometry(regions.layers, [
      0,
      grooveHeight,
      depth,
      Math.fround(depth * 2),
    ]);
    const baseGeometry = layerGeometry(
      [planarBoolean.difference(regions.H, regions.C), regions.H],
      [0, grooveHeight, depth],
    );
    // Keep the existing translucent raised-line objects in the painted preview.
    // Their overlaps are resolved in the single validated download mesh.
    currentResult.geometry.dispose();
    currentResult.geometry = baseGeometry.toNonIndexed();
    currentResult.geometry.computeVertexNormals();
    baseGeometry.dispose();
    exportModel = new THREE.Mesh(completeGeometry);
    exportModel.updateMatrixWorld();
  } else {
    await stage("Building with reference CSG…");
    const evaluator = new Evaluator();
    evaluator.useGroups = true;
    for (let i = 0; i < interiorLineGeometries.length; i++) {
      try {
        const lineEntry = interiorLineGeometries[i];
        const lineGeometry = (lineEntry?.geometry ?? lineEntry)?.clone?.();
        if (!lineGeometry)
          throw new Error("Interior line geometry missing/invalid");
        const lineBrush = createBrush(lineGeometry);
        lineBrush.scale.set(1, 1, 0.3); // Scale it a third of the depth
        // lineBrush.position.z = window.shpstl.depth * .7;
        lineBrush.updateMatrixWorld();

        // Subtract this line from the current result
        const previousResult = currentResult;
        currentResult = evaluator.evaluate(
          previousResult,
          lineBrush,
          SUBTRACTION,
        );
        previousResult.disposeCacheData();
        previousResult.geometry.dispose();
        lineBrush.disposeCacheData();
        lineGeometry.dispose();
        console.log(
          `Successfully subtracted line geometry ${i + 1}/${interiorLineGeometries.length}`,
        );
      } catch (error) {
        throw new Error(
          `CSG operation failed for line ${i + 1}/${interiorLineGeometries.length}`,
          { cause: error },
        );
      }
    }
  }
  scene.add(currentResult);
  requestRender();
  downloadButton.addEventListener("click", () => exportToSTL(exportModel));
  downloadButton.disabled = false;
}
