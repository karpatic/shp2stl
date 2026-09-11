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
import { heightRegions, layerGeometry } from "./planar.js";

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
  if (!useCSG) {
    let wallMapLayer;
    scene.add(new THREE.AmbientLight(0xffffff,.8));
    rebuildConnections = async (mode) => {
      downloadButton.disabled = true;
      currentResult.visible = false;
      requestRender();
      window.shpstl.islandConnections = mode;
      await stage("Combining planar regions…");
      const regions = heightRegions(
        { hull, hullLines, lines, interiorLines, sourceExterior },
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
      ], regions.caps);
      // The map also paints the actual wall footprint, without a screen-width
      // stroke that could visually seal a narrow water channel.
      const factor = Math.max(minMax.maxX-minMax.minX,minMax.maxY-minMax.minY)/200;
      const cx = (minMax.minX+minMax.maxX)/2, cy = (minMax.minY+minMax.maxY)/2;
      const cos = Math.cos(center.lat*Math.PI/180);
      const coordinates = regions.layers[2].map(p=>p.map(r=>r.map(([x,y])=>[
        (x*factor+cx)/cos+center.lng,y*factor+cy+center.lat,
      ])));
      hullMapLayer.remove(); lineMapLayer.remove();
      wallMapLayer?.remove();
      wallMapLayer = L.geoJSON({type:"MultiPolygon",coordinates},{stroke:false,fillColor:"#004433",fillOpacity:1}).addTo(map);
      // Paint exactly the validated downloadable solid, including its real joins.
      currentResult.geometry.dispose();
      currentResult.geometry = completeGeometry.toNonIndexed();
      currentResult.geometry.computeVertexNormals();
      const positions = currentResult.geometry.attributes.position;
      const colors = new Float32Array(positions.count*3);
      const wallColor = new THREE.Color(0x46959a), floorColor = new THREE.Color(0xdce5e5);
      for (let i=0;i<positions.count;i+=3) {
        const color = Math.max(positions.getZ(i),positions.getZ(i+1),positions.getZ(i+2))>depth ? wallColor : floorColor;
        for (let j=0;j<3;j++) color.toArray(colors,(i+j)*3);
      }
      currentResult.geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
      currentResult.material.setValues({color:0xffffff,vertexColors:true,transparent:false,opacity:1});
      if (exportModel.geometry) exportModel.geometry.dispose();
      exportModel = new THREE.Mesh(completeGeometry);
      exportModel.updateMatrixWorld();
      currentResult.visible = true;
      requestRender();
      downloadButton.dataset.islandConnections = mode;
      downloadButton.disabled = false;
    };
    await rebuildConnections(window.shpstl.islandConnections);
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
  return rebuildConnections;
}
