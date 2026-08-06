import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
const colors = {
  green: darkMode ? 0x91c2b4 : 0x2f7164,
  deep: darkMode ? 0xdbe9e4 : 0x153f36,
  orange: darkMode ? 0xee9673 : 0xd76b43,
  pale: darkMode ? 0x263a33 : 0xdce8e2,
  skeleton: darkMode ? 0xff8a78 : 0xc83f38,
  bone: darkMode ? 0xb1ddce : 0x86c8b3,
};

function fitRenderer(renderer, camera, host) {
  const { width, height } = host.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  if (camera.isOrthographicCamera) {
    const halfHeight = (camera.userData.viewHeight || 6) * 0.5;
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
  } else {
    camera.aspect = width / height;
  }
  camera.updateProjectionMatrix();
}

function makeSoftPoints(count, sampler, colorA = colors.green, colorB = colors.orange) {
  const positions = new Float32Array(count * 3);
  const pointColors = new Float32Array(count * 3);
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  for (let i = 0; i < count; i += 1) {
    const p = sampler(i, count);
    positions.set([p.x, p.y, p.z], i * 3);
    const c = a.clone().lerp(b, p.mix ?? Math.random() * 0.35);
    pointColors.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(pointColors, 3));
  const material = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.82, sizeAttenuation: true });
  return new THREE.Points(geometry, material);
}

function addSkeleton(group, points, edges, scale = 1) {
  const skeleton = new THREE.Group();
  const vertices = [];
  edges.forEach(([a, b]) => vertices.push(...points[a], ...points[b]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const bones = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colors.skeleton, transparent: true, opacity: 0.82, depthTest: false }));
  bones.renderOrder = 4;
  skeleton.add(bones);
  const sphere = new THREE.SphereGeometry(0.055 * scale, 10, 10);
  const material = new THREE.MeshStandardMaterial({ color: colors.skeleton, roughness: 0.28, depthTest: false });
  const joints = new THREE.InstancedMesh(sphere, material, points.length);
  const dummy = new THREE.Object3D();
  points.forEach((point, index) => {
    dummy.position.fromArray(point);
    dummy.updateMatrix();
    joints.setMatrixAt(index, dummy.matrix);
  });
  skeleton.add(joints);
  joints.renderOrder = 5;
  group.add(skeleton);
  return skeleton;
}

function addFreeFormBones(group, positions, rotations) {
  if (!positions.length) return null;
  const boneCount = positions.length / 3;
  const sphereGeometry = new THREE.SphereGeometry(0.0115, 12, 8);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: colors.bone,
    emissive: colors.bone,
    emissiveIntensity: darkMode ? 0.24 : 0.05,
    roughness: 0.22,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const spheres = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, boneCount);
  const transform = new THREE.Object3D();
  for (let index = 0; index < boneCount; index += 1) {
    transform.position.fromArray(positions, index * 3);
    transform.quaternion.identity();
    transform.scale.setScalar(1);
    transform.updateMatrix();
    spheres.setMatrixAt(index, transform.matrix);
  }
  spheres.instanceMatrix.needsUpdate = true;
  spheres.renderOrder = 5;
  group.add(spheres);

  const axisLength = 0.034;
  const shaftLength = axisLength * 0.78;
  const tipLength = axisLength - shaftLength;
  const shaftGeometry = new THREE.CylinderGeometry(0.002, 0.002, shaftLength, 7);
  const tipGeometry = new THREE.ConeGeometry(0.0052, tipLength, 8);
  const axisColors = darkMode
    ? [0xff766e, 0x73d58c, 0x7da9ff]
    : [0xd94b45, 0x329455, 0x4779d4];
  const localY = new THREE.Vector3(0, 1, 0);
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();

  axisColors.forEach((color, axisIndex) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: false });
    const shafts = new THREE.InstancedMesh(shaftGeometry, material, boneCount);
    const tips = new THREE.InstancedMesh(tipGeometry, material, boneCount);
    for (let index = 0; index < boneCount; index += 1) {
      const r = index * 9;
      direction.set(
        rotations[r + axisIndex],
        rotations[r + 3 + axisIndex],
        rotations[r + 6 + axisIndex]
      ).normalize();
      origin.fromArray(positions, index * 3);
      transform.quaternion.setFromUnitVectors(localY, direction);
      transform.scale.setScalar(1);
      transform.position.copy(origin).addScaledVector(direction, shaftLength * 0.5);
      transform.updateMatrix();
      shafts.setMatrixAt(index, transform.matrix);
      transform.position.copy(origin).addScaledVector(direction, shaftLength + tipLength * 0.5);
      transform.updateMatrix();
      tips.setMatrixAt(index, transform.matrix);
    }
    shafts.instanceMatrix.needsUpdate = true;
    tips.instanceMatrix.needsUpdate = true;
    shafts.renderOrder = 6;
    tips.renderOrder = 6;
    group.add(shafts, tips);
  });
  return spheres;
}

