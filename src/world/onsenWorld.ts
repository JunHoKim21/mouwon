import * as THREE from 'three';
import { ProceduralTextureBundle } from './proceduralTextures';
import { ACTION_SPOTS, WishYuzuItem } from './ritualMath';
import {
  BATH_RIM_ROCKS,
  FOOT_STREAM_STEPSTONES,
  LANDMARKS,
  WORLD_CENTER_Z,
  YUZU_POND_RIM_ROCKS,
  footStreamCenterZ,
  groundHeightAt,
  terrainMeshHeightAt,
} from './terrainMath';

export interface NightLightRef {
  light: THREE.PointLight;
  baseIntensity: number;
}

export interface InteractionCueState {
  hoveredKind: string | null;
  nearbyKind: string | null;
  carryingFirewood: boolean;
}

export interface OnsenWorldController {
  group: THREE.Group;
  walkableMeshes: THREE.Object3D[];
  interactables: THREE.Object3D[];
  nightLights: NightLightRef[];
  lanternGlowMaterials: THREE.MeshStandardMaterial[];
  steamMaterial: THREE.PointsMaterial;
  waterMaterials: THREE.MeshPhysicalMaterial[];
  syncWishYuzus: (wishes: readonly WishYuzuItem[]) => void;
  triggerShishiOdoshi: () => void;
  triggerEggRitual: (onComplete?: () => void) => boolean;
  stokeFirewood: () => void;
  setDestinationMarker: (x: number, y: number, z: number, visible: boolean) => void;
  update: (
    dt: number,
    elapsed: number,
    nightBlend: number,
    isSittingBench: boolean,
    cueState?: InteractionCueState,
  ) => void;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function distToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

export function createOnsenWorld(
  textures: ProceduralTextureBundle,
  isSoftwareGl: boolean,
): OnsenWorldController {
  const group = new THREE.Group();
  group.name = 'MyoyuwonWorld';

  const walkableMeshes: THREE.Object3D[] = [];
  const interactables: THREE.Object3D[] = [];
  const nightLights: NightLightRef[] = [];
  const lanternGlowMaterials: THREE.MeshStandardMaterial[] = [];
  const waterMaterials: THREE.MeshPhysicalMaterial[] = [];
  const extraTextures: THREE.Texture[] = [];
  const rand = seededRand(88421);

  const createSignTexture = (
    bgHex: string,
    borderHex: string,
    textHex: string,
    title: string,
    subtitle?: string,
  ): THREE.CanvasTexture | null => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    ctx.fillStyle = textHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (subtitle) {
      ctx.font = '700 34px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.fillText(title, canvas.width / 2, 40);
      ctx.font = '600 21px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.globalAlpha = 0.88;
      ctx.fillText(subtitle, canvas.width / 2, 80);
    } else {
      ctx.font = '700 36px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.fillText(title, canvas.width / 2, canvas.height / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    extraTextures.push(tex);
    return tex;
  };

  const createGinghamTowelTexture = (): THREE.CanvasTexture | null => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#e7edf5';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(69, 103, 145, 0.55)';
    for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 64);
    for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 8);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    extraTextures.push(tex);
    return tex;
  };

  // Shared materials
  const hinokiMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hinokiMap,
    bumpMap: textures.hinokiBump,
    bumpScale: 0.035,
    roughness: 0.78,
    metalness: 0.02,
  });

  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: 0x5c422f,
    map: textures.hinokiMap,
    bumpMap: textures.hinokiBump,
    bumpScale: 0.03,
    roughness: 0.84,
    metalness: 0.04,
  });

  const wetStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.06,
    roughness: 0.52,
    metalness: 0.08,
  });

  const snowCapMat = new THREE.MeshStandardMaterial({
    color: 0xf4f8fb,
    map: textures.snowMap,
    bumpMap: textures.snowBump,
    bumpScale: 0.025,
    roughness: 0.9,
    metalness: 0.0,
  });

  const roofTileMat = new THREE.MeshStandardMaterial({
    color: 0x36404a,
    roughness: 0.65,
    metalness: 0.12,
  });

  const tatamiMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.tatamiMap,
    roughness: 0.88,
    metalness: 0.0,
  });

  const shojiMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.shojiMap,
    emissive: new THREE.Color('#ffaa4f'),
    emissiveIntensity: 0.18,
    roughness: 0.85,
  });
  lanternGlowMaterials.push(shojiMat);

  // Helper to create warm amber lantern glow material + point light (never casts shadows!)
  const createLantern = (
    x: number,
    y: number,
    z: number,
    radius = 0.22,
    height = 0.36,
    lightIntensity = 5.5,
    lightDistance = 16,
  ): THREE.Group => {
    const lantern = new THREE.Group();
    lantern.position.set(x, y, z);

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xfff1d6,
      emissive: new THREE.Color('#ff9e3b'),
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });
    lanternGlowMaterials.push(glowMat);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius, height, 8),
      glowMat,
    );
    body.castShadow = false;
    lantern.add(body);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 1.45, height * 0.45, 6),
      darkTimberMat,
    );
    cap.position.y = height * 0.65;
    cap.castShadow = false;
    lantern.add(cap);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.15, radius * 1.15, 0.05, 8),
      darkTimberMat,
    );
    base.position.y = -height * 0.52;
    base.castShadow = false;
    lantern.add(base);

    const pointLight = new THREE.PointLight('#ff9e3b', 0, lightDistance, 1.6);
    pointLight.castShadow = false; // Crucial: never occlude floor/cat
    pointLight.position.set(0, 0.05, 0);
    lantern.add(pointLight);
    nightLights.push({ light: pointLight, baseIntensity: lightIntensity });

    return lantern;
  };

  // =========================================================================
  // 1. CONTINUOUS SNOWY TERRAIN + PATHWAYS + DISTANT SNOW MOUNTAINS
  // =========================================================================
  const terrainSize = 420;
  const segs = 112;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(0, 0, WORLD_CENTER_Z);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cSnow = new THREE.Color('#eef4f8');
  const cPath = new THREE.Color('#8e8b84');
  const cWetBed = new THREE.Color('#5b615d');
  const cCliff = new THREE.Color('#778392');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = terrainMeshHeightAt(vx, vz);
    posAttr.setY(i, vy);

    tmpColor.copy(cSnow);

    // Flagstone walking trails connecting key landmarks
    const dMain = distToSegment2D(vx, vz, 0, 35, 0, 12);
    const dBathToPav = distToSegment2D(vx, vz, 0, -4, 0, -6);
    const dToYuzu = distToSegment2D(vx, vz, -6, 6, -15, 10);
    const dToMilk = distToSegment2D(vx, vz, 7, 5, 15, 8);
    const dToBamboo = distToSegment2D(vx, vz, -1.5, 34, -22, 32.5);
    const dToFirewood = distToSegment2D(vx, vz, -6.5, -13, -3.5, -26);
    const dToFootStream = distToSegment2D(vx, vz, 11, 13, 19.5, 26.5);
    const pathDist = Math.min(
      dMain,
      dBathToPav,
      dToYuzu,
      dToMilk,
      dToBamboo,
      dToFirewood,
      dToFootStream,
    );
    if (pathDist < 2.2) {
      const blend = Math.max(0, 1 - pathDist / 2.2);
      tmpColor.lerp(cPath, blend * 0.72);
    }

    // Wet mineral stone beneath bath, yuzu pond, and creek
    if (vy < -0.1) {
      const wetT = Math.min(1, (-vy - 0.1) * 3.5);
      tmpColor.lerp(cWetBed, wetT);
    }

    // Exposed mountain rock faces on steep outer peaks
    if (vy > 4.5) {
      const slopeT = Math.min(1, (vy - 4.5) / 14);
      tmpColor.lerp(cCliff, slopeT * 0.45);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.snowMap,
    bumpMap: textures.snowBump,
    bumpScale: 0.04,
    roughness: 0.92,
    metalness: 0.0,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  terrainMesh.name = 'SnowTerrain';
  group.add(terrainMesh);
  walkableMeshes.push(terrainMesh);

  // Tobi-ishi stepping stones guiding from bridge to bath, yuzu pond, and milk booth
  const stepStoneGeo = new THREE.CylinderGeometry(0.65, 0.72, 0.1, 8);
  const steppingStones: [number, number, number][] = [
    [0.3, 33.2, 1.15],
    [-0.35, 31.1, 1.0],
    [0.25, 29.0, 1.2],
    [-0.3, 26.8, 1.05],
    [0.35, 24.6, 1.15],
    [-0.25, 22.4, 1.0],
    [0.25, 20.2, 1.2],
    [-0.3, 18.0, 1.05],
    [0.2, 15.8, 1.15],
    [-0.15, 13.7, 1.25],
    // Branch to yuzu pond
    [-9.5, 6.2, 0.95],
    [-11.6, 7.6, 1.0],
    [-13.6, 8.8, 0.9],
    // Branch to milk booth
    [9.6, 5.2, 0.95],
    [11.4, 6.4, 1.05],
    [12.8, 7.3, 0.9],
  ];
  for (const [sx, sz, sc] of steppingStones) {
    const st = new THREE.Mesh(stepStoneGeo, wetStoneMat);
    const sy = terrainMeshHeightAt(sx, sz);
    st.position.set(sx, sy + 0.03, sz);
    st.scale.set(sc, 1, sc * 0.85);
    st.rotation.y = rand() * Math.PI;
    st.castShadow = false;
    st.receiveShadow = true;
    group.add(st);
  }

  // =========================================================================
  // 2. CENTRAL OPEN-AIR HINOKI BATH (0, 4), RADIUS 9m
  // =========================================================================
  const bathGroup = new THREE.Group();
  bathGroup.position.set(LANDMARKS.mainBath.x, 0, LANDMARKS.mainBath.z);
  group.add(bathGroup);

  // Inner bath plank floor (-0.30m)
  const bathFloorGeo = new THREE.CircleGeometry(7.7, 36);
  bathFloorGeo.rotateX(-Math.PI / 2);
  const bathFloor = new THREE.Mesh(bathFloorGeo, hinokiMat);
  bathFloor.position.y = -0.3;
  bathFloor.receiveShadow = true;
  bathGroup.add(bathFloor);
  walkableMeshes.push(bathFloor);

  // Hinoki wooden rim built from 24 curved segments leaving South & North stair openings
  const segCount = 28;
  const arcStep = (Math.PI * 2) / segCount;
  const rimBlockGeo = new THREE.BoxGeometry(2.15, 0.86, 1.38);
  const rimCapGeo = new THREE.BoxGeometry(2.22, 0.14, 1.52);

  for (let i = 0; i < segCount; i++) {
    const angle = i * arcStep;
    const lx = Math.sin(angle) * 8.28;
    const lz = Math.cos(angle) * 8.28;
    // Leave clean 4.2m wide stair entrances on South (+Z) and North (-Z)
    if (Math.abs(lx) < 2.05 && Math.abs(lz) > 6.5) continue;

    const wall = new THREE.Mesh(rimBlockGeo, hinokiMat);
    wall.position.set(lx, 0.05, lz);
    wall.rotation.y = angle;
    wall.castShadow = true;
    wall.receiveShadow = true;
    bathGroup.add(wall);

    const cap = new THREE.Mesh(rimCapGeo, hinokiMat);
    cap.position.set(lx, 0.46, lz);
    cap.rotation.y = angle;
    cap.castShadow = false;
    cap.receiveShadow = true;
    bathGroup.add(cap);
  }

  // Entry stairs on South (+Z) and North (-Z)
  for (const dir of [1, -1]) {
    const steps = [
      { z: 6.2 * dir, y: -0.14, d: 1.4, h: 0.28 },
      { z: 7.45 * dir, y: 0.14, d: 1.5, h: 0.36 },
      { z: 8.6 * dir, y: 0.34, d: 1.4, h: 0.32 },
      { z: 9.85 * dir, y: 0.16, d: 1.4, h: 0.24 },
    ];
    for (const s of steps) {
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, s.h, s.d),
        hinokiMat,
      );
      stepMesh.position.set(0, s.y - s.h * 0.25, s.z);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = false;
      bathGroup.add(stepMesh);
      walkableMeshes.push(stepMesh);
    }
  }

  // Translucent hot spring water surface at y = 0.22
  const createWaterMaterial = (hexColor: string, opacity = 0.88) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(hexColor),
      emissive: new THREE.Color('#21454c'),
      emissiveIntensity: 0.22,
      roughness: 0.14,
      metalness: 0.04,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float rDist = length(position.xz);
        transformed.y += sin(rDist * 2.1 - uTime * 1.9) * 0.012 + cos(position.x * 1.4 + uTime * 1.3) * 0.008;
        `,
      );
    };
    waterMaterials.push(mat);
    return mat;
  };

  const bathWaterGeo = new THREE.CircleGeometry(7.65, 48);
  bathWaterGeo.rotateX(-Math.PI / 2);
  const bathWaterMat = createWaterMaterial('#85bec6', 0.89);
  const pondWaterMat = createWaterMaterial('#b4d4c6', 0.8);

  const bathWater = new THREE.Mesh(bathWaterGeo, bathWaterMat);
  bathWater.position.y = LANDMARKS.mainBath.waterLevel;
  bathWater.receiveShadow = true;
  bathWater.userData.interactType = 'main_bath';
  bathGroup.add(bathWater);
  interactables.push(bathWater);

  // Floating yuzu fruits & hinoki bath bucket inside the main bath
  const yuzuMat = new THREE.MeshStandardMaterial({
    color: 0xf4be2b,
    roughness: 0.42,
    metalness: 0.02,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x4b7f3a,
    roughness: 0.6,
  });
  const yuzuGeo = new THREE.SphereGeometry(0.11, 12, 10);
  const yuzuLeafGeo = new THREE.BoxGeometry(0.08, 0.015, 0.04);

  const floatingYuzus: { mesh: THREE.Group; phase: number; baseY: number }[] = [];
  const createFloatingYuzu = (parent: THREE.Group, x: number, y: number, z: number) => {
    const yg = new THREE.Group();
    yg.position.set(x, y, z);
    const fruit = new THREE.Mesh(yuzuGeo, yuzuMat);
    fruit.scale.set(1.06, 0.92, 1.06);
    fruit.castShadow = false;
    const leaf = new THREE.Mesh(yuzuLeafGeo, leafMat);
    leaf.position.set(0.03, 0.1, 0);
    leaf.rotation.z = 0.25;
    yg.add(fruit, leaf);
    parent.add(yg);
    floatingYuzus.push({ mesh: yg, phase: rand() * Math.PI * 2, baseY: y });
  };

  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.6 + rand() * 4.8;
    createFloatingYuzu(bathGroup, Math.cos(a) * r, 0.21, Math.sin(a) * r);
  }

  // Wet rocks & snow caps around outer rim matching BATH_RIM_ROCKS colliders
  // (castShadow = false so night PointLight shines freely!)
  const rockGeo = new THREE.DodecahedronGeometry(0.85, 1);
  const snowRockCapGeo = new THREE.SphereGeometry(0.68, 10, 8);
  snowRockCapGeo.scale(1.0, 0.36, 1.0);

  for (const rSpec of BATH_RIM_ROCKS) {
    const rockGroup = new THREE.Group();
    rockGroup.position.set(rSpec.lx, 0.15, rSpec.lz);

    const rock = new THREE.Mesh(rockGeo, wetStoneMat);
    rock.scale.set(rSpec.sx, rSpec.sy, rSpec.sz);
    rock.rotation.set(rSpec.rotX, rSpec.rotY, rSpec.rotZ);
    rock.castShadow = false;
    rock.receiveShadow = true;
    rockGroup.add(rock);

    const snowCap = new THREE.Mesh(snowRockCapGeo, snowCapMat);
    snowCap.scale.set(rSpec.sx * 0.95, rSpec.sy * 0.85, rSpec.sz * 0.95);
    snowCap.position.y = rSpec.sy * 0.56;
    snowCap.castShadow = false;
    snowCap.receiveShadow = true;
    rockGroup.add(snowCap);

    bathGroup.add(rockGroup);
  }

  // Central bath warm PointLight (night glow) + 4 perimeter stone lanterns (castShadow = false)
  const bathNightLight = new THREE.PointLight('#ff9e3b', 0, 24, 1.35);
  bathNightLight.position.set(0, 2.2, 0);
  bathNightLight.castShadow = false;
  bathGroup.add(bathNightLight);
  nightLights.push({ light: bathNightLight, baseIntensity: 16 });

  const bathLanternSpots = [
    [-5.4, 8.2],
    [5.4, 8.2],
    [-6.6, -6.8],
    [6.6, -6.8],
  ];
  for (const [lx, lz] of bathLanternSpots) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 0.75, 6),
      wetStoneMat,
    );
    post.position.set(lx, 0.35, lz);
    post.castShadow = false;
    bathGroup.add(post);
    bathGroup.add(createLantern(lx, 0.88, lz, 0.22, 0.34, 7.5, 16));
  }

  // =========================================================================
  // 3. MYOYEONGAK PAVILION (0, -12) — WOODEN & TATAMI RESTING HALL
  // =========================================================================
  const pavGroup = new THREE.Group();
  pavGroup.position.set(LANDMARKS.myoyeongak.x, 0, LANDMARKS.myoyeongak.z);
  group.add(pavGroup);

  // Raised timber deck platform
  const deckMesh = new THREE.Mesh(
    new THREE.BoxGeometry(12.8, 0.56, 9.6),
    darkTimberMat,
  );
  deckMesh.position.set(0, 0.16, 0.4);
  deckMesh.receiveShadow = true;
  deckMesh.castShadow = true;
  pavGroup.add(deckMesh);
  walkableMeshes.push(deckMesh);

  // Front wooden steps facing +Z toward bath
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.16, 0.65),
      hinokiMat,
    );
    step.position.set(0, 0.08 + s * 0.13, 6.9 - s * 0.65);
    step.receiveShadow = true;
    pavGroup.add(step);
    walkableMeshes.push(step);
  }

  // Tatami interior floor
  const tatamiFloor = new THREE.Mesh(
    new THREE.BoxGeometry(10.6, 0.04, 7.2),
    tatamiMat,
  );
  tatamiFloor.position.set(0, 0.45, -0.4);
  tatamiFloor.receiveShadow = true;
  pavGroup.add(tatamiFloor);
  walkableMeshes.push(tatamiFloor);

  // Timber pillars (6)
  const pillarGeo = new THREE.CylinderGeometry(0.18, 0.2, 3.2, 8);
  const pillarCoords = [
    [-5.5, 3.6],
    [5.5, 3.6],
    [-5.5, 0],
    [5.5, 0],
    [-5.5, -3.8],
    [5.5, -3.8],
  ];
  for (const [px, pz] of pillarCoords) {
    const pillar = new THREE.Mesh(pillarGeo, darkTimberMat);
    pillar.position.set(px, 2.04, pz);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    pavGroup.add(pillar);
  }

  // Translucent glowing shoji walls (back & sides)
  const backShoji = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, 2.8, 0.14),
    shojiMat,
  );
  backShoji.position.set(0, 1.85, -3.9);
  pavGroup.add(backShoji);

  const leftShoji = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 2.8, 7.5),
    shojiMat,
  );
  leftShoji.position.set(-5.5, 1.85, -0.2);
  const rightShoji = leftShoji.clone();
  rightShoji.position.x = 5.5;
  pavGroup.add(leftShoji, rightShoji);

  // Tiered overhanging roof + snow cover (darker slate eave overhang pops cleanly)
  const lowerRoof = new THREE.Mesh(
    new THREE.ConeGeometry(10.1, 2.25, 4),
    roofTileMat,
  );
  lowerRoof.rotation.y = Math.PI / 4;
  lowerRoof.scale.set(1.14, 1.0, 0.9);
  lowerRoof.position.set(0, 4.35, 0.2);
  lowerRoof.castShadow = true;
  lowerRoof.receiveShadow = true;
  pavGroup.add(lowerRoof);

  const upperRoofSnow = new THREE.Mesh(
    new THREE.ConeGeometry(9.0, 1.85, 4),
    snowCapMat,
  );
  upperRoofSnow.rotation.y = Math.PI / 4;
  upperRoofSnow.scale.set(1.02, 0.88, 0.8);
  upperRoofSnow.position.set(0, 4.72, 0.2);
  upperRoofSnow.castShadow = false;
  upperRoofSnow.receiveShadow = true;
  pavGroup.add(upperRoofSnow);

  const ridgeBeam = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.35, 0.45),
    darkTimberMat,
  );
  ridgeBeam.position.set(0, 5.55, 0.2);
  pavGroup.add(ridgeBeam);

  // Cozy floor cushions (zabuton) + central hearth embers
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xb64b3b,
    roughness: 0.88,
  });
  const cushionGeo = new THREE.BoxGeometry(0.85, 0.1, 0.85);
  for (const [cx, cz] of [
    [-2.4, -0.5],
    [2.4, -0.5],
    [-2.4, 1.6],
    [2.4, 1.6],
  ]) {
    const cushion = new THREE.Mesh(cushionGeo, cushionMat);
    cushion.position.set(cx, 0.51, cz);
    pavGroup.add(cushion);
  }

  // Hanging eaves lanterns & warm interior glow
  pavGroup.add(createLantern(-3.8, 2.95, 4.2, 0.24, 0.42, 9.0, 18));
  pavGroup.add(createLantern(3.8, 2.95, 4.2, 0.24, 0.42, 9.0, 18));

  // =========================================================================
  // 4. YUZU WISH POND (-18, 10)
  // =========================================================================
  const yuzuGroup = new THREE.Group();
  yuzuGroup.position.set(LANDMARKS.yuzuPond.x, 0, LANDMARKS.yuzuPond.z);
  group.add(yuzuGroup);

  const pondWaterGeo = new THREE.CircleGeometry(3.6, 32);
  pondWaterGeo.rotateX(-Math.PI / 2);
  const pondWater = new THREE.Mesh(pondWaterGeo, pondWaterMat);
  pondWater.position.y = LANDMARKS.yuzuPond.waterLevel;
  pondWater.userData.interactType = 'yuzu_pond';
  yuzuGroup.add(pondWater);
  interactables.push(pondWater);

  // Stone rim around pond matching YUZU_POND_RIM_ROCKS colliders (castShadow = false)
  for (const rSpec of YUZU_POND_RIM_ROCKS) {
    const stone = new THREE.Mesh(rockGeo, wetStoneMat);
    stone.position.set(rSpec.lx, 0.08, rSpec.lz);
    stone.scale.set(rSpec.sx, rSpec.sy, rSpec.sz);
    stone.rotation.y = rSpec.rotY;
    stone.castShadow = false;
    stone.receiveShadow = true;
    stone.userData.interactType = 'yuzu_pond';
    yuzuGroup.add(stone);
    interactables.push(stone);
  }

  // Ambient floating yuzus + Dynamic Glowing Wish Yuzus container
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.8 + rand() * 2.2;
    createFloatingYuzu(yuzuGroup, Math.cos(a) * r, 0.08, Math.sin(a) * r);
  }

  const wishYuzusGroup = new THREE.Group();
  yuzuGroup.add(wishYuzusGroup);
  const wishYuzuMeshes: { mesh: THREE.Group; phase: number; baseY: number }[] = [];

  // Shared geometries for wish yuzus (disposed once in world.dispose())
  const wishFruitGeo = new THREE.SphereGeometry(0.16, 14, 12);
  const wishLeafGeo = new THREE.BoxGeometry(0.11, 0.018, 0.055);
  const wishGlowRingGeo = new THREE.RingGeometry(0.18, 0.27, 20).rotateX(-Math.PI / 2);

  const syncWishYuzus = (wishes: readonly WishYuzuItem[]) => {
    while (wishYuzusGroup.children.length > 0) {
      const child = wishYuzusGroup.children[0];
      wishYuzusGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (
            obj.geometry !== wishFruitGeo &&
            obj.geometry !== wishLeafGeo &&
            obj.geometry !== wishGlowRingGeo
          ) {
            obj.geometry.dispose();
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (m !== leafMat) m.dispose();
            });
          } else if (obj.material !== leafMat) {
            obj.material.dispose();
          }
        }
      });
    }
    wishYuzuMeshes.length = 0;

    // Remove stale wish_yuzu refs from interactables
    for (let i = interactables.length - 1; i >= 0; i--) {
      if (interactables[i].userData.interactType === 'wish_yuzu') {
        interactables.splice(i, 1);
      }
    }

    for (const wish of wishes) {
      const yg = new THREE.Group();
      yg.position.set(wish.localX, 0.1, wish.localZ);

      const fruitMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(wish.colorHex),
        emissive: new THREE.Color(wish.colorHex),
        emissiveIntensity: 0.45,
        roughness: 0.32,
      });
      const fruit = new THREE.Mesh(wishFruitGeo, fruitMat);
      fruit.scale.set(1.06, 0.92, 1.06);
      fruit.userData = { interactType: 'wish_yuzu', wishId: wish.id };

      const leaf = new THREE.Mesh(wishLeafGeo, leafMat);
      leaf.position.set(0.04, 0.14, 0);
      leaf.rotation.z = 0.25;
      leaf.userData = { interactType: 'wish_yuzu', wishId: wish.id };

      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(wish.colorHex),
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const glowRing = new THREE.Mesh(wishGlowRingGeo, glowMat);
      glowRing.position.y = -0.01;

      yg.add(fruit, leaf, glowRing);
      wishYuzusGroup.add(yg);
      interactables.push(fruit, leaf);
      wishYuzuMeshes.push({ mesh: yg, phase: wish.phase, baseY: 0.1 });
    }
  };

  // Traditional stone lantern next to yuzu pond
  const toroBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.45, 0.9, 6),
    wetStoneMat,
  );
  toroBase.position.set(4.0, 0.42, 2.6);
  toroBase.castShadow = false;
  yuzuGroup.add(toroBase);
  yuzuGroup.add(createLantern(4.0, 1.08, 2.6, 0.24, 0.36, 7.0, 14));

  // =========================================================================
  // 5. BOTTLED MILK VENDING MACHINE & WOODEN BENCH (16, 8)
  // =========================================================================
  const milkGroup = new THREE.Group();
  milkGroup.position.set(LANDMARKS.milkBooth.x, 0, LANDMARKS.milkBooth.z);
  group.add(milkGroup);

  // Stone patio base
  const patio = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.1, 5.4),
    wetStoneMat,
  );
  patio.position.set(0, 0.03, 0);
  patio.receiveShadow = true;
  milkGroup.add(patio);
  walkableMeshes.push(patio);

  // Retro milk vending machine at local (+1.5, -1.8) -> world (17.5, 6.2)
  const vmGroup = new THREE.Group();
  vmGroup.position.set(1.5, 0.06, -1.8);
  vmGroup.rotation.y = -0.35;
  milkGroup.add(vmGroup);

  const vmCreamMat = new THREE.MeshStandardMaterial({
    color: 0xf0e4ce,
    roughness: 0.45,
    metalness: 0.1,
  });
  const vmRedMat = new THREE.MeshStandardMaterial({
    color: 0xb84638,
    roughness: 0.5,
  });
  const vmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: new THREE.Color('#ffcf87'),
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });
  lanternGlowMaterials.push(vmWindowMat);

  const vmBody = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.15, 0.95), vmCreamMat);
  vmBody.position.y = 1.08;
  vmBody.castShadow = true;
  vmBody.receiveShadow = true;
  vmBody.userData.interactType = 'milk_vending';
  vmGroup.add(vmBody);
  interactables.push(vmBody);

  const vmHeader = new THREE.Mesh(new THREE.BoxGeometry(1.49, 0.34, 0.99), vmRedMat);
  vmHeader.position.y = 2.0;
  vmHeader.userData.interactType = 'milk_vending';
  vmGroup.add(vmHeader);
  interactables.push(vmHeader);

  const vmSignTex = createSignTexture(
    '#fff6e4',
    '#b84638',
    '#4a251c',
    '🥛 온천 우유',
    '꾹꾹이 25회 · 클릭',
  );
  const vmSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.3),
    new THREE.MeshBasicMaterial({ map: vmSignTex ?? undefined, color: 0xffffff }),
  );
  vmSign.position.set(0, 2.0, 0.502);
  vmSign.userData.interactType = 'milk_vending';
  vmGroup.add(vmSign);
  interactables.push(vmSign);

  const vmSnowRoof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 1.08), snowCapMat);
  vmSnowRoof.position.y = 2.21;
  vmGroup.add(vmSnowRoof);

  const vmWindow = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.85, 0.08), vmWindowMat);
  vmWindow.position.set(0, 1.32, 0.46);
  vmWindow.userData.interactType = 'milk_vending';
  vmGroup.add(vmWindow);
  interactables.push(vmWindow);

  // Miniature milk bottles inside display
  const bottleColors = [0xf7df7c, 0xf2a7b8, 0xfaf8f2, 0xb8d9a8];
  const bottleGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.22, 10);
  for (let i = 0; i < 4; i++) {
    const bMat = new THREE.MeshStandardMaterial({
      color: bottleColors[i],
      roughness: 0.25,
    });
    const bottle = new THREE.Mesh(bottleGeo, bMat);
    bottle.position.set(-0.36 + i * 0.24, 1.15, 0.5);
    bottle.userData.interactType = 'milk_vending';
    vmGroup.add(bottle);
    interactables.push(bottle);
  }

  const vmDispenser = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.28, 0.08), darkTimberMat);
  vmDispenser.position.set(0, 0.42, 0.46);
  vmDispenser.userData.interactType = 'milk_vending';
  vmGroup.add(vmDispenser);
  interactables.push(vmDispenser);

  const vmLight = new THREE.PointLight('#ffd296', 0, 10, 1.6);
  vmLight.position.set(0, 1.35, 1.0);
  vmLight.castShadow = false;
  vmGroup.add(vmLight);
  nightLights.push({ light: vmLight, baseIntensity: 4.5 });

  // Solid wood platform bench (평상) at local (-1.9, +0.8) -> world (14.1, 8.8)
  const benchGroup = new THREE.Group();
  benchGroup.position.set(-1.9, 0, 0.8);
  milkGroup.add(benchGroup);

  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, 2.6), hinokiMat);
  benchTop.position.y = 0.28;
  benchTop.castShadow = true;
  benchTop.receiveShadow = true;
  benchTop.userData.interactType = 'milk_bench';
  benchGroup.add(benchTop);
  walkableMeshes.push(benchTop);
  interactables.push(benchTop);

  for (const [lx, lz] of [
    [-1.4, -1.05],
    [1.4, -1.05],
    [-1.4, 1.05],
    [1.4, 1.05],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), darkTimberMat);
    leg.position.set(lx, 0.13, lz);
    benchGroup.add(leg);
  }

  const benchCloth = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.03, 1.85), cushionMat);
  benchCloth.position.set(0.35, 0.35, 0);
  benchCloth.userData.interactType = 'milk_bench';
  benchGroup.add(benchCloth);
  interactables.push(benchCloth);

  // Cute Korean long-tailed tit (오목눈이 / 뱁새) companion bird near the bench
  const birdGroup = new THREE.Group();
  birdGroup.position.set(
    ACTION_SPOTS.benchBirdPerchHigh.x,
    ACTION_SPOTS.benchBirdPerchHigh.y,
    ACTION_SPOTS.benchBirdPerchHigh.z,
  );
  const birdWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfaf9f5, roughness: 0.9 });
  const birdDarkMat = new THREE.MeshStandardMaterial({ color: 0x3b3838, roughness: 0.78 });
  const birdBeakMat = new THREE.MeshStandardMaterial({ color: 0x262426, roughness: 0.5 });

  const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), birdWhiteMat);
  birdBody.scale.set(1.0, 0.96, 1.12);
  birdGroup.add(birdBody);

  const birdWingGeo = new THREE.SphereGeometry(0.055, 8, 8);
  birdWingGeo.scale(0.35, 0.65, 1.25);
  const birdWingL = new THREE.Mesh(birdWingGeo, birdDarkMat);
  birdWingL.position.set(0.072, 0.01, -0.02);
  const birdWingR = new THREE.Mesh(birdWingGeo, birdDarkMat);
  birdWingR.position.set(-0.072, 0.01, -0.02);
  birdGroup.add(birdWingL, birdWingR);

  const birdTail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.008, 0.16, 6),
    birdDarkMat,
  );
  birdTail.rotation.x = Math.PI * 0.35;
  birdTail.position.set(0, 0.03, -0.11);
  birdGroup.add(birdTail);

  const birdEyeGeo = new THREE.SphereGeometry(0.014, 8, 8);
  const birdEyeL = new THREE.Mesh(birdEyeGeo, birdBeakMat);
  birdEyeL.position.set(0.042, 0.028, 0.072);
  const birdEyeR = new THREE.Mesh(birdEyeGeo, birdBeakMat);
  birdEyeR.position.set(-0.042, 0.028, 0.072);
  const birdBeak = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.028, 4), birdBeakMat);
  birdBeak.rotation.x = Math.PI * 0.5;
  birdBeak.position.set(0, 0.012, 0.095);
  birdGroup.add(birdEyeL, birdEyeR, birdBeak);
  group.add(birdGroup);

  // =========================================================================
  // 6. BAMBOO FOREST & SHISHI-ODOSHI (-24, 33)
  // =========================================================================
  const bambooGroup = new THREE.Group();
  bambooGroup.position.set(LANDMARKS.bambooShishi.x, 0, LANDMARKS.bambooShishi.z);
  group.add(bambooGroup);

  const bambooMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.bambooMap,
    roughness: 0.62,
    metalness: 0.04,
  });
  const bambooCount = 42;
  const bambooCulmGeo = new THREE.CylinderGeometry(0.07, 0.095, 6.2, 8);
  bambooCulmGeo.translate(0, 3.1, 0);
  const bambooInst = new THREE.InstancedMesh(bambooCulmGeo, bambooMat, bambooCount);
  bambooInst.castShadow = true;
  bambooInst.receiveShadow = true;

  const bambooLeafGeo = new THREE.ConeGeometry(0.75, 1.9, 6);
  const bambooLeafMat = new THREE.MeshStandardMaterial({
    color: 0x567a41,
    roughness: 0.8,
  });
  const bambooLeafInst = new THREE.InstancedMesh(
    bambooLeafGeo,
    bambooLeafMat,
    bambooCount,
  );

  const dummy = new THREE.Object3D();
  for (let i = 0; i < bambooCount; i++) {
    let bx = -2.8;
    let bz = 2.8;
    let placed = false;

    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = rand() * Math.PI * 2;
      const rad = 2.2 + rand() * 5.6;
      const candX = Math.cos(angle) * rad;
      const candZ = Math.sin(angle) * rad;
      const worldX = LANDMARKS.bambooShishi.x + candX;
      const worldZ = LANDMARKS.bambooShishi.z + candZ;

      const tooCloseToBasin = Math.hypot(candX - 1.5, candZ + 1.5) < 1.55;
      // Leave the SE arrival clearing & camera orbit corridor open around (-20.2, 30.8)
      const inCameraCorridor =
        Math.hypot(worldX + 19.2, worldZ - 29.5) < 4.5 ||
        (candX > 1.2 && candZ < 0.8);

      if (!tooCloseToBasin && !inCameraCorridor) {
        bx = candX;
        bz = candZ;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const fallbackAngle = Math.PI * 0.55 + (i / bambooCount) * Math.PI * 1.1;
      const fallbackRad = 3.2 + (i % 4) * 1.1;
      bx = Math.cos(fallbackAngle) * fallbackRad;
      bz = Math.sin(fallbackAngle) * fallbackRad;
    }

    const by = groundHeightAt(LANDMARKS.bambooShishi.x + bx, LANDMARKS.bambooShishi.z + bz);
    const hScale = 0.72 + rand() * 0.55;

    dummy.position.set(bx, by - 0.1, bz);
    dummy.rotation.set((rand() - 0.5) * 0.1, rand() * Math.PI, (rand() - 0.5) * 0.1);
    dummy.scale.set(0.85 + rand() * 0.3, hScale, 0.85 + rand() * 0.3);
    dummy.updateMatrix();
    bambooInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(bx, by + 5.6 * hScale, bz);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(0.85 + rand() * 0.35);
    dummy.updateMatrix();
    bambooLeafInst.setMatrixAt(i, dummy.matrix);
  }
  bambooInst.computeBoundingSphere();
  bambooLeafInst.computeBoundingSphere();
  bambooGroup.add(bambooInst, bambooLeafInst);

  // Shishi-odoshi bamboo rocker + stone basin at (-22.5, 31.5) -> local (+1.5, -1.5)
  const shishiGroup = new THREE.Group();
  shishiGroup.position.set(1.5, 0.1, -1.5);
  shishiGroup.rotation.y = 0.75;
  bambooGroup.add(shishiGroup);

  const basinRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.78, 0.45, 12),
    wetStoneMat,
  );
  basinRim.position.y = 0.2;
  basinRim.castShadow = false;
  basinRim.userData.interactType = 'shishi_odoshi';
  shishiGroup.add(basinRim);
  interactables.push(basinRim);

  const basinWater = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2),
    pondWaterMat,
  );
  basinWater.position.y = 0.44;
  basinWater.userData.interactType = 'shishi_odoshi';
  shishiGroup.add(basinWater);
  interactables.push(basinWater);

  // Vertical bamboo support posts
  for (const sx of [-0.24, 0.24]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.95, 8),
      bambooMat,
    );
    post.position.set(sx, 0.48, -0.45);
    post.userData.interactType = 'shishi_odoshi';
    shishiGroup.add(post);
    interactables.push(post);
  }

  // Animated rocking bamboo tube
  const shishiRockerPivot = new THREE.Group();
  shishiRockerPivot.position.set(0, 0.78, -0.45);
  shishiGroup.add(shishiRockerPivot);

  const rockerTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.065, 1.25, 10),
    bambooMat,
  );
  rockerTube.rotation.x = Math.PI / 2;
  rockerTube.userData.interactType = 'shishi_odoshi';
  shishiRockerPivot.add(rockerTube);
  interactables.push(rockerTube);

  // Pouring water stream burst when shishi-odoshi tips
  const shishiStream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.045, 0.65, 8),
    new THREE.MeshBasicMaterial({
      color: 0xdff4fa,
      transparent: true,
      opacity: 0.68,
    }),
  );
  shishiStream.position.set(0, 0.56, 0.06);
  shishiStream.visible = false;
  shishiGroup.add(shishiStream);

  let shishiManualTimer = 0;
  const triggerShishiOdoshi = () => {
    shishiManualTimer = 1.4;
  };

  // =========================================================================
  // 7. SPAWN ENTRANCE WOODEN BRIDGE (0, 38)
  // =========================================================================
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(LANDMARKS.entranceBridge.x, 0, LANDMARKS.entranceBridge.z);
  group.add(bridgeGroup);

  // Arched plank deck built from 14 planks matching groundHeightAt
  const plankGeo = new THREE.BoxGeometry(4.1, 0.16, 0.64);
  for (let i = 0; i < 14; i++) {
    const lz = -3.9 + i * 0.6;
    const t = Math.abs(lz) / LANDMARKS.entranceBridge.halfL;
    const ly = 0.42 * Math.cos(t * Math.PI * 0.5);
    const slope = -0.42 * (Math.PI / (2 * LANDMARKS.entranceBridge.halfL)) * Math.sin(t * Math.PI * 0.5) * Math.sign(lz);

    const plank = new THREE.Mesh(plankGeo, hinokiMat);
    plank.position.set(0, ly - 0.05, lz);
    plank.rotation.x = -slope;
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);
    walkableMeshes.push(plank);
  }

  // Side timber beams & railings
  for (const side of [-2.02, 2.02]) {
    for (const pz of [-3.6, -1.8, 0, 1.8, 3.6]) {
      const t = Math.abs(pz) / LANDMARKS.entranceBridge.halfL;
      const py = 0.42 * Math.cos(t * Math.PI * 0.5);
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.92, 0.18),
        darkTimberMat,
      );
      post.position.set(side, py + 0.42, pz);
      post.castShadow = true;
      bridgeGroup.add(post);
    }

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, 7.6),
      darkTimberMat,
    );
    rail.position.set(side, 0.92, 0);
    bridgeGroup.add(rail);
  }

  // 4 bridge corner lanterns welcoming the player
  bridgeGroup.add(createLantern(-2.02, 1.15, -3.6, 0.19, 0.3, 6.0, 14));
  bridgeGroup.add(createLantern(2.02, 1.15, -3.6, 0.19, 0.3, 6.0, 14));
  bridgeGroup.add(createLantern(-2.02, 1.15, 3.6, 0.19, 0.3, 6.0, 14));
  bridgeGroup.add(createLantern(2.02, 1.15, 3.6, 0.19, 0.3, 6.0, 14));

  // Creek water ribbon running East-West underneath the bridge
  const creekGeo = new THREE.PlaneGeometry(76, 5.5, 24, 4);
  creekGeo.rotateX(-Math.PI / 2);
  const cPos = creekGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cPos.count; i++) {
    const cx = cPos.getX(i);
    cPos.setZ(i, cPos.getZ(i) + Math.sin(cx * 0.11) * 1.4);
  }
  creekGeo.computeVertexNormals();
  const creekWater = new THREE.Mesh(creekGeo, pondWaterMat);
  creekWater.position.set(0, -0.14, 38);
  group.add(creekWater);

  // =========================================================================
  // 7b. FIREWOOD YARD & AGUNGI HEARTH (-3, -28)
  // =========================================================================
  const firewoodGroup = new THREE.Group();
  firewoodGroup.position.set(LANDMARKS.firewoodYard.x, 0, LANDMARKS.firewoodYard.z);
  group.add(firewoodGroup);

  const fyPatio = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.6, 0.08, 20),
    wetStoneMat,
  );
  fyPatio.position.set(0, 0.02, 0);
  fyPatio.receiveShadow = true;
  fyPatio.castShadow = false;
  firewoodGroup.add(fyPatio);
  walkableMeshes.push(fyPatio);

  // Firewood log rack & stacked logs at local (-2.2, 0) -> world (-5.2, -28.0)
  const rackGroup = new THREE.Group();
  rackGroup.position.set(-2.2, 0.05, 0);
  firewoodGroup.add(rackGroup);

  const rackFrameGeo = new THREE.BoxGeometry(0.1, 0.95, 0.1);
  for (const [rx, rz] of [
    [-0.7, -0.32],
    [0.7, -0.32],
    [-0.7, 0.32],
    [0.7, 0.32],
  ]) {
    const post = new THREE.Mesh(rackFrameGeo, darkTimberMat);
    post.position.set(rx, 0.48, rz);
    post.castShadow = false;
    post.userData.interactType = 'firewood_pile';
    rackGroup.add(post);
    interactables.push(post);
  }
  const rackShelf = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.08, 0.72),
    darkTimberMat,
  );
  rackShelf.position.set(0, 0.12, 0);
  rackShelf.castShadow = false;
  rackShelf.userData.interactType = 'firewood_pile';
  rackGroup.add(rackShelf);
  interactables.push(rackShelf);

  const rackRoof = new THREE.Mesh(
    new THREE.BoxGeometry(1.66, 0.09, 0.88),
    hinokiMat,
  );
  rackRoof.position.set(0, 0.98, 0);
  rackRoof.castShadow = false;
  rackRoof.userData.interactType = 'firewood_pile';
  rackGroup.add(rackRoof);
  interactables.push(rackRoof);

  const rackSnow = new THREE.Mesh(
    new THREE.BoxGeometry(1.64, 0.06, 0.86),
    snowCapMat,
  );
  rackSnow.position.set(0, 1.05, 0);
  rackSnow.castShadow = false;
  rackGroup.add(rackSnow);

  const firewoodBarkMat = new THREE.MeshStandardMaterial({
    color: 0x6f4a2e,
    roughness: 0.9,
  });
  const firewoodCutMat = new THREE.MeshStandardMaterial({
    color: 0xdcb989,
    roughness: 0.78,
  });
  const stackedLogGeo = new THREE.CylinderGeometry(0.11, 0.115, 0.66, 8);
  stackedLogGeo.rotateX(Math.PI / 2);
  const logCapGeo = new THREE.CircleGeometry(0.105, 8);

  const logRows: [number, number][] = [
    [-0.45, 0.27],
    [-0.22, 0.27],
    [0.01, 0.27],
    [0.24, 0.27],
    [0.47, 0.27],
    [-0.33, 0.46],
    [-0.1, 0.46],
    [0.13, 0.46],
    [0.36, 0.46],
    [-0.18, 0.65],
    [0.08, 0.65],
    [0.31, 0.65],
  ];
  for (const [lx, ly] of logRows) {
    const log = new THREE.Mesh(stackedLogGeo, firewoodBarkMat);
    log.position.set(lx, ly, 0);
    log.castShadow = false;
    log.userData.interactType = 'firewood_pile';
    rackGroup.add(log);
    interactables.push(log);

    const endF = new THREE.Mesh(logCapGeo, firewoodCutMat);
    endF.position.set(lx, ly, 0.335);
    endF.userData.interactType = 'firewood_pile';
    rackGroup.add(endF);
    interactables.push(endF);
  }

  // Folded checkered tenugui towel on a hinoki tray beside firewood rack
  const towelTray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.36), hinokiMat);
  towelTray.position.set(1.0, 0.055, 0.22);
  towelTray.castShadow = false;
  towelTray.userData.interactType = 'firewood_pile';
  rackGroup.add(towelTray);
  interactables.push(towelTray);

  const towelTex = createGinghamTowelTexture();
  const chkPropMat = new THREE.MeshStandardMaterial({
    color: towelTex ? 0xffffff : 0x456791,
    map: towelTex ?? undefined,
    roughness: 0.86,
  });
  const chkProp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.085, 0.26), chkPropMat);
  chkProp.position.set(1.0, 0.115, 0.22);
  chkProp.castShadow = false;
  chkProp.userData.interactType = 'firewood_pile';
  rackGroup.add(chkProp);
  interactables.push(chkProp);

  // Small signboard on the firewood rack beam
  const firewoodSignTex = createSignTexture(
    '#f6ebd8',
    '#6b482e',
    '#3c291b',
    '🪵 장작 집기',
    '아궁이로 옮겨 불 지피기',
  );
  const firewoodSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.16, 0.32),
    new THREE.MeshBasicMaterial({ map: firewoodSignTex ?? undefined, color: 0xffffff }),
  );
  firewoodSign.position.set(0, 1.16, 0.42);
  firewoodSign.rotation.x = -0.14;
  firewoodSign.userData.interactType = 'firewood_pile';
  rackGroup.add(firewoodSign);
  interactables.push(firewoodSign);

  // Agungi Hearth Furnace at local (+2.2, -0.4) -> world (-0.8, -28.4)
  const furnaceGroup = new THREE.Group();
  furnaceGroup.position.set(2.2, 0.05, -0.4);
  firewoodGroup.add(furnaceGroup);

  const clayMat = new THREE.MeshStandardMaterial({
    color: 0x86503b,
    roughness: 0.86,
    metalness: 0.04,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x2c2f33,
    roughness: 0.45,
    metalness: 0.68,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x5c2214,
    emissive: new THREE.Color('#ff5d1a'),
    emissiveIntensity: 1.1,
    roughness: 0.6,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffa738,
    transparent: true,
    opacity: 0.88,
  });

  const hearthBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.18, 0.62, 12),
    wetStoneMat,
  );
  hearthBase.position.y = 0.31;
  hearthBase.castShadow = false;
  hearthBase.receiveShadow = true;
  hearthBase.userData.interactType = 'firewood_furnace';
  furnaceGroup.add(hearthBase);
  interactables.push(hearthBase);

  const hearthDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.96, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    clayMat,
  );
  hearthDome.position.y = 0.56;
  hearthDome.castShadow = false;
  hearthDome.userData.interactType = 'firewood_furnace';
  furnaceGroup.add(hearthDome);
  interactables.push(hearthDome);

  const chimneyPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.24, 1.35, 10),
    clayMat,
  );
  chimneyPipe.position.set(0.35, 1.65, -0.45);
  chimneyPipe.castShadow = false;
  chimneyPipe.userData.interactType = 'firewood_furnace';
  furnaceGroup.add(chimneyPipe);
  interactables.push(chimneyPipe);

  const kettle = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 14, 10),
    ironMat,
  );
  kettle.scale.set(1.0, 0.72, 1.0);
  kettle.position.set(-0.08, 1.38, 0.04);
  kettle.castShadow = false;
  kettle.userData.interactType = 'firewood_furnace';
  furnaceGroup.add(kettle);
  interactables.push(kettle);

  const emberBed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.48, 0.14, 10),
    emberMat,
  );
  emberBed.position.set(0, 0.26, 0.78);
  emberBed.userData.interactType = 'firewood_furnace';
  furnaceGroup.add(emberBed);
  interactables.push(emberBed);

  const furnaceFlames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.14, 0.42, 7);
  for (let i = 0; i < 3; i++) {
    const fl = new THREE.Mesh(flameGeo, flameMat);
    fl.position.set((i - 1) * 0.16, 0.48, 0.82);
    furnaceGroup.add(fl);
    furnaceFlames.push(fl);
  }

  const furnaceFireLight = new THREE.PointLight('#ff8433', 4.5, 15, 1.5);
  furnaceFireLight.position.set(0, 0.8, 1.1);
  furnaceFireLight.castShadow = false;
  furnaceGroup.add(furnaceFireLight);

  // Grounded stone plinth & timber post supporting the yard lantern
  const fyLanternPlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.27, 0.16, 8),
    wetStoneMat,
  );
  fyLanternPlinth.position.set(-2.6, 0.12, 2.2);
  fyLanternPlinth.castShadow = false;
  fyLanternPlinth.receiveShadow = true;
  const fyLanternPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 1.24, 8),
    darkTimberMat,
  );
  fyLanternPost.position.set(-2.6, 0.78, 2.2);
  fyLanternPost.castShadow = false;
  firewoodGroup.add(fyLanternPlinth, fyLanternPost);
  firewoodGroup.add(createLantern(-2.6, 1.5, 2.2, 0.2, 0.32, 6.5, 14));

  let furnaceBoostTimer = 0;
  let stokedLogsCount = 0;
  const stokeFirewood = () => {
    furnaceBoostTimer = 10.0;
    stokedLogsCount = Math.min(8, stokedLogsCount + 1);
  };

  // =========================================================================
  // 7c. SE BATH ONSEN EGG BASKET & DIPPING WELL (3.7, 11.7)
  // =========================================================================
  const eggWellGroup = new THREE.Group();
  eggWellGroup.position.set(LANDMARKS.eggBasket.x, 0, LANDMARKS.eggBasket.z);
  group.add(eggWellGroup);

  const eggWellRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.64, 0.46, 12),
    wetStoneMat,
  );
  eggWellRim.position.y = 0.22;
  eggWellRim.castShadow = false;
  eggWellRim.receiveShadow = true;
  eggWellRim.userData.interactType = 'egg_basket';
  eggWellGroup.add(eggWellRim);
  interactables.push(eggWellRim);

  const eggWellWater = new THREE.Mesh(
    new THREE.CircleGeometry(0.44, 16).rotateX(-Math.PI / 2),
    pondWaterMat,
  );
  eggWellWater.position.y = 0.41;
  eggWellWater.userData.interactType = 'egg_basket';
  eggWellGroup.add(eggWellWater);
  interactables.push(eggWellWater);

  // Small bamboo dipping crane post + pivoting arm
  const eggPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 1.05, 8),
    bambooMat,
  );
  eggPost.position.set(0.58, 0.52, -0.2);
  eggPost.castShadow = false;
  eggPost.userData.interactType = 'egg_basket';
  eggWellGroup.add(eggPost);
  interactables.push(eggPost);

  const eggDipPivot = new THREE.Group();
  eggDipPivot.position.set(0.58, 0.96, -0.2);
  eggWellGroup.add(eggDipPivot);

  const eggArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.028, 0.72, 6),
    bambooMat,
  );
  eggArm.rotation.z = Math.PI / 2;
  eggArm.rotation.y = 0.33;
  eggArm.position.set(-0.28, 0, 0.1);
  eggArm.castShadow = false;
  eggArm.userData.interactType = 'egg_basket';
  eggDipPivot.add(eggArm);
  interactables.push(eggArm);

  // Woven bamboo basket suspended over the spring well
  const eggBasketGroup = new THREE.Group();
  eggBasketGroup.position.set(-0.56, -0.26, 0.2);
  eggDipPivot.add(eggBasketGroup);

  const basketWeaveMat = new THREE.MeshStandardMaterial({
    color: 0xc99c58,
    roughness: 0.78,
  });
  const eggShellMat = new THREE.MeshStandardMaterial({
    color: 0xfbf5e8,
    roughness: 0.36,
    metalness: 0.02,
  });

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.28, 5),
    twineCordMat(),
  );
  cord.position.y = 0.14;
  eggBasketGroup.add(cord);

  function twineCordMat() {
    return darkTimberMat;
  }

  const basketBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.17, 0.2, 12),
    basketWeaveMat,
  );
  basketBody.castShadow = false;
  basketBody.userData.interactType = 'egg_basket';
  eggBasketGroup.add(basketBody);
  interactables.push(basketBody);

  const basketRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.022, 8, 16),
    basketWeaveMat,
  );
  basketRim.rotation.x = Math.PI / 2;
  basketRim.position.y = 0.1;
  basketRim.userData.interactType = 'egg_basket';
  eggBasketGroup.add(basketRim);
  interactables.push(basketRim);

  const eggGeo = new THREE.SphereGeometry(0.055, 10, 8);
  eggGeo.scale(1.0, 1.32, 1.0);
  for (const [ex, ez] of [
    [-0.07, 0.04],
    [0.07, 0.03],
    [0, -0.07],
  ]) {
    const egg = new THREE.Mesh(eggGeo, eggShellMat);
    egg.position.set(ex, 0.05, ez);
    egg.castShadow = false;
    egg.userData.interactType = 'egg_basket';
    eggBasketGroup.add(egg);
    interactables.push(egg);
  }

  // Rising steam/bubble puffs around the egg well during the dipping ritual
  const eggBubbleGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const eggBubbleMat = new THREE.MeshBasicMaterial({
    color: 0xf4fbff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const eggBubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(eggBubbleGeo, eggBubbleMat);
    b.visible = false;
    eggWellGroup.add(b);
    eggBubbles.push(b);
  }

  let eggRitualTimer = 0;
  let eggRitualCallback: (() => void) | undefined;
  const triggerEggRitual = (onComplete?: () => void): boolean => {
    if (eggRitualTimer > 0) return false;
    eggRitualTimer = 2.8;
    eggRitualCallback = onComplete;
    return true;
  };

  // =========================================================================
  // 7d. EASTERN FOOTBATH STREAM & STEPPING STONES (22, 28)
  // =========================================================================
  const footStreamGroup = new THREE.Group();
  group.add(footStreamGroup);

  const footStreamGeo = new THREE.PlaneGeometry(12.2, 2.9, 24, 4);
  footStreamGeo.rotateX(-Math.PI / 2);
  const fsPos = footStreamGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fsPos.count; i++) {
    const wx = LANDMARKS.footStream.x + fsPos.getX(i);
    const localZ = fsPos.getZ(i);
    fsPos.setX(i, wx);
    fsPos.setZ(i, footStreamCenterZ(wx) + localZ);
  }
  footStreamGeo.computeVertexNormals();
  const footStreamMat = createWaterMaterial('#8cc5ca', 0.85);
  const footStreamMesh = new THREE.Mesh(footStreamGeo, footStreamMat);
  footStreamMesh.position.y = -0.045;
  footStreamMesh.receiveShadow = true;
  footStreamGroup.add(footStreamMesh);

  // 7 flat-topped stepping stones (징검다리) across the footbath stream
  const fsStoneGeo = new THREE.CylinderGeometry(0.54, 0.6, 0.14, 10);
  for (const stSpec of FOOT_STREAM_STEPSTONES) {
    const st = new THREE.Mesh(fsStoneGeo, wetStoneMat);
    st.position.set(stSpec.x, -0.015, stSpec.z);
    st.scale.set(stSpec.r / 0.55, 1.0, (stSpec.r / 0.55) * 0.88);
    st.rotation.y = rand() * Math.PI;
    st.castShadow = false;
    st.receiveShadow = true;
    footStreamGroup.add(st);
    walkableMeshes.push(st);
  }

  // Border wet stones along the eastern footbath stream (castShadow = false)
  for (let i = 0; i < 16; i++) {
    const sx = 16.4 + (i / 15) * 11.2;
    const side = i % 2 === 0 ? 1 : -1;
    const sz = footStreamCenterZ(sx) + side * (1.55 + rand() * 0.35);
    const rock = new THREE.Mesh(rockGeo, wetStoneMat);
    rock.position.set(sx, 0.04, sz);
    rock.scale.set(0.45 + rand() * 0.25, 0.28 + rand() * 0.16, 0.45 + rand() * 0.25);
    rock.rotation.y = rand() * Math.PI;
    rock.castShadow = false;
    rock.receiveShadow = true;
    footStreamGroup.add(rock);
  }

  // Footbath timber signpost & warm lantern post
  const fsPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 1.25, 6),
    darkTimberMat,
  );
  fsPost.position.set(18.6, 0.62, 24.8);
  fsPost.castShadow = false;
  footStreamGroup.add(fsPost);
  footStreamGroup.add(createLantern(18.6, 1.38, 24.8, 0.19, 0.3, 6.5, 14));

  // =========================================================================
  // 8. SNOWY CEDAR FOREST (INSTANCED)
  // =========================================================================
  const cedarCoords: { x: number; z: number; s: number }[] = [];
  let attempts = 0;
  while (cedarCoords.length < 96 && attempts < 900) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const rad = 22 + rand() * 38;
    const tx = Math.cos(angle) * rad;
    const tz = WORLD_CENTER_Z + Math.sin(angle) * rad;

    // Keep central corridor & landmarks completely open
    if (Math.abs(tx) < 7.5 && tz > -20 && tz < 46) continue;
    if (Math.hypot(tx - LANDMARKS.mainBath.x, tz - LANDMARKS.mainBath.z) < 15.5) continue;
    if (Math.hypot(tx - LANDMARKS.myoyeongak.x, tz - LANDMARKS.myoyeongak.z) < 12) continue;
    if (Math.hypot(tx - LANDMARKS.yuzuPond.x, tz - LANDMARKS.yuzuPond.z) < 8.5) continue;
    if (Math.hypot(tx - LANDMARKS.milkBooth.x, tz - LANDMARKS.milkBooth.z) < 8.5) continue;
    if (Math.hypot(tx - LANDMARKS.bambooShishi.x, tz - LANDMARKS.bambooShishi.z) < 10.5) continue;
    if (Math.hypot(tx - LANDMARKS.firewoodYard.x, tz - LANDMARKS.firewoodYard.z) < 9.5) continue;
    if (Math.hypot(tx - LANDMARKS.footStream.x, tz - LANDMARKS.footStream.z) < 9.5) continue;

    cedarCoords.push({ x: tx, z: tz, s: 0.85 + rand() * 0.45 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 4.0, 7);
  trunkGeo.translate(0, 2.0, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4d3829,
    roughness: 0.92,
  });

  const foliageGeo = new THREE.ConeGeometry(2.15, 4.2, 8);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x2c4738,
    roughness: 0.88,
  });
  const snowTierGeo = new THREE.ConeGeometry(1.9, 1.35, 8);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, cedarCoords.length);
  const tier1Inst = new THREE.InstancedMesh(foliageGeo, foliageMat, cedarCoords.length);
  const tier2Inst = new THREE.InstancedMesh(foliageGeo, foliageMat, cedarCoords.length);
  const snowTreeInst = new THREE.InstancedMesh(
    snowTierGeo,
    snowCapMat,
    cedarCoords.length,
  );
  trunkInst.castShadow = !isSoftwareGl;
  tier1Inst.castShadow = !isSoftwareGl;
  tier2Inst.castShadow = !isSoftwareGl;
  tier1Inst.receiveShadow = true;
  tier2Inst.receiveShadow = true;

  const treeTint = new THREE.Color();
  cedarCoords.forEach((c, idx) => {
    const gy = terrainMeshHeightAt(c.x, c.z);

    dummy.position.set(c.x, gy - 0.1, c.z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(c.s, c.s, c.s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(c.x, gy + 4.3 * c.s, c.z);
    dummy.scale.set(c.s, c.s, c.s);
    dummy.updateMatrix();
    tier1Inst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(c.x, gy + 6.5 * c.s, c.z);
    dummy.scale.set(c.s * 0.78, c.s * 0.86, c.s * 0.78);
    dummy.updateMatrix();
    tier2Inst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(c.x, gy + 8.0 * c.s, c.z);
    dummy.scale.set(c.s * 0.68, c.s * 0.75, c.s * 0.68);
    dummy.updateMatrix();
    snowTreeInst.setMatrixAt(idx, dummy.matrix);

    treeTint.setHSL(0.4 + (rand() - 0.5) * 0.04, 0.24, 0.2 + rand() * 0.06);
    tier1Inst.setColorAt(idx, treeTint);
    tier2Inst.setColorAt(idx, treeTint);
  });

  trunkInst.computeBoundingSphere();
  tier1Inst.computeBoundingSphere();
  tier2Inst.computeBoundingSphere();
  snowTreeInst.computeBoundingSphere();
  group.add(trunkInst, tier1Inst, tier2Inst, snowTreeInst);

  // =========================================================================
  // 9. RISING STEAM PARTICLES (BATH + YUZU POND + CREEK + FOOT STREAM) & FALLING SNOW
  // =========================================================================
  const steamCount = isSoftwareGl ? 56 : 152;
  const steamPositions = new Float32Array(steamCount * 3);
  const steamMeta: {
    originX: number;
    originZ: number;
    radius: number;
    phase: number;
    speed: number;
    maxH: number;
  }[] = [];

  for (let i = 0; i < steamCount; i++) {
    const ratio = i / steamCount;
    const isMainBath = ratio < 0.69;
    const isYuzu = ratio >= 0.69 && ratio < 0.8;
    const isFootStream = ratio >= 0.89;
    let px = 0;
    let pz = 38;
    if (isMainBath) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 6.8;
      px = LANDMARKS.mainBath.x + Math.cos(a) * r;
      pz = LANDMARKS.mainBath.z + Math.sin(a) * r;
    } else if (isYuzu) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 2.8;
      px = LANDMARKS.yuzuPond.x + Math.cos(a) * r;
      pz = LANDMARKS.yuzuPond.z + Math.sin(a) * r;
    } else if (isFootStream) {
      px = LANDMARKS.footStream.x + (rand() - 0.5) * 9.5;
      pz = footStreamCenterZ(px) + (rand() - 0.5) * 1.4;
    } else {
      px = (rand() - 0.5) * 18;
      pz = 38 + (rand() - 0.5) * 3;
    }

    steamMeta.push({
      originX: px,
      originZ: pz,
      radius: 0.4 + rand() * 0.6,
      phase: rand(),
      speed: 0.16 + rand() * 0.14,
      maxH: isMainBath ? 2.8 : 1.7,
    });
    steamPositions[i * 3] = px;
    steamPositions[i * 3 + 1] = 0.4 + rand() * 2.0;
    steamPositions[i * 3 + 2] = pz;
  }

  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
  const steamMaterial = new THREE.PointsMaterial({
    map: textures.steamSpriteMap,
    color: new THREE.Color('#f7fafc'),
    size: 3.15,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const steamPoints = new THREE.Points(steamGeo, steamMaterial);
  steamPoints.frustumCulled = false;
  group.add(steamPoints);

  // Falling snowflakes
  const snowCount = isSoftwareGl ? 180 : 620;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowSpeeds = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (rand() - 0.5) * 86;
    snowPositions[i * 3 + 1] = rand() * 24;
    snowPositions[i * 3 + 2] = WORLD_CENTER_Z + (rand() - 0.5) * 86;
    snowSpeeds[i] = 1.1 + rand() * 1.1;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMat = new THREE.PointsMaterial({
    map: textures.snowSpriteMap,
    color: new THREE.Color('#ffffff'),
    size: 0.24,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  group.add(snowPoints);

  const daySteamColor = new THREE.Color('#eef4f6');
  const nightSteamColor = new THREE.Color('#ffd8a8');

  // Auto-walk destination glowing ring marker on ground
  const destMarkerGroup = new THREE.Group();
  destMarkerGroup.visible = false;
  const destRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffcf86'),
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const destOuterRing = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.48, 28).rotateX(-Math.PI / 2),
    destRingMat,
  );
  const destInnerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#fff5dd'),
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const destInnerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 20).rotateX(-Math.PI / 2),
    destInnerMat,
  );
  destMarkerGroup.add(destOuterRing, destInnerDisc);
  group.add(destMarkerGroup);

  const setDestinationMarker = (x: number, y: number, z: number, visible: boolean) => {
    destMarkerGroup.visible = visible;
    if (visible) {
      destMarkerGroup.position.set(x, y + 0.04, z);
    }
  };

  // Subtle floor interaction guide rings for key clickable stations
  interface InteractGuideRing {
    kind: string;
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    alwaysAmbient: boolean;
  }
  const interactGuideRings: InteractGuideRing[] = [];
  const addInteractGuideRing = (
    kind: string,
    x: number,
    z: number,
    radius: number,
    colorHex: string,
    alwaysAmbient: boolean,
    explicitY?: number,
  ) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: alwaysAmbient ? 0.24 : 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.11, radius, 28).rotateX(-Math.PI / 2),
      mat,
    );
    mesh.position.set(x, explicitY ?? groundHeightAt(x, z) + 0.045, z);
    mesh.userData.interactType = kind;
    group.add(mesh);
    interactables.push(mesh);
    interactGuideRings.push({ kind, mesh, mat, alwaysAmbient });
  };

  addInteractGuideRing(
    'firewood_pile',
    ACTION_SPOTS.firewoodPickupSpot.x,
    ACTION_SPOTS.firewoodPickupSpot.z,
    0.72,
    '#ffcf86',
    true,
    0.075,
  );
  addInteractGuideRing(
    'firewood_furnace',
    ACTION_SPOTS.firewoodFurnaceSpot.x,
    ACTION_SPOTS.firewoodFurnaceSpot.z,
    0.82,
    '#ff8842',
    false,
    0.075,
  );
  addInteractGuideRing('milk_vending', 17.05, 7.35, 0.78, '#ffd99c', true, 0.095);
  addInteractGuideRing('shishi_odoshi', -21.1, 30.8, 0.68, '#b5d68b', false);
  addInteractGuideRing(
    'egg_basket',
    ACTION_SPOTS.eggBasketSpot.x,
    ACTION_SPOTS.eggBasketSpot.z,
    0.72,
    '#ffe099',
    false,
  );
  addInteractGuideRing('yuzu_pond', -13.6, 9.7, 0.75, '#f4be2b', false);

  // Animation update
  const birdTargetVec = new THREE.Vector3();
  const update = (
    dt: number,
    elapsed: number,
    nightBlend: number,
    isSittingBench: boolean,
    cueState?: InteractionCueState,
  ) => {
    const safeDt = Math.min(dt, 0.08);
    if (destMarkerGroup.visible) {
      const pulse = 1 + Math.sin(elapsed * 4.5) * 0.1;
      destOuterRing.scale.set(pulse, 1, pulse);
      destRingMat.opacity = 0.55 + Math.sin(elapsed * 4.5) * 0.2;
      destInnerDisc.scale.setScalar(0.85 + Math.cos(elapsed * 4.5) * 0.15);
    }

    const hoveredKind = cueState?.hoveredKind ?? null;
    const nearbyKind = cueState?.nearbyKind ?? null;
    const carryingFirewood = cueState?.carryingFirewood ?? false;
    for (const r of interactGuideRings) {
      const isHovered = hoveredKind === r.kind;
      const isNearby = nearbyKind === r.kind;
      const isStepActive =
        (r.kind === 'firewood_pile' && !carryingFirewood) ||
        (r.kind === 'firewood_furnace' && carryingFirewood);

      let targetOpacity = r.alwaysAmbient ? 0.24 : 0.1;
      if (r.kind === 'firewood_pile' && carryingFirewood) targetOpacity = 0.05;
      if (r.kind === 'firewood_furnace' && carryingFirewood) targetOpacity = 0.68;
      if (isNearby) targetOpacity = Math.max(targetOpacity, 0.52);
      if (isHovered) targetOpacity = 0.82;

      const wave = 1 + Math.sin(elapsed * (isHovered || isStepActive ? 4.2 : 2.1)) * (isHovered || (r.kind === 'firewood_furnace' && carryingFirewood) ? 0.09 : 0.04);
      r.mesh.scale.set(wave, 1, wave);
      r.mat.opacity = THREE.MathUtils.damp(r.mat.opacity, targetOpacity, 10, safeDt);
    }

    // 1. Hot spring water wave uniform
    for (const wm of waterMaterials) {
      if (wm.userData.shader) {
        wm.userData.shader.uniforms.uTime.value = elapsed;
      }
    }

    // 2. Floating yuzus & glowing wish yuzus gentle bob
    for (const fy of floatingYuzus) {
      fy.mesh.position.y = fy.baseY + Math.sin(elapsed * 1.8 + fy.phase) * 0.015;
      fy.mesh.rotation.z = Math.sin(elapsed * 1.2 + fy.phase) * 0.08;
    }
    for (const wy of wishYuzuMeshes) {
      wy.mesh.position.y = wy.baseY + Math.sin(elapsed * 2.0 + wy.phase) * 0.02;
      wy.mesh.rotation.y += safeDt * 0.25;
    }

    // 3. Shishi-odoshi periodic tilt + click-triggered immediate tip & pour
    if (shishiManualTimer > 0) {
      shishiManualTimer = Math.max(0, shishiManualTimer - safeDt);
      const t = 1 - shishiManualTimer / 1.4;
      if (t < 0.28) {
        shishiRockerPivot.rotation.x = THREE.MathUtils.lerp(-0.15, 0.65, t / 0.28);
        shishiStream.visible = true;
      } else if (t < 0.55) {
        shishiRockerPivot.rotation.x = THREE.MathUtils.lerp(0.65, -0.22, (t - 0.28) / 0.27);
        shishiStream.visible = t < 0.42;
      } else {
        shishiRockerPivot.rotation.x = -0.22;
        shishiStream.visible = false;
      }
    } else {
      const shishiPhase = (elapsed % 5.4) / 5.4;
      if (shishiPhase < 0.72) {
        shishiRockerPivot.rotation.x = THREE.MathUtils.lerp(-0.22, 0.14, shishiPhase / 0.72);
        shishiStream.visible = false;
      } else if (shishiPhase < 0.82) {
        shishiRockerPivot.rotation.x = THREE.MathUtils.lerp(0.14, 0.58, (shishiPhase - 0.72) / 0.1);
        shishiStream.visible = true;
      } else {
        shishiRockerPivot.rotation.x = THREE.MathUtils.lerp(0.58, -0.22, (shishiPhase - 0.82) / 0.18);
        shishiStream.visible = false;
      }
    }

    // 4. Omoknuni (뱁새) bird flight between high cedar perch & bench seat beside cat
    if (isSittingBench) {
      birdTargetVec.set(
        ACTION_SPOTS.benchBirdTarget.x,
        ACTION_SPOTS.benchBirdTarget.y,
        ACTION_SPOTS.benchBirdTarget.z,
      );
    } else {
      birdTargetVec.set(
        ACTION_SPOTS.benchBirdPerchHigh.x,
        ACTION_SPOTS.benchBirdPerchHigh.y + Math.sin(elapsed * 2.2) * 0.12,
        ACTION_SPOTS.benchBirdPerchHigh.z,
      );
    }
    const birdDist = birdGroup.position.distanceTo(birdTargetVec);
    birdGroup.position.lerp(birdTargetVec, 1 - Math.exp(-safeDt * 4.2));
    if (birdDist > 0.25) {
      // Flap wings while flying
      const flap = Math.sin(elapsed * 24) * 0.75;
      birdWingL.rotation.z = flap;
      birdWingR.rotation.z = -flap;
      birdGroup.lookAt(birdTargetVec);
    } else {
      birdWingL.rotation.z = THREE.MathUtils.damp(birdWingL.rotation.z, 0, 12, safeDt);
      birdWingR.rotation.z = THREE.MathUtils.damp(birdWingR.rotation.z, 0, 12, safeDt);
      // Look warmly toward the seated cat on the bench
      birdGroup.lookAt(
        ACTION_SPOTS.benchSitSpot.x,
        0.52,
        ACTION_SPOTS.benchSitSpot.z,
      );
      birdGroup.position.y += Math.abs(Math.sin(elapsed * 4.5)) * 0.008;
    }

    // 5. Rising steam particles (density boosts slightly when firewood is stoked!)
    if (furnaceBoostTimer > 0) {
      furnaceBoostTimer = Math.max(0, furnaceBoostTimer - safeDt);
    }
    const fireGlowBoost = furnaceBoostTimer > 0 ? 1.85 : 1.0;
    furnaceFireLight.intensity =
      (4.2 + nightBlend * 4.5 + Math.sin(elapsed * 9.5) * 0.65) * fireGlowBoost;
    emberMat.emissiveIntensity = (0.95 + Math.sin(elapsed * 6.0) * 0.25) * fireGlowBoost;
    for (let i = 0; i < furnaceFlames.length; i++) {
      const fl = furnaceFlames[i];
      const fScale = (0.82 + Math.sin(elapsed * 12 + i * 2.1) * 0.24) * (furnaceBoostTimer > 0 ? 1.38 : 1.0);
      fl.scale.set(1, fScale, 1);
      fl.rotation.z = Math.sin(elapsed * 8 + i) * 0.16;
    }

    // 5b. Onsen egg basket dipping ritual animation
    if (eggRitualTimer > 0) {
      eggRitualTimer = Math.max(0, eggRitualTimer - safeDt);
      const progress = 1 - eggRitualTimer / 2.8;
      if (progress < 0.24) {
        eggDipPivot.rotation.z = THREE.MathUtils.lerp(0, 0.42, progress / 0.24);
      } else if (progress < 0.78) {
        eggDipPivot.rotation.z = 0.42 + Math.sin(elapsed * 11) * 0.03;
      } else {
        eggDipPivot.rotation.z = THREE.MathUtils.lerp(0.42, 0, (progress - 0.78) / 0.22);
      }

      const activeBubbles = progress > 0.2 && progress < 0.85;
      for (let i = 0; i < eggBubbles.length; i++) {
        const b = eggBubbles[i];
        b.visible = activeBubbles;
        if (activeBubbles) {
          const life = (elapsed * 1.45 + i * 0.19) % 1;
          const a = (i / eggBubbles.length) * Math.PI * 2 + elapsed * 1.2;
          b.position.set(
            Math.cos(a) * 0.24 * (0.5 + life * 0.5),
            0.42 + life * 0.72,
            Math.sin(a) * 0.24 * (0.5 + life * 0.5),
          );
          b.scale.setScalar(Math.max(0.15, Math.sin(life * Math.PI) * 1.35));
        }
      }

      if (eggRitualTimer === 0) {
        eggDipPivot.rotation.z = 0;
        eggBubbles.forEach((b) => {
          b.visible = false;
        });
        const cb = eggRitualCallback;
        eggRitualCallback = undefined;
        cb?.();
      }
    }

    const sPosAttr = steamGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < steamCount; i++) {
      const m = steamMeta[i];
      m.phase = (m.phase + safeDt * m.speed) % 1;
      const y = 0.25 + m.phase * m.maxH;
      const driftX = Math.sin(elapsed * 0.7 + i) * m.radius * m.phase;
      const driftZ = Math.cos(elapsed * 0.6 + i * 1.3) * m.radius * m.phase;
      sPosAttr.setXYZ(i, m.originX + driftX, y, m.originZ + driftZ);
    }
    sPosAttr.needsUpdate = true;

    const stokeBoost = Math.min(0.14, stokedLogsCount * 0.025) + (furnaceBoostTimer > 0 ? 0.06 : 0);
    steamMaterial.color.copy(daySteamColor).lerp(nightSteamColor, nightBlend);
    steamMaterial.opacity = Math.min(0.72, 0.34 + nightBlend * 0.12 + stokeBoost);
    steamMaterial.size = 3.15 + stokeBoost * 2.5;

    // 6. Gently falling snow
    const snPosAttr = snowGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < snowCount; i++) {
      let sx = snPosAttr.getX(i) + Math.sin(elapsed * 0.8 + i) * safeDt * 0.35;
      let sy = snPosAttr.getY(i) - snowSpeeds[i] * safeDt;
      const sz = snPosAttr.getZ(i) + Math.cos(elapsed * 0.6 + i) * safeDt * 0.2;
      if (sy < -0.2) {
        sy = 22 + (i % 5);
        sx = ((i * 37) % 86) - 43;
      }
      snPosAttr.setXYZ(i, sx, sy, sz);
    }
    snPosAttr.needsUpdate = true;
  };

  const dispose = () => {
    wishFruitGeo.dispose();
    wishLeafGeo.dispose();
    wishGlowRingGeo.dispose();
    extraTextures.forEach((t) => t.dispose());
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  };

  return {
    group,
    walkableMeshes,
    interactables,
    nightLights,
    lanternGlowMaterials,
    steamMaterial,
    waterMaterials,
    syncWishYuzus,
    triggerShishiOdoshi,
    triggerEggRitual,
    stokeFirewood,
    setDestinationMarker,
    update,
    dispose,
  };
}
