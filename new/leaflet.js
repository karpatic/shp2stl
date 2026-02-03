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
  console.log("Simplifying GeoJSON...", geojson);
  let topoData = topojson.topology({ collection: geojson });
  topoData = topojson.presimplify(topoData);
  let min_weight = topojson.quantile(topoData, simplifyBy); // default 0.5
  topoData = topojson.simplify(topoData, min_weight);
  const feat = topojson.feature(topoData, topoData.objects.collection);

  console.log("Simplification complete", feat);
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

  // Filter out small polygons as artifacts from union result
  const minArea = 150000;
  const filteredCoordinates =
    union.geometry.type == "Polygon"
      ? [union.geometry.coordinates]
      : union.geometry.coordinates
          .map((polygons) => {
            return polygons.filter((polygon) => {
              const area = turf.area({
                type: "Polygon",
                coordinates: [polygon],
              });
              return area >= minArea;
            });
          })
          .filter((polygons) => polygons && polygons.length > 0);

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
      polygon.forEach((coords) => {
        lines.push(turf.lineString(coords));
      });
    });
  } else if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates.forEach((coords) => {
      lines.push(turf.lineString(coords));
    });
  }
  else{
    console.warn("Invalid hull geometry type:", feature.geometry.type);
  }
  // Create a single polyline feature from all the lines
  const allCoords = lines.flatMap((line) => turf.getCoords(line));
  const lineString = turf.lineString(allCoords);
  return {
    type: "FeatureCollection",
    features: [lineString],
  };
}

function getOverlappingLines(geojson) {
  // Gets the overlapping lines from the geojson
  let handled = [];
  let lines = turf.featureCollection([]);
  geojson.features.forEach((feature, index) => {
    geojson.features.forEach((feature2, index2) => {
      if (
        !["Polygon", "MultiPolygon"].includes(feature.geometry.type) ||
        !["Polygon", "MultiPolygon"].includes(feature2.geometry.type) ||
        index === index2 ||
        handled.includes(feature2)
      )
        return;
      // Get the overlapping parts
      let overlap = turf.lineOverlap(feature, feature2);
      if (overlap.features.length) {
        overlap.features.forEach((line) => {
          lines.features.push(line);
        });
      }
    });
    handled.push(feature);
  });
  
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
      let checkPoint = turf.midpoint(validPoint, removedPoint);
      let distToLine = turf.pointToLineDistance(checkPoint, line, {
        units: "meters",
      });
      if (distToLine <= distance) {
        return getClosestPoint(validPoint, checkPoint);
      } else if (distToLine > distance + 20) {
        return getClosestPoint(checkPoint, removedPoint);
      } else {
        return checkPoint;
      }
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
  lines.features.forEach((innerLine) => {
    let innerCoords = turf.getCoords(innerLine);
    let outtercoords = hull.features[0].geometry.coordinates[0][0];
    let outterLine = turf.lineString(outtercoords);
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
