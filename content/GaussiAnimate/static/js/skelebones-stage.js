import * as THREE from "three";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const STAGE_DURATION = 16000;
const SURFACE_COLOR = 0xf1f3ef;
const SKELETON_COLOR = 0xd25749;
const BONE_COLOR = 0x9fcbb8;
const PROJECTION_COLOR = 0x6f9383;
const STRUCTURE_RADIUS = 0.0038;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const range = (value, start, end) => smooth((value - start) / (end - start));

function parseD3DG(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const version = view.getUint32(4, true);
  if (magic !== "D3DG" || ![1, 2, 3, 4].includes(version)) {
    throw new Error("Unsupported D3DG asset");
  }

  const pointCount = view.getUint32(8, true);
  const jointCount = view.getUint32(12, true);
  const edgeCount = view.getUint32(16, true);
  const boneCount = version >= 2 ? view.getUint32(20, true) : 0;
  let offset = version >= 2 ? 24 : 20;

  const positions = new Float32Array(buffer, offset, pointCount * 3);
  offset += positions.byteLength;
  const colors = new Uint8Array(buffer, offset, pointCount * 3);
  offset = (offset + colors.byteLength + 3) & ~3;
  const joints = new Float32Array(buffer, offset, jointCount * 3);
  offset += joints.byteLength;
  const edges = new Uint16Array(buffer, offset, edgeCount * 2);
  offset += edges.byteLength;
  const bonePositions = new Float32Array(buffer, offset, boneCount * 3);
  offset += bonePositions.byteLength;
  const boneRotations = new Float32Array(buffer, offset, boneCount * 9);
  offset += boneRotations.byteLength;
  let skinningColors = null;
  let projectedPositions = null;
  let curvePositions = null;
  let curveEdges = null;
  if (version >= 3) {
    skinningColors = new Uint8Array(buffer, offset, pointCount * 3);
    offset = (offset + skinningColors.byteLength + 3) & ~3;
    projectedPositions = new Float32Array(buffer, offset, pointCount * 3);
    offset += projectedPositions.byteLength;
  }
  if (version >= 4) {
    const curvePointCount = view.getUint32(offset, true);
    const curveEdgeCount = view.getUint32(offset + 4, true);
    offset += 8;
    curvePositions = new Float32Array(buffer, offset, curvePointCount * 3);
    offset += curvePositions.byteLength;
    curveEdges = new Uint16Array(buffer, offset, curveEdgeCount * 2);
  }

  return {
    positions,
    colors,
    joints,
    edges,
    bonePositions,
    boneRotations,
    skinningColors,
    projectedPositions,
    curvePositions,
    curveEdges,
  };
}