async function loadActorAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Actor asset request failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const version = view.getUint32(4, true);
  if (magic !== "D3DG" || ![1, 2].includes(version)) {
    throw new Error("Unsupported actor asset format");
  }

  const pointCount = view.getUint32(8, true);
  const jointCount = view.getUint32(12, true);
  const edgeCount = view.getUint32(16, true);
  const boneCount = version >= 2 ? view.getUint32(20, true) : 0;
  let offset = version >= 2 ? 24 : 20;
  const positions = new Float32Array(buffer, offset, pointCount * 3);
  offset += pointCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  const pointColors = new Uint8Array(buffer, offset, pointCount * 3);
  offset = (offset + pointCount * 3 + 3) & ~3;
  const jointPositions = new Float32Array(buffer, offset, jointCount * 3);
  offset += jointCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  const edgeIndices = new Uint16Array(buffer, offset, edgeCount * 2);
  offset += edgeCount * 2 * Uint16Array.BYTES_PER_ELEMENT;
  const bonePositions = new Float32Array(buffer, offset, boneCount * 3);
  offset += boneCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  const boneRotations = new Float32Array(buffer, offset, boneCount * 9);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(pointColors, 3, true));
  geometry.computeBoundingBox();
  const material = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const cloud = new THREE.Points(geometry, material);
  const actor = new THREE.Group();
  actor.add(cloud);

  const joints = Array.from({ length: jointCount }, (_, index) =>
    Array.from(jointPositions.subarray(index * 3, index * 3 + 3))
  );
  const edges = Array.from({ length: edgeCount }, (_, index) =>
    Array.from(edgeIndices.subarray(index * 2, index * 2 + 2))
  );
  addSkeleton(actor, joints, edges, 0.34);
  addFreeFormBones(actor, bonePositions, boneRotations);

  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const skeletonBox = new THREE.Box3();
  for (let index = 0; index < jointCount; index += 1) {
    skeletonBox.expandByPoint(new THREE.Vector3().fromArray(jointPositions, index * 3));
  }
  const skeletonCenter = jointCount
    ? skeletonBox.getCenter(new THREE.Vector3())
    : center.clone();
  const pivot = new THREE.Vector3(skeletonCenter.x, center.y, skeletonCenter.z);
  const size = box.getSize(new THREE.Vector3());
  const scale = 5.05 / Math.max(size.y, 0.001);
  actor.scale.setScalar(scale);
  actor.position.copy(pivot).multiplyScalar(-scale);
  return actor;
}

function addStudio(scene) {
  scene.add(new THREE.HemisphereLight(0xf3f6f1, 0x718a81, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(colors.orange, 1.4);
  rim.position.set(-4, 1, -3);
  scene.add(rim);
}

function initHero() {
  const canvas = document.querySelector("#research-scene");
  if (!canvas) return;
  const host = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 40);
  camera.userData.viewHeight = 6.15;
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const rig = new THREE.Group();
  rig.rotation.set(0, 0, 0);
  scene.add(rig);

  const fallback = new THREE.Group();
  const cloud = makeSoftPoints(3000, () => {
    const t = Math.random();
    const y = (t - 0.5) * 5.1;
    const envelope = Math.sin(Math.PI * t);
    const radius = (0.18 + 1.12 * envelope) * (0.76 + 0.24 * Math.cos(3 * Math.PI * t));
    const angle = Math.random() * Math.PI * 2;
    const shell = Math.sqrt(Math.random());
    return {
      x: Math.cos(angle) * radius * shell + 0.27 * Math.sin(t * Math.PI * 1.5),
      y,
      z: Math.sin(angle) * radius * shell * 0.7,
      mix: 0.12 + t * 0.46,
    };
  });
  fallback.add(cloud);

  const joints = [[.12,-2.2,0],[.06,-1.35,0],[-.02,-.4,0],[.02,.5,0],[.16,1.38,0],[.36,2.13,0],[-.55,.68,0],[-1.17,.2,0],[-1.58,-.38,0],[.64,.76,0],[1.19,.28,0],[1.54,-.3,0]];
  addSkeleton(fallback, joints, [[0,1],[1,2],[2,3],[3,4],[4,5],[3,6],[6,7],[7,8],[3,9],[9,10],[10,11]], 1.1);
  rig.add(fallback);
  addStudio(scene);

  loadActorAsset(canvas.dataset.actorAsset || "/assets/actor01-frame773.d3dg")
    .then((actor) => {
      rig.remove(fallback);
      rig.add(actor);
      host.dataset.asset = "actorshq";
    })
    .catch((error) => {
      console.warn("Using procedural hero fallback:", error);
      host.dataset.asset = "fallback";
    });

  let pointerX = 0;
  let dragging = false;
  let dragRotation = 0;
  let previousX = 0;
  canvas.addEventListener("pointermove", (event) => {
    const rect = host.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - .5) * 2;
    if (dragging) {
      dragRotation += (event.clientX - previousX) * .009;
      previousX = event.clientX;
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    dragging = true;
    previousX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });
  const endDrag = (event) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  new ResizeObserver(() => fitRenderer(renderer, camera, host)).observe(host);
  fitRenderer(renderer, camera, host);

  const clock = new THREE.Clock();
  let heroVisible = true;
  new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }, { rootMargin: "120px" }).observe(host);
  function render() {
    if (!heroVisible) {
      requestAnimationFrame(render);
      return;
    }
    const t = reducedMotion ? 0 : clock.getElapsedTime();
    const targetY = dragRotation + t * .075 + pointerX * .055;
    rig.rotation.y += (targetY - rig.rotation.y) * .045;
    rig.rotation.x += (0 - rig.rotation.x) * .06;
    rig.rotation.z += (0 - rig.rotation.z) * .06;
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }
  render();
}

