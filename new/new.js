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

export async function initialize() {
  const defaults = {
    depth: 6,
    width: 0.5,
    simplifyBy: 0.01,
    simplifyHullBy: 0.01,
    geoJsonUrl:
      "https://raw.githubusercontent.com/benbalter/dc-maps/master/maps/ward-2012.geojson",
  };
  window.shpstl = Object.assign({}, defaults, window.shpstl || {});

  // Load the GeoJSON data
  let geojson = await (await fetch(window.shpstl.geoJsonUrl)).json(); 
  truncateGeoJSON(geojson);
  let hullLines = getConvexHullLines(geojson); 
  hullLines = await simplifyGeoJSON(hullLines, window.shpstl.simplifyHullBy);
  geojson = await simplifyGeoJSON(geojson, window.shpstl.simplifyBy);
  let hull = getConvexHull(geojson); 
  let lines = getOverlappingLines(geojson);
  let interiorLines = getInteriorLines(geojson, hull);

  // Display the GeoJSON data on the map
  let { map } = createLeafletMap();
  const { scene } = createScene("threejs"); 
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
  const interiorLineGeometries = createThreeDGeometryLines(interiorLines);
  // const interiorLineMeshGroup = createMeshesFromGeometries(interiorLineGeometries);
  // interiorLineMeshGroup.position.z = window.shpstl.depth * -1;
  // interiorLineMeshGroup.scale.set(1, 1, 0.5); // Scale it down to half the depth
  // interiorLineMeshGroup.updateMatrixWorld();
  // scene.add(interiorLineMeshGroup);

  // Iterate through each line geometry and subtract it from the hull
  const hullBrush = createBrush(hullGeometries[0].geometry);
  hullBrush.updateMatrixWorld();
  let currentResult = hullBrush;
  for (let i = 0; i < interiorLineGeometries.length; i++) {
    try {   
      const lineEntry = interiorLineGeometries[i];
      const lineGeometry = (lineEntry?.geometry ?? lineEntry)?.clone?.();
      if (!lineGeometry) throw new Error("Interior line geometry missing/invalid");
      const lineBrush = createBrush(lineGeometry);
      lineBrush.scale.set(1, 1, .3); // Scale it a third of the depth
      // lineBrush.position.z = window.shpstl.depth * .7; 
      lineBrush.updateMatrixWorld();

      // Subtract this line from the current result
      const evaluator = new Evaluator();
      evaluator.useGroups = true;
      currentResult = evaluator.evaluate(currentResult, lineBrush, SUBTRACTION);
      console.log(`Successfully subtracted line geometry ${i + 1}/${interiorLineGeometries.length}`
      );
    } 
    catch (error) {console.error(`CSG operation failed for line ${i + 1}:`, error);}
  }
  scene.add(currentResult);
  // scene.add(hullMeshGroup);
  document.getElementById("download-btn").addEventListener("click", () => exportToSTL(scene));
}