function computeSkinningProjection(asset) {
  const pointCount = asset.positions.length / 3;
  if (asset.skinningColors && asset.projectedPositions) {
    return {
      projectedPositions: asset.projectedPositions,
      skinningColors: asset.skinningColors,
    };
  }

  const jointCount = asset.joints.length / 3;
  const edgeCount = asset.edges.length / 2;
  const projectedPositions = new Float32Array(asset.positions.length);
  const skinningColors = new Uint8Array(asset.colors.length);
  const jointColors = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < asset.positions.length; index += 3) {
    minX = Math.min(minX, asset.positions[index]);
    maxX = Math.max(maxX, asset.positions[index]);
    minY = Math.min(minY, asset.positions[index + 1]);
    maxY = Math.max(maxY, asset.positions[index + 1]);
  }

  for (let index = 0; index < jointCount; index += 1) {
    const x = asset.joints[index * 3];
    const y = asset.joints[index * 3 + 1];
    const normalizedX = (x - minX) / Math.max(maxX - minX, 0.001);
    const normalizedY = (y - minY) / Math.max(maxY - minY, 0.001);
    let hue;
    if (normalizedY > 0.76) {
      hue = 0.105;
    } else if (normalizedX < 0.4) {
      hue = 0.025 + normalizedY * 0.035;
    } else if (normalizedX > 0.6) {
      hue = 0.56 + normalizedY * 0.035;
    } else if (normalizedY < 0.38) {
      hue = 0.76;
    } else {
      hue = 0.38;
    }
    jointColors.push(new THREE.Color().setHSL(hue, 0.48, 0.56));
  }

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const positionOffset = pointIndex * 3;
    const px = asset.positions[positionOffset];
    const py = asset.positions[positionOffset + 1];
    const pz = asset.positions[positionOffset + 2];
    let bestDistance = Infinity;
    let bestX = px;
    let bestY = py;
    let bestZ = pz;
    let bestStartJoint = 0;
    let bestEndJoint = 0;
    let bestT = 0;

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const startJoint = asset.edges[edgeIndex * 2];
      const endJoint = asset.edges[edgeIndex * 2 + 1];
      const startOffset = startJoint * 3;
      const endOffset = endJoint * 3;
      const ax = asset.joints[startOffset];
      const ay = asset.joints[startOffset + 1];
      const az = asset.joints[startOffset + 2];
      const dx = asset.joints[endOffset] - ax;
      const dy = asset.joints[endOffset + 1] - ay;
      const dz = asset.joints[endOffset + 2] - az;
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      const t = clamp01(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / Math.max(lengthSquared, 1e-8));
      const qx = ax + dx * t;
      const qy = ay + dy * t;
      const qz = az + dz * t;
      const offsetX = px - qx;
      const offsetY = py - qy;
      const offsetZ = pz - qz;
      const distance = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = qx;
        bestY = qy;
        bestZ = qz;
        bestStartJoint = startJoint;
        bestEndJoint = endJoint;
        bestT = t;
      }
    }

    projectedPositions.set([bestX, bestY, bestZ], positionOffset);
    const skinningColor = jointColors[bestStartJoint].clone().lerp(
      jointColors[bestEndJoint],
      bestT,
    );
    skinningColors[positionOffset] = Math.round(skinningColor.r * 255);
    skinningColors[positionOffset + 1] = Math.round(skinningColor.g * 255);
    skinningColors[positionOffset + 2] = Math.round(skinningColor.b * 255);

  }

  return { projectedPositions, skinningColors };
}