function createSkelebonesScene(group) {
  const cloud = makeSoftPoints(1000, () => {
    const a = Math.random() * Math.PI * 2;
    const y = (Math.random() - .5) * 2.2;
    const r = (.22 + .55 * (1 - Math.abs(y) / 2.2)) * Math.sqrt(Math.random());
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r * .65, mix: .15 + (y + 1.1) * .2 };
  });
  cloud.position.set(.35, .22, 0);
  group.add(cloud);
  const points = [[.35,-1.05,.05],[.32,-.5,.05],[.3,.05,.05],[.32,.58,.05],[.38,1.1,.05],[-.1,.45,.05],[-.62,.12,.05],[.73,.5,.05],[1.1,.08,.05]];
  addSkeleton(group, points, [[0,1],[1,2],[2,3],[3,4],[3,5],[5,6],[3,7],[7,8]], .8);
  return cloud;
}

function createAvatarScene(group) {
  const head = makeSoftPoints(1200, () => {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const face = Math.max(0, Math.sin(u)) * .1;
    return { x: Math.sin(v) * Math.cos(u) * .72, y: Math.cos(v) * .94 + .25, z: Math.sin(v) * Math.sin(u) * (.66 + face), mix: .18 + Math.random() * .24 };
  });
  group.add(head);
  const bust = new THREE.Mesh(new THREE.CylinderGeometry(.35, .85, .9, 32, 1, true), new THREE.MeshStandardMaterial({ color: colors.pale, transparent: true, opacity: .42, roughness: .85, side: THREE.DoubleSide }));
  bust.position.y = -.85;
  group.add(bust);
  return head;
}

function createHashfieldScene(group) {
  const planeMaterial = new THREE.MeshBasicMaterial({ color: colors.green, transparent: true, opacity: .12, side: THREE.DoubleSide, wireframe: true });
  for (let i = -1; i <= 1; i += 1) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9, 8, 8), planeMaterial);
    plane.rotation.set(-.35, -.55, 0);
    plane.position.set(i * .32, i * .12, i * -.3);
    group.add(plane);
  }
  const cubeGeometry = new THREE.BoxGeometry(.11, .11, .11);
  const cubes = new THREE.InstancedMesh(cubeGeometry, new THREE.MeshStandardMaterial({ color: colors.orange, roughness: .5 }), 34);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 34; i += 1) {
    dummy.position.set((Math.random()-.5)*1.55, (Math.random()-.5)*1.55, (Math.random()-.5)*1.1);
    dummy.scale.setScalar(.45 + Math.random() * .8);
    dummy.updateMatrix();
    cubes.setMatrixAt(i, dummy.matrix);
  }
  group.add(cubes);
  return cubes;
}

function normalizeModel(model, group) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2.4 / Math.max(size.x, size.y, size.z, .001);
  model.position.sub(center);
  model.scale.setScalar(scale);
  group.add(model);
}

