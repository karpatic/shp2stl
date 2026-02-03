import * as THREE from 'three'; 
import { OrbitControls } from '/three/OrbitControls.js'; 
import { STLExporter } from '/three/STLExporter.js';
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

let scene, camera, renderer, controls; 
function createScene(elementId) {
  const container = document.getElementById(elementId);

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 200; // Position the camera further back to frame the object
  camera.far = 1000; // Ensure the far plane is sufficient to encompass the object
  camera.updateProjectionMatrix(); // Update the projection matrix after changes

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Add controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;

  let animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };

  // Start animation loop
  animate();

  return { scene, camera, renderer, controls };
}

function exportToSTL(group) {
    console.log("Exporting to STL...");
    
    if (!group || (!group.geometry && (!group.children || group.children.length === 0))) {
        alert("No 3D model has been loaded yet. Please wait for the model to load.");
        return;
    }

    try {
        // Initialize STL Exporter
        const exporter = new STLExporter();

        // Export the geometry as STL
        const stl = exporter.parse(group, { binary: true });

        // Create blob from the STL data
        const blob = new Blob([stl], { type: "application/octet-stream" });

        // Create a download link
        const link = document.createElement("a");
        link.style.display = "none";
        document.body.appendChild(link);

        // Create a URL for the blob
        const url = window.URL.createObjectURL(blob);
        link.href = url;
        link.download = "geojson_model.stl";
        link.click();

        // Clean up
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);

        console.log("STL export complete");
    } catch (error) {
        console.error("Error exporting STL:", error);
        alert("Failed to export STL. See console for details.");
    }
}

function createThreeDGeometry(geojson) {
    // Create a new Three.js shape
    const shapes = [];
    const featureIndices = []; // Track which feature each shape belongs to
    
    geojson.features.forEach((feature, index) => {
        if (feature.geometry.type === "Polygon") {
            feature.geometry.coordinates.forEach(coords => {
                const shape = new THREE.Shape();
                coords.forEach(([x, y], i) => {
                    if (i === 0) {
                        shape.moveTo(x, y);
                    } else {
                        shape.lineTo(x, y);
                    }
                });
                shapes.push(shape);
                featureIndices.push(index); // Store the feature index for this shape
            });
        } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach(polygon => {
                polygon.forEach(coords => {
                    const shape = new THREE.Shape();
                    coords.forEach(([x, y], i) => {
                        if (i === 0) {
                            shape.moveTo(x, y);
                        } else {
                            shape.lineTo(x, y);
                        }
                    });
                    shapes.push(shape);
                    featureIndices.push(index); // Store the feature index for this shape
                });
            });
        }
    });
    
    // Create extruded geometry for each shape with feature index
    const geometriesWithIndices = shapes.map((shape, i) => {
        const extrudeSettings = {
            depth: window.shpstl.depth,
            bevelEnabled: false
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        return { geometry, featureIndex: featureIndices[i] };
    });
    console.log("Geometries with indices:", geometriesWithIndices);
    
    return geometriesWithIndices;
}

function createMesh( geometry ) {
  const color = new THREE.Color(Math.random() * 0xffffff);
  const material = new THREE.MeshPhongMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
  }); 
  return new THREE.Mesh(geometry, material); 
} 