function createCloud(asset) {
  const displayPositions = new Float32Array(asset.positions);
  const displayColors = new Uint8Array(asset.colors);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(displayPositions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(displayColors, 3, true));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const pointMaterial = new THREE.PointsMaterial({
    size: 0.0135,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const veilMaterial = new THREE.PointsMaterial({
    size: 0.028,
    vertexColors: true,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const cloud = new THREE.Points(geometry, pointMaterial);
  const veil = new THREE.Points(geometry, veilMaterial);
  cloud.renderOrder = 0;
  veil.renderOrder = 1;

  return {
    geometry,
    cloud,
    veil,
    pointMaterial,
    veilMaterial,
    displayPositions,
    displayColors,
    lastContraction: -1,
    lastColorMix: -1,
  };
}

function updateSurface(cloud, asset, projection, contraction, colorMix) {
  const positionChanged = Math.abs(contraction - cloud.lastContraction) > 0.001;
  const colorChanged = Math.abs(colorMix - cloud.lastColorMix) > 0.001;

  if (positionChanged) {
    for (let index = 0; index < asset.positions.length; index += 1) {
      cloud.displayPositions[index] = THREE.MathUtils.lerp(
        asset.positions[index],
        projection.projectedPositions[index],
        contraction,
      );
    }
    cloud.geometry.attributes.position.needsUpdate = true;
    cloud.lastContraction = contraction;
  }

  if (colorChanged) {
    for (let index = 0; index < asset.colors.length; index += 1) {
      cloud.displayColors[index] = Math.round(
        THREE.MathUtils.lerp(asset.colors[index], projection.skinningColors[index], colorMix),
      );
    }
    cloud.geometry.attributes.color.needsUpdate = true;
    cloud.lastColorMix = colorMix;
  }
}

function createCurveSkeleton(asset) {
  if (!asset.curvePositions || !asset.curveEdges) return null;

  const edgeCount = asset.curveEdges.length / 2;
  const edgeGeometry = new THREE.CylinderGeometry(
    STRUCTURE_RADIUS,
    STRUCTURE_RADIUS,
    1,
    10,
    1,
    false,
  );
  const material = new THREE.MeshBasicMaterial({
    color: PROJECTION_COLOR,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const mesh = new THREE.InstancedMesh(edgeGeometry, material, edgeCount);
  mesh.renderOrder = 3;

  const up = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const transform = new THREE.Object3D();
  for (let index = 0; index < edgeCount; index += 1) {
    start.fromArray(asset.curvePositions, asset.curveEdges[index * 2] * 3);
    end.fromArray(asset.curvePositions, asset.curveEdges[index * 2 + 1] * 3);
    direction.copy(end).sub(start);
    const length = direction.length();
    transform.position.copy(start).addScaledVector(direction, 0.5);
    transform.quaternion.setFromUnitVectors(up, direction.normalize());
    transform.scale.set(1, length, 1);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return { mesh, material };
}

function createSkeleton(asset) {
  const edgeCount = asset.edges.length / 2;
  const jointCount = asset.joints.length / 3;
  const edgeGeometry = new THREE.CylinderGeometry(
    STRUCTURE_RADIUS,
    STRUCTURE_RADIUS,
    1,
    10,
    1,
    false,
  );
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: SKELETON_COLOR,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const edges = new THREE.InstancedMesh(edgeGeometry, edgeMaterial, edgeCount);
  edges.renderOrder = 4;

  const jointGeometry = new THREE.SphereGeometry(0.0115, 14, 10);
  const jointMaterial = new THREE.MeshBasicMaterial({
    color: SKELETON_COLOR,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const joints = new THREE.InstancedMesh(jointGeometry, jointMaterial, jointCount);
  joints.renderOrder = 5;

  const edgeTransforms = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < edgeCount; index += 1) {
    const startIndex = asset.edges[index * 2] * 3;
    const endIndex = asset.edges[index * 2 + 1] * 3;
    const start = new THREE.Vector3().fromArray(asset.joints, startIndex);
    const end = new THREE.Vector3().fromArray(asset.joints, endIndex);
    const direction = end.clone().sub(start);
    edgeTransforms.push({
      start,
      direction: direction.clone().normalize(),
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize()),
    });
  }

  return {
    edges,
    joints,
    edgeMaterial,
    jointMaterial,
    edgeTransforms,
    jointCount,
  };
}

function createFreeFormBones(asset) {
  const boneCount = asset.bonePositions.length / 3;
  const centerGeometry = new THREE.SphereGeometry(0.015, 16, 12);
  const centerMaterial = new THREE.MeshStandardMaterial({
    color: BONE_COLOR,
    emissive: 0x33594a,
    emissiveIntensity: 0.04,
    metalness: 0,
    roughness: 0.9,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const centers = new THREE.InstancedMesh(centerGeometry, centerMaterial, boneCount);
  centers.renderOrder = 6;

  const axisGeometry = new THREE.CylinderGeometry(0.0027, 0.0027, 1, 8);
  const axisColors = [0xc85c54, 0x63a47b, 0x5c78a8];
  const axisMaterials = axisColors.map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthTest: false,
      }),
  );
  const axes = axisMaterials.map((material) => {
    const mesh = new THREE.InstancedMesh(axisGeometry, material, boneCount);
    mesh.renderOrder = 7;
    return mesh;
  });

  const localY = new THREE.Vector3(0, 1, 0);
  const axisLength = 0.054;
  const directions = axisMaterials.map(() => []);
  for (let boneIndex = 0; boneIndex < boneCount; boneIndex += 1) {
    const rotationOffset = boneIndex * 9;
    for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
      const direction = new THREE.Vector3(
        asset.boneRotations[rotationOffset + axisIndex],
        asset.boneRotations[rotationOffset + 3 + axisIndex],
        asset.boneRotations[rotationOffset + 6 + axisIndex],
      ).normalize();
      directions[axisIndex].push({
        direction,
        quaternion: new THREE.Quaternion().setFromUnitVectors(localY, direction),
      });
    }
  }

  return {
    centers,
    centerMaterial,
    axes,
    axisMaterials,
    axisLength,
    directions,
    boneCount,
  };
}

function updateSkeleton(skeleton, asset, reveal) {
  const transform = new THREE.Object3D();
  const edgeCount = skeleton.edgeTransforms.length;
  skeleton.edgeMaterial.opacity = 0.94 * reveal;
  skeleton.jointMaterial.opacity = 0.98 * reveal;

  skeleton.edgeTransforms.forEach((edge, index) => {
    const localReveal = range(reveal, (index / edgeCount) * 0.58, 0.38 + (index / edgeCount) * 0.58);
    transform.position.copy(edge.start).addScaledVector(edge.direction, edge.length * localReveal * 0.5);
    transform.quaternion.copy(edge.quaternion);
    transform.scale.set(1, edge.length * localReveal, 1);
    transform.updateMatrix();
    skeleton.edges.setMatrixAt(index, transform.matrix);
  });
  skeleton.edges.instanceMatrix.needsUpdate = true;

  for (let index = 0; index < skeleton.jointCount; index += 1) {
    const localReveal = range(reveal, (index / skeleton.jointCount) * 0.48, 0.35 + (index / skeleton.jointCount) * 0.48);
    transform.position.fromArray(asset.joints, index * 3);
    transform.quaternion.identity();
    transform.scale.setScalar(localReveal);
    transform.updateMatrix();
    skeleton.joints.setMatrixAt(index, transform.matrix);
  }
  skeleton.joints.instanceMatrix.needsUpdate = true;
}

function updateFreeFormBones(bones, asset, reveal) {
  const transform = new THREE.Object3D();
  bones.centerMaterial.opacity = 0.92 * reveal;
  bones.axisMaterials.forEach((material) => {
    material.opacity = 0.9 * reveal;
  });

  for (let index = 0; index < bones.boneCount; index += 1) {
    const localReveal = range(reveal, (index / bones.boneCount) * 0.6, 0.32 + (index / bones.boneCount) * 0.6);
    const position = new THREE.Vector3().fromArray(asset.bonePositions, index * 3);

    transform.position.copy(position);
    transform.quaternion.identity();
    transform.scale.setScalar(localReveal);
    transform.updateMatrix();
    bones.centers.setMatrixAt(index, transform.matrix);

    for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
      const axis = bones.directions[axisIndex][index];
      transform.position.copy(position).addScaledVector(
        axis.direction,
        bones.axisLength * localReveal * 0.5,
      );
      transform.quaternion.copy(axis.quaternion);
      transform.scale.set(1, bones.axisLength * localReveal, 1);
      transform.updateMatrix();
      bones.axes[axisIndex].setMatrixAt(index, transform.matrix);
    }
  }

  bones.centers.instanceMatrix.needsUpdate = true;
  bones.axes.forEach((axis) => {
    axis.instanceMatrix.needsUpdate = true;
  });
}

function setStageCopy(stage, phase) {
  if (stage.dataset.phase === phase) return;
  stage.dataset.phase = phase;
  const methodShowcase = stage.closest(".method-showcase");

  const phaseCopy = {
    skinning: ["01", "Skinning field"],
    projection: ["02", "Curve projection"],
    kinematic: ["03", "Kinematic tree"],
    bones: ["04", "Free-form bones"],
  };
  stage.querySelector("[data-stage-index]").textContent = phaseCopy[phase][0];
  stage.querySelector("[data-stage-label]").textContent = phaseCopy[phase][1];
  methodShowcase?.querySelectorAll("[data-stage-marker]").forEach((marker) => {
    marker.classList.toggle("is-active", marker.dataset.stageMarker === phase);
  });
}

function fitRenderer(renderer, camera, stage) {
  const canvas = stage.querySelector("canvas");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 2));
  renderer.setSize(width, height, false);
  const viewHeight = 2.55;
  const halfHeight = viewHeight * 0.5;
  const halfWidth = halfHeight * (width / height);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

async function initSkelebonesStage(stage) {
  const canvas = stage.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(SURFACE_COLOR, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x75877e, 2.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  scene.add(key);

  const response = await fetch(stage.dataset.asset);
  if (!response.ok) throw new Error(`Research asset request failed (${response.status})`);
  const asset = parseD3DG(await response.arrayBuffer());
  const projection = computeSkinningProjection(asset);
  const cloud = createCloud(asset);
  const coloredCloud = createCloud(asset);
  coloredCloud.pointMaterial.size = 0.014;
  coloredCloud.pointMaterial.opacity = 0;
  coloredCloud.veilMaterial.opacity = 0;
  const curveSkeleton = createCurveSkeleton(asset);
  const skeleton = createSkeleton(asset);
  const bones = createFreeFormBones(asset);

  const geometryGroup = new THREE.Group();
  geometryGroup.add(
    cloud.cloud,
    cloud.veil,
    coloredCloud.cloud,
    coloredCloud.veil,
    skeleton.edges,
    skeleton.joints,
    bones.centers,
    ...bones.axes,
  );
  if (curveSkeleton) geometryGroup.add(curveSkeleton.mesh);
  const pivot = cloud.geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = cloud.geometry.boundingBox.getSize(new THREE.Vector3());
  geometryGroup.position.copy(pivot).multiplyScalar(-1);

  const actor = new THREE.Group();
  actor.add(geometryGroup);
  actor.scale.setScalar(2.15 / Math.max(size.y, 0.001));
  actor.rotation.y = -0.18;
  scene.add(actor);

  let startTime = performance.now();
  let visible = true;
  let dragging = false;
  let previousX = 0;
  let dragRotation = 0;
  let userInteractionTime = 0;

  const replayButton = stage.querySelector("[data-stage-replay]");
  replayButton.addEventListener("click", () => {
    startTime = performance.now();
    setStageCopy(stage, "skinning");
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    dragging = true;
    previousX = event.clientX;
    userInteractionTime = performance.now();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    dragRotation += (event.clientX - previousX) * 0.007;
    previousX = event.clientX;
    userInteractionTime = performance.now();
  });
  const finishDrag = (event) => {
    dragging = false;
    userInteractionTime = performance.now();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);

  new ResizeObserver(() => fitRenderer(renderer, camera, stage)).observe(canvas);
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
    },
    { rootMargin: "140px" },
  ).observe(stage);
  fitRenderer(renderer, camera, stage);

  stage.classList.add("is-ready");

  function render(now) {
    if (!prefersReducedMotion) requestAnimationFrame(render);
    if (!visible && !prefersReducedMotion) return;

    const progress = prefersReducedMotion
      ? 0.9
      : ((now - startTime) % STAGE_DURATION) / STAGE_DURATION;

    let skeletonReveal = 0;
    let boneReveal = 0;
    let contraction = 0;
    let colorMix = 0;
    let curveOpacity = 0;
    let surfaceReveal = 0;
    let phase = "skinning";

    if (progress < 0.2) {
      colorMix = range(progress, 0.045, 0.18);
      phase = "skinning";
    } else if (progress < 0.42) {
      contraction = range(progress, 0.245, 0.42);
      colorMix = 1;
      curveOpacity = 0.92 * range(progress, 0.2, 0.265);
      phase = "projection";
    } else if (progress < 0.59) {
      contraction = 1;
      colorMix = 1;
      curveOpacity = 0.38;
      skeletonReveal = range(progress, 0.42, 0.575);
      phase = "kinematic";
    } else if (progress < 0.65) {
      contraction = 1;
      colorMix = 1;
      surfaceReveal = range(progress, 0.59, 0.65);
      curveOpacity = 0.38 * (1 - surfaceReveal);
      skeletonReveal = 1;
      phase = "bones";
    } else if (progress < 0.85) {
      contraction = 1;
      colorMix = 1;
      surfaceReveal = 1;
      skeletonReveal = 1;
      boneReveal = range(progress, 0.65, 0.81);
      phase = "bones";
    } else if (progress < 0.95) {
      contraction = 1;
      colorMix = 1;
      surfaceReveal = 1;
      skeletonReveal = 1;
      boneReveal = 1;
      phase = "bones";
    } else {
      const dissolve = range(progress, 0.95, 1);
      contraction = 1;
      colorMix = 1;
      surfaceReveal = 1;
      skeletonReveal = 1 - dissolve;
      boneReveal = 1 - dissolve;
      phase = "bones";
    }

    if (prefersReducedMotion) {
      contraction = 1;
      colorMix = 1;
      surfaceReveal = 1;
      skeletonReveal = 1;
      boneReveal = 1;
      phase = "bones";
    }

    const methodCloudOpacity =
      THREE.MathUtils.lerp(0.9, 0.38, contraction)
      * THREE.MathUtils.lerp(1, 0.18, skeletonReveal)
      * (1 - surfaceReveal);
    const coloredCloudOpacity = 0.9 * surfaceReveal;
    updateSurface(
      cloud,
      asset,
      projection,
      contraction,
      colorMix,
    );
    cloud.pointMaterial.opacity = methodCloudOpacity;
    cloud.veilMaterial.opacity = methodCloudOpacity * 0.075;
    cloud.pointMaterial.size = THREE.MathUtils.lerp(0.014, 0.0065, contraction);
    coloredCloud.pointMaterial.opacity = coloredCloudOpacity;
    coloredCloud.veilMaterial.opacity = coloredCloudOpacity * 0.075;
    if (curveSkeleton) curveSkeleton.material.opacity = curveOpacity;
    updateSkeleton(skeleton, asset, skeletonReveal);
    updateFreeFormBones(bones, asset, boneReveal);
    setStageCopy(stage, phase);

    const seconds = now * 0.001;
    const autoRotation = now - userInteractionTime > 1800 && !prefersReducedMotion
      ? Math.sin(seconds * 0.18) * 0.2
      : 0;
    const targetRotation = -0.18 + dragRotation + autoRotation;
    actor.rotation.y += (targetRotation - actor.rotation.y) * 0.055;
    actor.rotation.x += (0 - actor.rotation.x) * 0.08;
    actor.rotation.z += (0 - actor.rotation.z) * 0.08;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}

function initComparisonVideoCleanup() {
  const resultPages = document.querySelectorAll(".cloth-page, .animal-page, .actor-page");
  resultPages.forEach((page) => {
    page.querySelectorAll(".columns.is-multiline").forEach((row) => {
      if (row.querySelector(".title.is-6") && !row.querySelector("video")) {
        row.classList.add("comparison-legend");
      }
    });
  });

  document.querySelectorAll("video").forEach((video) => {
    const source = video.querySelector("source");
    const sourceUrl = source?.getAttribute("data-src") || source?.getAttribute("src") || "";
    if (!/(?:error_|overlap_)?comparison\.mp4(?:$|\?)/.test(sourceUrl)) return;
    if (video.parentElement?.classList.contains("clean-video-crop")) return;

    const frame = document.createElement("div");
    frame.className = "clean-video-crop";
    video.parentNode.insertBefore(frame, video);
    frame.appendChild(video);

    const applyCrop = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const crop = 0.065;
      frame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight * (1 - crop)}`;
      video.style.top = `${(-crop / (1 - crop)) * 100}%`;
    };
    video.addEventListener("loadedmetadata", applyCrop);
    applyCrop();
  });
}

initComparisonVideoCleanup();

const stage = document.querySelector("[data-skelebones-stage]");
if (stage) {
  initSkelebonesStage(stage).catch((error) => {
    console.warn("Unable to initialize the Skelebones stage:", error);
    stage.classList.add("is-error");
    stage.querySelector(".skelebones-stage-fallback").textContent =
      "The interactive representation could not be loaded.";
  });
}