function initProjectRoom(stage) {
  if (stage.dataset.initialized) return;
  stage.dataset.initialized = "true";
  const canvas = stage.querySelector("canvas");
  const room = stage.querySelector(".project-room");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 30);
  camera.position.set(0, .2, 5.2);
  const group = new THREE.Group();
  group.rotation.set(-.04, -.22, 0);
  scene.add(group);
  addStudio(scene);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.82, 1.0, .13, 48), new THREE.MeshStandardMaterial({ color: darkMode ? 0x41584f : 0xbacbc3, roughness: .8 }));
  pedestal.position.y = -1.28;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  let animatedObject;
  const modelUrl = stage.dataset.model;
  const actorAssetUrl = stage.dataset.asset;
  if (actorAssetUrl) {
    const actorFrame = new THREE.Group();
    actorFrame.scale.setScalar(.48);
    group.add(actorFrame);
    loadActorAsset(actorAssetUrl)
      .then((actor) => {
        actorFrame.add(actor);
        animatedObject = actorFrame;
        room.dataset.asset = "actorshq";
      })
      .catch((error) => {
        console.warn("Using procedural publication fallback:", error);
        group.remove(actorFrame);
        animatedObject = createSkelebonesScene(group);
        room.dataset.asset = "fallback";
      });
  } else if (modelUrl) {
    new GLTFLoader().load(modelUrl, (gltf) => {
      normalizeModel(gltf.scene, group);
      animatedObject = gltf.scene;
    }, undefined, () => { animatedObject = createSkelebonesScene(group); });
  } else if (stage.dataset.scene === "avatar") animatedObject = createAvatarScene(group);
  else if (stage.dataset.scene === "hashfield") animatedObject = createHashfieldScene(group);
  else animatedObject = createSkelebonesScene(group);

  new ResizeObserver(() => fitRenderer(renderer, camera, room)).observe(room);
  fitRenderer(renderer, camera, room);
  const clock = new THREE.Clock();
  let wasActive = true;
  let dragging = false;
  let previousX = 0;
  let targetRotation = group.rotation.y;
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    dragging = true;
    previousX = event.clientX;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    targetRotation += (event.clientX - previousX) * .012;
    previousX = event.clientX;
  });
  const endDrag = (event) => {
    dragging = false;
    canvas.style.cursor = "grab";
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  function render() {
    const hoverActive = finePointer.matches && stage.matches(":hover") && !stage.classList.contains("suppress-hover");
    const active = hoverActive || stage.classList.contains("is-open") || stage.classList.contains("is-closing");
    if (active) {
      const t = clock.getElapsedTime();
      if (!reducedMotion && !dragging) targetRotation += .0035;
      group.rotation.y += (targetRotation - group.rotation.y) * .12;
      group.position.y = reducedMotion ? 0 : Math.sin(t * 1.2) * .018;
    }
    if (active || wasActive) renderer.render(scene, camera);
    wasActive = active;
    requestAnimationFrame(render);
  }
  render();
}

function setRoomOpen(stage, open) {
  const wasOpen = stage.classList.contains("is-open");
  const door = stage.querySelector(".publication-door");
  if (open) {
    stage.classList.remove("is-closing");
    stage.classList.add("is-open");
  } else if (wasOpen) {
    stage.classList.remove("is-open");
    stage.classList.add("is-closing");
    const finishClosing = () => stage.classList.remove("is-closing");
    const handleAnimationEnd = (event) => {
      if (event.animationName !== "project-door-exit") return;
      door?.removeEventListener("animationend", handleAnimationEnd);
      finishClosing();
    };
    door?.addEventListener("animationend", handleAnimationEnd);
    window.setTimeout(finishClosing, reducedMotion ? 30 : 1000);
  }
  door?.setAttribute("aria-expanded", String(open));
  stage.querySelector(".project-room")?.setAttribute("aria-hidden", String(!open));
  const hint = stage.querySelector(".room-hint");
  if (hint) {
    hint.dataset.defaultText ||= hint.textContent;
    hint.textContent = open ? "Click outside to close" : hint.dataset.defaultText;
  }
  if (open) initProjectRoom(stage);
}

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

document.querySelectorAll("[data-project-room]").forEach((stage) => {
  const door = stage.querySelector(".publication-door");
  const toggle = stage.closest(".publication-card")?.querySelector(".room-toggle");
  stage.addEventListener("pointerenter", () => initProjectRoom(stage), { once: true });
  stage.addEventListener("focusin", () => initProjectRoom(stage), { once: true });
  stage.addEventListener("pointerleave", () => {
    if (!finePointer.matches) return;
    stage.classList.remove("suppress-hover");
  });

  const toggleRoom = () => {
    const willOpen = !stage.classList.contains("is-open");
    if (!willOpen && finePointer.matches && stage.matches(":hover")) {
      stage.classList.add("suppress-hover");
    }
    setRoomOpen(stage, willOpen);
    if (!willOpen) door?.blur();
  };

  door?.addEventListener("click", toggleRoom);
  toggle?.addEventListener("click", toggleRoom);
  document.addEventListener("pointerdown", (event) => {
    if (!stage.classList.contains("is-open")) return;
    if (stage.contains(event.target) || toggle?.contains(event.target)) return;
    setRoomOpen(stage, false);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll("[data-project-room].is-open").forEach((stage) => {
    setRoomOpen(stage, false);
    stage.querySelector(".publication-door")?.blur();
  });
});

initHero();
