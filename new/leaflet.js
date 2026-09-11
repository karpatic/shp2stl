function createLeafletMap() {
  const map = L.map("map").setView([51.505, -0.09], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  return { map };
}

// recieves and returns a featurecollection
async function simplifyGeoJSON(geojson, simplifyBy = 0.01) {
  // Interior boundary rings carry source junctions and can collapse under the
  // line simplifier. Preserve them exactly, and keep them out of the exterior
  // quantile so adding holes does not change existing exterior walls/support.
  const isInterior = f => f.geometry.type === "LineString" && f.properties?.boundaryRole === "interior";
  if (geojson.features.some(isInterior)) {
    const otherFeatures = geojson.features.filter(f => !isInterior(f));
    const simplified = otherFeatures.length
      ? await simplifyGeoJSON({ ...geojson, features: otherFeatures }, simplifyBy)
      : { features: [] };
    let index = 0;
    return { ...geojson, features: geojson.features.map(f =>
      isInterior(f) ? structuredClone(f) : simplified.features[index++]) };
  }
  console.log("Simplifying GeoJSON...");
  let topoData = topojson.topology({ collection: geojson });
  topoData = topojson.presimplify(topoData);
  let min_weight = topojson.quantile(topoData, simplifyBy); // default 0.5
  topoData = topojson.simplify(topoData, min_weight);
  const feat = topojson.feature(topoData, topoData.objects.collection);


  console.log("Simplification complete");
  return feat;
}

function getConvexHull(geojson) {
  // Create a union of polygons from geojson
  let union = false;
  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "Polygon") {
      union = !union ? feature.geometry : turf.union(union, feature.geometry);
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach((polygon) => {
        let geometryToUnion = { type: "Polygon", coordinates: polygon };
        union = !union ? geometryToUnion : turf.union(union, geometryToUnion);
      });
    }
  });

  if (!union.geometry) union = turf.feature(union);

  // Filter small exterior components, preserving every interior ring belonging
  // to a retained component. The island cutoff is not a hole-size cutoff.
  const minArea = 150000;
  const filteredCoordinates =
    union.geometry.type == "Polygon"
      ? [union.geometry.coordinates]
      : union.geometry.coordinates
          .filter((polygon) => turf.area({
            type: "Polygon",
            coordinates: [polygon[0]],
          }) >= minArea);

  // Create a feature for the filtered union
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: filteredCoordinates },
      },
    ],
  };
}

function getConvexHullLines(geojson) {
  const hull = getConvexHull(geojson);
  const lines = [];
  const feature = hull.features[0]; // Since hull is a FeatureCollection of 1 item
  if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((polygon) => {
      polygon.forEach((coords, ringIndex) => {
        lines.push(turf.lineString(coords, { boundaryRole: ringIndex ? "interior" : "exterior" }));
      });
    });
  } else if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates.forEach((coords, ringIndex) => {
      lines.push(turf.lineString(coords, { boundaryRole: ringIndex ? "interior" : "exterior" }));
    });
  }
  else{
    console.warn("Invalid hull geometry type:", feature.geometry.type);
  }
  // Keep each exterior/hole ring closed and separate. Concatenating rings adds
  // artificial end-to-start segments to both the map and extruded boundary.
  return {
    type: "FeatureCollection",
    features: lines,
  };
}

function getOverlappingLines(geojson) {
  const polygons = geojson.features.filter(feature =>
    ["Polygon", "MultiPolygon"].includes(feature.geometry.type));
  // Calculate from the current coordinates, not potentially stale feature.bbox.
  const bounds = polygons.map(feature => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    turf.coordEach(feature, ([x, y]) => {
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    });
    return box;
  });
  const lines = turf.featureCollection([]);
  // Retain the original pair order and direction, including touching boxes.
  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      const a = bounds[i], b = bounds[j];
      if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
      const overlap = turf.lineOverlap(polygons[i], polygons[j]);
      for (const line of overlap.features) lines.features.push(line);
    }
  }
  return lines;
}

function getInteriorLines(geojson, hull, distance = 120) {
  function removeInDistance(coords, line, distance) {
    let flag = false;
    let removed = false;
    let valid = false;
    let check = (n) => Number.isInteger(n);
    let newCoords = coords.filter((coord, index) => {
      if (flag) {
        return true;
      }
      let distToLine = turf.pointToLineDistance(turf.point(coord), line, {
        units: "meters",
      });
      if (distToLine <= distance) {
        if (!check(removed)) {
          removed = index;
        }
        return false;
      } else {
        if (!check(valid)) {
          valid = index;
        }
        flag = true;
        return true;
      }
    });

    let getClosestPoint = (validPoint, removedPoint) => {
      // Same midpoint sequence and acceptance band as the recursive algorithm.
      // Fail explicitly if it cannot converge; never substitute an approximate cut.
      for (let iteration = 0; iteration < 64; iteration++) {
        const checkPoint = turf.midpoint(validPoint, removedPoint);
        const distToLine = turf.pointToLineDistance(checkPoint, line, { units: "meters" });
        if (!Number.isFinite(distToLine)) break;
        if (distToLine <= distance) {
          removedPoint = checkPoint;
        } else if (distToLine > distance + 20) {
          validPoint = checkPoint;
        } else {
          return checkPoint;
        }
      }
      throw new Error("Interior boundary refinement did not converge");
    };

    if (check(removed) && check(valid)) {
      let closestPoint = getClosestPoint(
        turf.point(coords[valid]),
        turf.point(coords[removed])
      );
      newCoords.unshift(turf.getCoord(closestPoint));
    }

    return newCoords;
  }

  // If geojson is not a collection of lines but actual features, get the overlapping lines first
  let lines = geojson;
  if (!geojson.features.some(f => f.geometry.type === "LineString")) {
    lines = getOverlappingLines(geojson);
  }

  // Filter out lines that are OVERLAP w the hull
  let updatedLines = { features: [], type: "FeatureCollection" };
  const outterLine = turf.lineString(hull.features[0].geometry.coordinates[0][0]);
  lines.features.forEach((innerLine) => {
    let innerCoords = turf.getCoords(innerLine);
    let filteredCoords = removeInDistance(innerCoords, outterLine, distance);
    filteredCoords = removeInDistance(
      filteredCoords.reverse(),
      outterLine,
      distance
    );
    if (filteredCoords.length >= 2) {
      let line = turf.lineString(filteredCoords);
      updatedLines.features.push(line);
    } else if (filteredCoords.length === 1) {
      let valid = filteredCoords[0];
      console.log("Handling Error: Only 1 point left.", valid);
      // Additional handling could be added here
    }
  });

  return updatedLines;
}