// Returns a meshgroup of extruded lines
function createThreeDGeometryLines(geojson, options = {}) {
  const geometries = [];

  const width = typeof options.width === "number" ? options.width : window?.shpstl?.width;
  const depth = typeof options.depth === "number" ? options.depth : window?.shpstl?.depth;
  const miterLimit = typeof options.miterLimit === "number" ? options.miterLimit : 4;
  const join = (options.join || "bevel").toLowerCase(); // "miter" | "bevel" | "round"
  const roundSegments = typeof options.roundSegments === "number" ? options.roundSegments : 8;

  if (!geojson || !geojson.features) {
    console.warn("Invalid GeoJSON provided to createThreeDGeometryLines");
    return geometries;
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    console.warn("Invalid width/depth for createThreeDGeometryLines", { width, depth });
    return geometries;
  }

  const EPS = 1e-9;
  const TAU = Math.PI * 2;

  const perp = (v) => new THREE.Vector2(-v.y, v.x);
  const crossZ = (a, b) => a.x * b.y - a.y * b.x;

  const normalizeAngle = (a) => {
    let out = a % TAU;
    if (out < 0) out += TAU;
    return out;
  };
  const ccwDelta = (a, b) => {
    const na = normalizeAngle(a);
    const nb = normalizeAngle(b);
    let d = nb - na;
    if (d < 0) d += TAU;
    return d;
  };
  const pushUnique = (arr, p) => {
    if (!p) return;
    const last = arr[arr.length - 1];
    if (!last || last.distanceToSquared(p) > 1e-14) arr.push(p);
  };

  function joinAtVertex(A, B, C, halfW, side, outerPreferred) {
    // side: +1 => left, -1 => right
    // outerPreferred: if true, we can use round fallback when miter is too long
    const t0 = B.clone().sub(A);
    const t1 = C.clone().sub(B);
    if (t0.lengthSq() < EPS || t1.lengthSq() < EPS) {
      return { type: "degenerate", points: [] };
    }
    t0.normalize();
    t1.normalize();

    const n0 = perp(t0).multiplyScalar(side);
    const n1 = perp(t1).multiplyScalar(side);

    const P0 = B.clone().add(n0.clone().multiplyScalar(halfW));
    const P1 = B.clone().add(n1.clone().multiplyScalar(halfW));

    const m = n0.clone().add(n1);
    const mLen = m.length();
    if (mLen < 1e-9) {
      // straight or 180°
      return { type: "miter", points: [P1] };
    }
    const mDir = m.multiplyScalar(1 / mLen);
    const denom = mDir.dot(n1);
    if (Math.abs(denom) < 1e-6) {
      return { type: "bevel", points: [P0, P1] };
    }

    const miterLen = halfW / denom;
    const absMiterLen = Math.abs(miterLen);

    if (absMiterLen > miterLimit * halfW) {
      const wantsRound = join === "round" && outerPreferred && roundSegments > 0;
      if (!wantsRound) {
        return { type: "bevel", points: [P0, P1] };
      }

      // Round join: arc from n0->n1 around B with radius halfW
      const a0 = Math.atan2(n0.y, n0.x);
      const a1 = Math.atan2(n1.y, n1.x);
      const d = ccwDelta(a0, a1);
      const steps = Math.max(2, Math.ceil((d / TAU) * roundSegments * 4));

      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = a0 + d * t;
        const p = B.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(halfW));
        pts.push(p);
      }
      return { type: "round", points: pts };
    }

    const PM = B.clone().add(mDir.multiplyScalar(miterLen));
    return { type: "miter", points: [PM] };
  }

  function cleanPoints(coords) {
    const pts = [];
    for (const c of coords) {
      if (!c || c.length < 2) continue;
      const x = c[0], y = c[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const p = new THREE.Vector2(x, y);
      if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > 1e-14) {
        pts.push(p);
      }
    }
    return pts;
  }

  function buildStripShape(points, halfW) {
    if (!points || points.length < 2) return null;

    const left = [];
    const right = [];

    // Start cap
    {
      const d = points[1].clone().sub(points[0]);
      if (d.lengthSq() < EPS) return null;
      d.normalize();
      const n = perp(d);
      pushUnique(left, points[0].clone().add(n.clone().multiplyScalar(halfW)));
      pushUnique(right, points[0].clone().add(n.clone().multiplyScalar(-halfW)));
    }

    // Joins
    for (let i = 1; i < points.length - 1; i++) {
      const A = points[i - 1];
      const B = points[i];
      const C = points[i + 1];

      const t0 = B.clone().sub(A);
      const t1 = C.clone().sub(B);
      if (t0.lengthSq() < EPS || t1.lengthSq() < EPS) continue;
      t0.normalize();
      t1.normalize();

      const turn = crossZ(t0, t1);
      // If turn > 0: left is outer; if turn < 0: right is outer.
      const leftOuter = turn > 1e-12;
      const rightOuter = turn < -1e-12;

      const jl = joinAtVertex(A, B, C, halfW, +1, leftOuter);
      jl.points.forEach((p) => pushUnique(left, p));

      const jr = joinAtVertex(A, B, C, halfW, -1, rightOuter);
      jr.points.forEach((p) => pushUnique(right, p));
    }

    // End cap
    {
      const n = points.length;
      const d = points[n - 1].clone().sub(points[n - 2]);
      if (d.lengthSq() < EPS) return null;
      d.normalize();
      const nn = perp(d);
      pushUnique(left, points[n - 1].clone().add(nn.clone().multiplyScalar(halfW)));
      pushUnique(right, points[n - 1].clone().add(nn.clone().multiplyScalar(-halfW)));
    }

    if (left.length < 2 || right.length < 2) return null;

    const outline = [...left, ...right.reverse()];
    if (outline.length < 3) return null;

    const shape = new THREE.Shape(outline);
    shape.closePath();
    return shape;
  }

  geojson.features.forEach((feature) => {
    if (!feature?.geometry || feature.geometry.type !== "LineString") return;
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    const pts = cleanPoints(coords);
    if (pts.length < 2) return;

    const halfW = width / 2;
    const shape = buildStripShape(pts, halfW);
    if (!shape) return;

    const extrudeSettings = {
      depth,
      bevelEnabled: false,
    };

    try {
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      if (!geometry.index) {
        geometry.computeVertexNormals();
        const positionAttribute = geometry.getAttribute("position");
        if (positionAttribute) {
          const indices = [];
          for (let i = 0; i < positionAttribute.count; i++) indices.push(i);
          geometry.setIndex(indices);
        }
      }
      geometries.push(geometry);
    } catch (error) {
      console.error("Error creating strip-extruded geometry:", error);
    }
  });

  return geometries;
}

function createMeshesFromGeometries(geometries) {
  const group = new THREE.Group();
  geometries.forEach((geometry) => { group.add(createMesh(geometry)); });
  return group;
}

  const createBrush = (geometry) =>{
    return new Brush(
       geometry,
        new THREE.MeshPhongMaterial({
          color: new THREE.Color(Math.random() * 0xffffff),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        })
      );
  }

export {
  createScene, 
  createBrush,
  exportToSTL,
  createThreeDGeometry,
  createMesh,
  createThreeDGeometryLines,
  createMeshesFromGeometries
};
