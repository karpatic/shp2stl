import { communityBoundaries } from './boundaries.js';
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
import { build } from "./pipeline.js";



async function stage(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

export async function initialize() {
  const downloadButton = document.getElementById("download-btn");
  const download3mf = document.getElementById("download-3mf-btn");
  downloadButton.disabled = true;
  if (download3mf) download3mf.disabled = true;
  const defaults = {
    islandConnections: "connections",
    depth: 6,
    width: 0.5,
    simplifyBy: 0.01,
    simplifyHullBy: 0.01,
    geoJsonUrl:
      "https://raw.githubusercontent.com/benbalter/dc-maps/master/maps/ward-2012.geojson",
  };
  window.shpstl = Object.assign({}, defaults, window.shpstl || {});

  const useCSG = new URLSearchParams(location.search).get("geometry") === "csg";
  if (!useCSG) {
    await build(window.shpstl);
    return mode => build({...window.shpstl, islandConnections:mode});
  }
  await stage("Loading geography…");
  // Load the GeoJSON data
  let geojson = await (await fetch(window.shpstl.geoJsonUrl)).json();
  await stage("Preparing boundaries…");
  let hull, hullLines, lines, interiorLines, sourceExterior;
  if (useCSG) {
    // Keep the explicit historical comparison path unchanged.
    truncateGeoJSON(geojson);
    hullLines = await simplifyGeoJSON(getConvexHullLines(geojson), window.shpstl.simplifyHullBy);
    geojson = await simplifyGeoJSON(geojson, window.shpstl.simplifyBy);
    hull = getConvexHull(geojson);
    lines = getOverlappingLines(geojson);
    interiorLines = getInteriorLines(lines, hull);
  } else {
    ({ geojson, hull, hullLines, lines, interiorLines, sourceExterior } = communityBoundaries(geojson, window.shpstl));
  }
  window.shpstl.sourceTopology = !useCSG;

  // Display the GeoJSON data on the map
  let { map } = createLeafletMap();
  const { scene, requestRender } = createScene("threejs");
  const hullMapLayer = L.geoJSON(hullLines, {
    style: {
      color: "#ff0000",
      weight: 8,
      opacity: 1,
      fillColor: "#ff4433",
      fillOpacity: 0.2,
    },
  }).addTo(map);
  const lineMapLayer = L.geoJSON(useCSG ? interiorLines : lines, {
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

  if (sourceExterior) reprojectGeoJSON(sourceExterior, center);
  const minMax = getMinMaxCoordinates(sourceExterior || hull);
  if (sourceExterior) scaleGeoJSON(sourceExterior, minMax);

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
  if (useCSG) {
    const hullLineMeshGroup = createMeshesFromGeometries(createThreeDGeometryLines(hullLines));
    hullLineMeshGroup.scale.set(1, 1, 2);
    scene.add(hullLineMeshGroup);
  }

  scaleGeoJSON(lines, minMax);
  if (useCSG) {
    const lineMeshGroup = createMeshesFromGeometries(createThreeDGeometryLines(lines));
    lineMeshGroup.position.z = window.shpstl.depth;
    lineMeshGroup.updateMatrixWorld();
    scene.add(lineMeshGroup);
  }

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
  let rebuildConnections;
  {
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
  return rebuildConnections;
}