function reprojectGeoJSON(geojson, centerOverride) {
  let center = centerOverride;
  if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") {
    const bounds = L.geoJSON(geojson).getBounds();
    center = bounds.getCenter();
  }
  // Equirectangular projection - Centers the map on the data from geographic coordinates to 2D coordinates
  // Distortion Corrections - East West distortion is corrected by multiplying the longitude by the cosine of the latitude.
  const project = (lat, lng) => {
    const x = (lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
    const y = lat - center.lat;
    return [x, y];
  };

  // Only reproject the coordinates in the projected version
  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "Polygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (coords) => coords.map(([lng, lat]) => project(lat, lng))
      );
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (polygon) =>
          polygon.map((coords) => coords.map(([lng, lat]) => project(lat, lng)))
      );
    } else if (feature.geometry.type === "LineString") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        ([lng, lat]) => project(lat, lng)
      );
    } else if (feature.geometry.type === "MultiLineString") {
      feature.geometry.coordinates = feature.geometry.coordinates.map((line) =>
        line.map(([lng, lat]) => project(lat, lng))
      );
    }
  }); 
} 

function getMinMaxCoordinates(geojson) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "Polygon") {
      feature.geometry.coordinates.forEach((coords) => {
        coords.forEach(([x, y]) => {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });
      });
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach((polygon) => {
        polygon.forEach((coords) => {
          coords.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          });
        });
      });
    }
  });

  return { minX, minY, maxX, maxY };
}

// Normalize coordinates while preserving aspect ratio and centering the model
function scaleGeoJSON(geojson, minMax) {
  const finalSize = 200;
  // Find the bounds of the projected data
  const { minX, minY, maxX, maxY } = minMax;
  const width = maxX - minX;
  const height = maxY - minY;
  const scaleFactor = Math.max(width, height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "Polygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (coords) =>
          coords.map(([x, y]) => [
            ((x - centerX) / scaleFactor) * finalSize,
            ((y - centerY) / scaleFactor) * finalSize,
          ])
      );
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (polygon) =>
          polygon.map((coords) =>
            coords.map(([x, y]) => [
              ((x - centerX) / scaleFactor) * finalSize,
              ((y - centerY) / scaleFactor) * finalSize,
            ])
          )
      );
    } else if (feature.geometry.type === "LineString") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        ([x, y]) => [
          ((x - centerX) / scaleFactor) * finalSize,
          ((y - centerY) / scaleFactor) * finalSize,
        ]
      );
    } else if (feature.geometry.type === "MultiLineString") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (polygon) =>
          polygon.map((coords) =>
            coords.map(([x, y]) => [
              ((x - centerX) / scaleFactor) * finalSize,
              ((y - centerY) / scaleFactor) * finalSize,
            ])
          )
      );
    }
  });
}

function truncateGeoJSON(geojson, decimals = 3) {
  let length = geojson.features[0].geometry.coordinates[0][0].length;
  console.log("Polygon coordinate length:", length);
  
  const factor = Math.pow(10, decimals);
  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (polygon) => {
          return polygon.map((coords) => {
            let newCoords = coords.map(([x, y]) => [
              Math.round(x * factor) / factor,
              Math.round(y * factor) / factor,
            ]);
            console.log("Polygon coordinate length:", newCoords[0]);
            return newCoords
          });
        }
      );
    }
  });

  // Deduplicate coordinates in MultiPolygon
  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (polygon) => {
          return polygon.map((coords) => {
            return coords.filter(
              (coord, index, self) =>
                index === 0 || coord[0] !== self[index - 1][0] || coord[1] !== self[index - 1][1]
            );
          });
        }
      );
    }
  });

  // get length 
  length = geojson.features[0].geometry.coordinates[0][0].length;
  console.log("Polygon coordinate length:", length);
}

export {
  createLeafletMap,
  simplifyGeoJSON,
  getConvexHull,
  getConvexHullLines,
  getInteriorLines,
  getOverlappingLines,
  reprojectGeoJSON, 
  scaleGeoJSON,
  getMinMaxCoordinates,
  truncateGeoJSON,
};
