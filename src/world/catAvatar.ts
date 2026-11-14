import * as THREE from 'three';
import { CatCoatDefinition, CatCoatId, getCatCoatById } from './catCoats';
import { createCatCoatTexture } from './proceduralTextures';
import { CatActionMode } from './ritualMath';

export interface CatAvatarController {
  root: THREE.Group;
  setCoat: (coatId: CatCoatId) => void;
  triggerGiftAfterglow: () => void;
  setHeldMilk: (bottleColor: string | null, capColor?: string) => void;
  triggerDrinkMilk: (bottleColor?: string, capColor?: string) => void;
  triggerEatEgg: () => void;
  showSpeechBubble: (text: string, duration?: number) => void;
  update: (
    dt: number,
    moveSpeed: number,
    actionMode: CatActionMode,
    actionTime: number,
    hasHeadYuzu: boolean,
    hasHeadTowel?: boolean,
    isCarryingFirewood?: boolean,
  ) => void;
  dispose: () => void;
}

function createCheckeredTowelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const cell = 16;
  for (let y = 0; y < 64; y += cell) {
    for (let x = 0; x < 64; x += cell) {
      const evenX = (x / cell) % 2 === 0;
      const evenY = (y / cell) % 2 === 0;
      ctx.fillStyle =
        evenX && evenY
          ? '#3b5d85'
          : !evenX && !evenY
            ? '#fbf6ea'
            : '#8ba4bf';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a procedural 4-legged cute cat avatar whose local +Z axis faces forward
 * (nose/eyes/whiskers at +Z, tail at -Z) so `root.rotation.y = Math.atan2(dx, dz)`
 * always walks nose-first without ever walking backwards.
 */
export function createCatAvatar(
  initialCoatId: CatCoatId,
  contactShadowMap: THREE.Texture,
  maxAnisotropy: number,
): CatAvatarController {
  const root = new THREE.Group();
  root.name = 'PlayerCatAvatar';

  // Rig moves vertically during gait/soak while root sits at groundHeightAt(x, z)
  const rig = new THREE.Group();
  root.add(rig);

  // Ground contact shadow disc slightly above ground to prevent Z-fighting
  const shadowGeo = new THREE.CircleGeometry(0.42, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // Active coat texture & primary material (explicitly disposed whenever switching coats)
  let activeCoatId: CatCoatId | null = null;
  let activeCoatTexture: THREE.CanvasTexture | null = null;
  const primaryMeshes: THREE.Mesh[] = [];

  // Shared materials updated dynamically on coat switch
  let primaryMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.02,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0xf5e6d3,
    roughness: 0.86,
    metalness: 0.02,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xc97824,
    roughness: 0.82,
    metalness: 0.02,
  });
  const earInnerMat = new THREE.MeshStandardMaterial({
    color: 0xf0b8ae,
    roughness: 0.72,
    metalness: 0.0,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xe89592,
    roughness: 0.35,
    metalness: 0.04,
  });
  const eyeIrisMat = new THREE.MeshStandardMaterial({
    color: 0x5c8a3c,
    emissive: 0x161b12,
    emissiveIntensity: 0.35,
    roughness: 0.16,
    metalness: 0.05,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x111216,
    roughness: 0.12,
    metalness: 0.1,
  });
  const catchlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xf6f4ee });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xc24b3a,
    roughness: 0.6,
    metalness: 0.05,
  });
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0xe6b84c,
    roughness: 0.22,
    metalness: 0.85,
  });
  const towelMat = new THREE.MeshStandardMaterial({
    color: 0xfaf8f2,
    roughness: 0.92,
    metalness: 0.0,
  });

  // 1. Torso (+Z forward, -Z tail)
  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(0, 0.28, 0);
  rig.add(bodyGroup);

  const torsoGeo = new THREE.SphereGeometry(0.22, 20, 16);
  torsoGeo.scale(0.95, 0.88, 1.38);
  const torso = new THREE.Mesh(torsoGeo, primaryMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  primaryMeshes.push(torso);
  bodyGroup.add(torso);

  // Cozy chest bib (for tuxedo / calico / tabby cream chest)
  const chestGeo = new THREE.SphereGeometry(0.145, 16, 14);
  chestGeo.scale(0.92, 0.95, 0.82);
  const chestMesh = new THREE.Mesh(chestGeo, secondaryMat);
  chestMesh.position.set(0, -0.01, 0.21);
  chestMesh.castShadow = true;
  bodyGroup.add(chestMesh);

  // Red woven collar & tiny brass bell
  const collarGeo = new THREE.TorusGeometry(0.145, 0.022, 10, 22);
  collarGeo.rotateX(Math.PI * 0.42);
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, 0.07, 0.22);
  bodyGroup.add(collar);

  const bellGeo = new THREE.SphereGeometry(0.032, 12, 10);
  const bell = new THREE.Mesh(bellGeo, bellMat);
  bell.position.set(0, 0.01, 0.34);
  bodyGroup.add(bell);

  // 2. Head group (mounted at +Z front of torso)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.19, 0.26);
  bodyGroup.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.205, 22, 18);
  headGeo.scale(1.12, 0.94, 1.0);
  const head = new THREE.Mesh(headGeo, primaryMat);
  head.castShadow = true;
  head.receiveShadow = true;
  primaryMeshes.push(head);
  headGroup.add(head);

  // Forehead markings (accent patch for calico / tabby 'M' forehead cap)
  const capGeo = new THREE.SphereGeometry(0.13, 14, 12);
  capGeo.scale(1.1, 0.52, 0.9);
  const foreheadPatch = new THREE.Mesh(capGeo, accentMat);
  foreheadPatch.position.set(0.04, 0.115, 0.03);
  headGroup.add(foreheadPatch);

  // Cute plump muzzle cheeks (+Z face)
  const cheekGeo = new THREE.SphereGeometry(0.068, 12, 10);
  cheekGeo.scale(1.1, 0.86, 0.95);
  const cheekL = new THREE.Mesh(cheekGeo, secondaryMat);
  cheekL.position.set(0.052, -0.042, 0.175);
  const cheekR = new THREE.Mesh(cheekGeo, secondaryMat);
  cheekR.position.set(-0.052, -0.042, 0.175);
  headGroup.add(cheekL, cheekR);

  // Nose
  const noseGeo = new THREE.ConeGeometry(0.025, 0.028, 3);
  noseGeo.rotateX(Math.PI * 0.5);
  noseGeo.rotateZ(Math.PI);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, -0.015, 0.22);
  headGroup.add(nose);

  // Eyes (left at +X, right at -X, facing +Z)
  const eyeLeftGroup = new THREE.Group();
  eyeLeftGroup.position.set(0.088, 0.028, 0.175);
  eyeLeftGroup.rotation.y = 0.22;
  const eyeRightGroup = new THREE.Group();
  eyeRightGroup.position.set(-0.088, 0.028, 0.175);
  eyeRightGroup.rotation.y = -0.22;
  headGroup.add(eyeLeftGroup, eyeRightGroup);

  const irisGeo = new THREE.SphereGeometry(0.034, 14, 12);
  irisGeo.scale(1.0, 1.05, 0.45);
  const pupilGeo = new THREE.SphereGeometry(0.021, 12, 10);
  pupilGeo.scale(0.85, 1.05, 0.5);
  const catchGeo = new THREE.SphereGeometry(0.009, 8, 8);

  for (const eg of [eyeLeftGroup, eyeRightGroup]) {
    const iris = new THREE.Mesh(irisGeo, eyeIrisMat);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.01);
    const catchlight = new THREE.Mesh(catchGeo, catchlightMat);
    catchlight.position.set(0.011, 0.012, 0.018);
    eg.add(iris, pupil, catchlight);
  }

  // Whiskers (3 per side)
  const whiskerGeo = new THREE.CylinderGeometry(0.0022, 0.0014, 0.15, 4);
  whiskerGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (let w = -1; w <= 1; w++) {
      const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
      whisker.position.set(side * 0.145, -0.035 + w * 0.016, 0.175);
      whisker.rotation.z = side * (w * 0.14);
      whisker.rotation.y = -side * 0.18;
      headGroup.add(whisker);
    }
  }

  // Pointed Ears
  const earOuterGeo = new THREE.ConeGeometry(0.072, 0.14, 4);
  earOuterGeo.scale(1.0, 1.0, 0.65);
  const earInnerGeo = new THREE.ConeGeometry(0.042, 0.095, 3);
  earInnerGeo.scale(1.0, 1.0, 0.45);

  const earLeftGroup = new THREE.Group();
  earLeftGroup.position.set(0.115, 0.165, 0.02);
  earLeftGroup.rotation.z = -0.34;
  earLeftGroup.rotation.x = 0.15;
  const earLeftOuter = new THREE.Mesh(earOuterGeo, primaryMat);
  earLeftOuter.castShadow = true;
  primaryMeshes.push(earLeftOuter);
  const earLeftInner = new THREE.Mesh(earInnerGeo, earInnerMat);
  earLeftInner.position.set(0, -0.01, 0.025);
  earLeftGroup.add(earLeftOuter, earLeftInner);

  const earRightGroup = new THREE.Group();
  earRightGroup.position.set(-0.115, 0.165, 0.02);
  earRightGroup.rotation.z = 0.34;
  earRightGroup.rotation.x = 0.15;
  const earRightOuter = new THREE.Mesh(earOuterGeo, primaryMat);
  earRightOuter.castShadow = true;
  primaryMeshes.push(earRightOuter);
  const earRightInner = new THREE.Mesh(earInnerGeo, earInnerMat);
  earRightInner.position.set(0, -0.01, 0.025);
  earRightGroup.add(earRightOuter, earRightInner);

  headGroup.add(earLeftGroup, earRightGroup);

  // Cute folded white onsen towel on head (appears automatically while soaking in the bath!)
  const towelGroup = new THREE.Group();
  towelGroup.position.set(0, 0.195, 0.01);
  const towelBaseGeo = new THREE.BoxGeometry(0.16, 0.042, 0.11);
  const towelTopGeo = new THREE.BoxGeometry(0.12, 0.026, 0.085);
  const towelBase = new THREE.Mesh(towelBaseGeo, towelMat);
  const towelTop = new THREE.Mesh(towelTopGeo, towelMat);
  towelTop.position.y = 0.025;
  towelGroup.add(towelBase, towelTop);

  // Bright yellow yuzu that pops onto the folded towel after soaking briefly
  const headYuzuGroup = new THREE.Group();
  headYuzuGroup.position.set(0, 0.072, 0);
  const headYuzuMat = new THREE.MeshStandardMaterial({
    color: 0xf4c430,
    roughness: 0.42,
    metalness: 0.04,
  });
  const headYuzuLeafMat = new THREE.MeshStandardMaterial({
    color: 0x3b7a3c,
    roughness: 0.6,
  });
  const headYuzuSphere = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 12), headYuzuMat);
  headYuzuSphere.scale.set(1.04, 0.92, 1.04);
  const headYuzuLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 4), headYuzuLeafMat);
  headYuzuLeaf.position.set(0.018, 0.044, 0.008);
  headYuzuLeaf.rotation.z = -0.6;
  headYuzuGroup.add(headYuzuSphere, headYuzuLeaf);
  headYuzuGroup.visible = false;
  towelGroup.add(headYuzuGroup);

  towelGroup.visible = false;
  headGroup.add(towelGroup);

  // Checkered bathhouse kerchief towel worn while carrying firewood
  const checkeredTex = createCheckeredTowelTexture();
  const checkeredTowelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: checkeredTex,
    roughness: 0.88,
    metalness: 0.0,
  });
  const checkeredTowelGroup = new THREE.Group();
  checkeredTowelGroup.position.set(0, 0.185, 0.01);
  const chkMain = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.045, 0.13),
    checkeredTowelMat,
  );
  const chkKnot = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.032, 0.08),
    checkeredTowelMat,
  );
  chkKnot.position.set(0.06, 0.02, -0.04);
  chkKnot.rotation.y = 0.4;
  checkeredTowelGroup.add(chkMain, chkKnot);
  checkeredTowelGroup.visible = false;
  headGroup.add(checkeredTowelGroup);

  // Carried firewood log resting across the cat's shoulders/back (clearly visible from front & behind)
  const carriedLogGroup = new THREE.Group();
  carriedLogGroup.position.set(0, 0.21, 0.03);
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x6b472d,
    roughness: 0.9,
    metalness: 0.02,
  });
  const cutWoodMat = new THREE.MeshStandardMaterial({
    color: 0xdcb98a,
    roughness: 0.78,
  });
  const twineMat = new THREE.MeshStandardMaterial({
    color: 0xb8945d,
    roughness: 0.85,
  });
  const logShaftGeo = new THREE.CylinderGeometry(0.068, 0.072, 0.56, 10);
  logShaftGeo.rotateZ(Math.PI / 2);
  const logShaft = new THREE.Mesh(logShaftGeo, barkMat);
  logShaft.castShadow = false;
  const logEndGeo = new THREE.CircleGeometry(0.064, 10);
  const logEndL = new THREE.Mesh(logEndGeo, cutWoodMat);
  logEndL.rotation.y = Math.PI / 2;
  logEndL.position.x = 0.281;
  const logEndR = new THREE.Mesh(logEndGeo, cutWoodMat);
  logEndR.rotation.y = -Math.PI / 2;
  logEndR.position.x = -0.281;
  const logTwine = new THREE.Mesh(
    new THREE.TorusGeometry(0.072, 0.012, 8, 16),
    twineMat,
  );
  logTwine.rotation.y = Math.PI / 2;
  carriedLogGroup.add(logShaft, logEndL, logEndR, logTwine);
  carriedLogGroup.visible = false;
  bodyGroup.add(carriedLogGroup);

  // Held milk bottle prop in front of paws/chest when holding or drinking warm milk
  const heldMilkGroup = new THREE.Group();
  heldMilkGroup.position.set(0, 0.03, 0.48);
  const heldMilkBodyMat = new THREE.MeshStandardMaterial({
    color: '#f7df7c',
    emissive: new THREE.Color('#f7df7c'),
    emissiveIntensity: 0.22,
    roughness: 0.25,
    metalness: 0.04,
  });
  const heldMilkCapMat = new THREE.MeshStandardMaterial({
    color: '#d9842b',
    emissive: new THREE.Color('#d9842b'),
    emissiveIntensity: 0.16,
    roughness: 0.38,
  });
  const heldMilkRimMat = new THREE.MeshStandardMaterial({
    color: 0xfffdf7,
    roughness: 0.22,
    metalness: 0.05,
  });
  const heldMilkLabelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xfff5e4),
    emissiveIntensity: 0.14,
    roughness: 0.5,
  });
  const heldMilkBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.066, 0.072, 0.15, 16),
    heldMilkBodyMat,
  );
  heldMilkBody.castShadow = true;
  const heldMilkShoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.066, 0.048, 16),
    heldMilkBodyMat,
  );
  heldMilkShoulder.position.y = 0.095;
  const heldMilkNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.04, 0.022, 16),
    heldMilkRimMat,
  );
  heldMilkNeck.position.y = 0.126;
  const heldMilkCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.047, 0.024, 16),
    heldMilkCapMat,
  );
  heldMilkCap.position.y = 0.146;
  const heldMilkLabel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.071, 0.074, 0.06, 16),
    heldMilkLabelMat,
  );
  heldMilkLabel.position.y = -0.005;
  const heldMilkStripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0725, 0.075, 0.018, 16),
    heldMilkCapMat,
  );
  heldMilkStripe.position.y = -0.005;
  heldMilkGroup.add(
    heldMilkBody,
    heldMilkShoulder,
    heldMilkNeck,
    heldMilkCap,
    heldMilkLabel,
    heldMilkStripe,
  );
  heldMilkGroup.visible = false;
  bodyGroup.add(heldMilkGroup);

  // Soft-boiled onsen egg held in paws after dipping ritual completes
  const heldEggGroup = new THREE.Group();
  heldEggGroup.position.set(0, 0.1, 0.49);
  const eggWhiteGeo = new THREE.SphereGeometry(0.058, 14, 12);
  eggWhiteGeo.scale(1.0, 1.28, 1.0);
  const eggWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xfffcf2,
    emissive: new THREE.Color(0xfff0d0),
    emissiveIntensity: 0.2,
    roughness: 0.32,
  });
  const eggWhite = new THREE.Mesh(eggWhiteGeo, eggWhiteMat);
  const eggYolkMat = new THREE.MeshStandardMaterial({
    color: 0xff9a2e,
    emissive: new THREE.Color(0xff7b00),
    emissiveIntensity: 0.28,
    roughness: 0.25,
  });
  const eggYolk = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 12, 10),
    eggYolkMat,
  );
  eggYolk.position.set(0, 0.032, 0.016);
  heldEggGroup.add(eggWhite, eggYolk);
  heldEggGroup.visible = false;
  bodyGroup.add(heldEggGroup);

  // Overhead 3D speech bubble sprite rendered with canvas texture
  const speechCanvas = document.createElement('canvas');
  speechCanvas.width = 512;
  speechCanvas.height = 128;
  const speechTexture = new THREE.CanvasTexture(speechCanvas);
  speechTexture.colorSpace = THREE.SRGBColorSpace;
  const speechMat = new THREE.SpriteMaterial({
    map: speechTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  const speechSprite = new THREE.Sprite(speechMat);
  speechSprite.position.set(0, 0.88, 0);
  speechSprite.scale.set(1.15, 0.29, 1);
  speechSprite.visible = false;
  speechSprite.renderOrder = 10;
  rig.add(speechSprite);

  // Warm pink milk-gift afterglow ring & rising warmth orbs
  const pinkAuraGroup = new THREE.Group();
  pinkAuraGroup.visible = false;
  const pinkRingMat = new THREE.MeshBasicMaterial({
    color: 0xff8ab8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pinkRingGeo = new THREE.RingGeometry(0.45, 0.74, 28);
  pinkRingGeo.rotateX(-Math.PI / 2);
  const pinkRingMesh = new THREE.Mesh(pinkRingGeo, pinkRingMat);
  pinkRingMesh.position.y = 0.035;
  pinkAuraGroup.add(pinkRingMesh);

  const pinkOrbMat = new THREE.MeshBasicMaterial({
    color: 0xffb3cf,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const pinkOrbGeo = new THREE.SphereGeometry(0.038, 10, 8);
  const pinkOrbs: { mesh: THREE.Mesh; angle: number; speed: number; radius: number; phase: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const orb = new THREE.Mesh(pinkOrbGeo, pinkOrbMat);
    pinkAuraGroup.add(orb);
    pinkOrbs.push({
      mesh: orb,
      angle: (i / 12) * Math.PI * 2,
      speed: 0.48 + (i % 4) * 0.14,
      radius: 0.36 + (i % 3) * 0.14,
      phase: i * 0.27,
    });
  }
  root.add(pinkAuraGroup);

  // 3. Four Animated Legs (pivoted at shoulder/hip)
  const legGeo = new THREE.CylinderGeometry(0.048, 0.042, 0.21, 10);
  legGeo.translate(0, -0.105, 0);
  const pawGeo = new THREE.SphereGeometry(0.048, 12, 10);
  pawGeo.scale(1.0, 0.72, 1.25);

  function createLeg(x: number, y: number, z: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const shaft = new THREE.Mesh(legGeo, primaryMat);
    shaft.castShadow = true;
    primaryMeshes.push(shaft);
    const paw = new THREE.Mesh(pawGeo, secondaryMat);
    paw.position.set(0, -0.21, 0.016);
    paw.castShadow = true;
    pivot.add(shaft, paw);
    bodyGroup.add(pivot);
    return pivot;
  }

  const legFL = createLeg(0.105, -0.06, 0.165);
  const legFR = createLeg(-0.105, -0.06, 0.165);
  const legBL = createLeg(0.11, -0.06, -0.175);
  const legBR = createLeg(-0.11, -0.06, -0.175);

  // 4. Smooth Curved Tail (-Z rear)
  const tailBasePivot = new THREE.Group();
  tailBasePivot.position.set(0, 0.02, -0.25);
  bodyGroup.add(tailBasePivot);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.07, -0.11),
    new THREE.Vector3(0, 0.19, -0.17),
    new THREE.Vector3(0, 0.31, -0.14),
    new THREE.Vector3(0, 0.37, -0.09),
  ]);
  const tailTubeGeo = new THREE.TubeGeometry(tailCurve, 18, 0.036, 10, false);
  const tailTube = new THREE.Mesh(tailTubeGeo, primaryMat);
  tailTube.castShadow = true;
  primaryMeshes.push(tailTube);
  tailBasePivot.add(tailTube);

  const tailMidPivot = new THREE.Group();
  tailMidPivot.position.set(0, 0.37, -0.09);
  tailBasePivot.add(tailMidPivot);

  const tailTipGeo = new THREE.SphereGeometry(0.038, 12, 10);
  const tailTip = new THREE.Mesh(tailTipGeo, secondaryMat);
  tailMidPivot.add(tailTip);

  // Apply coat styling & dispose previous Three.js coat material + texture resources
  const setCoat = (coatId: CatCoatId) => {
    const coat = getCatCoatById(coatId);
    if (activeCoatId !== coat.id || !activeCoatTexture) {
      const prevTexture = activeCoatTexture;
      const prevMaterial = primaryMat;
      const nextTexture = createCatCoatTexture(coat, maxAnisotropy);
      const nextMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: nextTexture,
        roughness: coat.id === 'black' ? 0.68 : 0.84,
        metalness: 0.02,
      });

      for (const mesh of primaryMeshes) {
        mesh.material = nextMaterial;
      }

      activeCoatTexture = nextTexture;
      primaryMat = nextMaterial;
      activeCoatId = coat.id;

      if (prevMaterial !== nextMaterial) {
        prevMaterial.dispose();
      }
      if (prevTexture) {
        prevTexture.dispose();
      }
    }

    secondaryMat.color.set(
      coat.pattern === 'calico' ? coat.primaryColor : coat.secondaryColor,
    );
    accentMat.color.set(coat.accentColor);
    earInnerMat.color.set(coat.earInnerColor);
    noseMat.color.set(coat.noseColor);
    eyeIrisMat.color.set(coat.eyeColor);
    eyeIrisMat.emissive.set(coat.eyeColor);
    eyeIrisMat.emissiveIntensity = coat.id === 'black' ? 0.45 : 0.2;

    // Show chest & cheek contrast cleanly per pattern
    chestMesh.visible = coat.pattern === 'tuxedo' || coat.pattern === 'tabby' || coat.pattern === 'cream';
    foreheadPatch.visible = coat.pattern === 'calico';
  };

  setCoat(initialCoatId);

  let walkPhase = 0;
  let elapsed = 0;
  let blinkTimer = 2.8;
  let blinkAmount = 0;
  let towelScale = 0;
  let yuzuScale = 0;
  let checkeredTowelScale = 0;
  let carriedLogScale = 0;
  let pinkGiftTimer = 0;
  let earTwitchTimer = 4.2;
  let heldMilkActive = false;
  let selfMilkTimer = 0;
  let milkBottleScale = 0;
  let selfEggTimer = 0;
  let eggPropScale = 0;
  let speechTimer = 0;
  let speechDuration = 2.8;

  const triggerGiftAfterglow = () => {
    pinkGiftTimer = 4.5;
  };

  const triggerEatEgg = () => {
    selfEggTimer = 3.8;
    pinkGiftTimer = 3.8;
  };

  const showSpeechBubble = (text: string, duration = 2.8) => {
    const ctx = speechCanvas.getContext('2d');
    if (!ctx) return;
    const w = speechCanvas.width;
    const h = speechCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Measure text so pill hugs short messages gracefully
    ctx.font = '600 28px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const measured = Math.min(w - 56, Math.max(150, Math.ceil(ctx.measureText(text).width) + 52));
    const x = (w - measured) / 2;
    const y = 10;
    const bw = measured;
    const bh = 86;
    const r = 38;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bw - r, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
    ctx.lineTo(x + bw, y + bh - r);
    ctx.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
    ctx.lineTo(w / 2 + 13, y + bh);
    ctx.lineTo(w / 2, y + bh + 18);
    ctx.lineTo(w / 2 - 13, y + bh);
    ctx.lineTo(x + r, y + bh);
    ctx.quadraticCurveTo(x, y + bh, x, y + bh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = '#fffcf5';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d9842b';
    ctx.stroke();

    ctx.fillStyle = '#2c251d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, y + bh / 2, w - 64);

    speechTexture.needsUpdate = true;
    speechTimer = duration;
    speechDuration = duration;
  };

  const setHeldMilk = (bottleColor: string | null, capColor = '#d9842b') => {
    if (!bottleColor) {
      heldMilkActive = false;
      return;
    }
    heldMilkBodyMat.color.set(bottleColor);
    heldMilkBodyMat.emissive.set(bottleColor);
    heldMilkCapMat.color.set(capColor);
    heldMilkCapMat.emissive.set(capColor);
    heldMilkActive = true;
  };

  const triggerDrinkMilk = (bottleColor = '#f7df7c', capColor = '#d9842b') => {
    heldMilkBodyMat.color.set(bottleColor);
    heldMilkBodyMat.emissive.set(bottleColor);
    heldMilkCapMat.color.set(capColor);
    heldMilkCapMat.emissive.set(capColor);
    heldMilkActive = false;
    selfMilkTimer = 4.2;
    pinkGiftTimer = 4.5;
  };

  const update = (
    dt: number,
    moveSpeed: number,
    actionMode: CatActionMode,
    actionTime: number,
    hasHeadYuzu: boolean,
    hasHeadTowel?: boolean,
    isCarryingFirewood?: boolean,
  ) => {
    const safeDt = Math.min(dt, 0.08);
    elapsed += safeDt;
    if (selfMilkTimer > 0) {
      selfMilkTimer = Math.max(0, selfMilkTimer - safeDt);
    }
    if (selfEggTimer > 0) {
      selfEggTimer = Math.max(0, selfEggTimer - safeDt);
    }

    const speedRatio = Math.min(1, moveSpeed / 1.65);
    const isDrinkingMilk = selfMilkTimer > 0;
    const isEatingEgg = selfEggTimer > 0 && !isDrinkingMilk;
    const isHoldingMilk =
      heldMilkActive &&
      !Boolean(isCarryingFirewood) &&
      !isDrinkingMilk &&
      !isEatingEgg;
    const isSoaking = actionMode === 'soak';
    const isFootSoak = actionMode === 'footSoak';
    const isGroom = actionMode === 'groom';
    const isLoaf = actionMode === 'loaf' || actionMode === 'sitBench';
    const isKnead = actionMode === 'knead';
    const isGreet = actionMode === 'greet';
    const carrying = Boolean(isCarryingFirewood) || actionMode === 'carrying';
    const inBathPosture = !isLoaf && !isKnead && !isFootSoak && (isSoaking || hasHeadTowel === true);

    // 1. Relaxed cute quadruped walking gait or ritual leg poses
    if (speedRatio > 0.04) {
      walkPhase += safeDt * (4.8 + speedRatio * 3.2);
    }

    let targetFL = Math.sin(walkPhase) * 0.46 * speedRatio;
    let targetFR = -Math.sin(walkPhase) * 0.46 * speedRatio;
    let targetBL = -Math.sin(walkPhase) * 0.46 * speedRatio;
    let targetBR = Math.sin(walkPhase) * 0.46 * speedRatio;
    let targetFLZ = 0;
    let targetFRZ = 0;
    let targetFrontLegScaleY = 1.0;
    let targetBackLegScaleY = 1.0;

    if (isDrinkingMilk || isEatingEgg) {
      // Lift both front paws forward to wrap the bottle or warm egg near mouth
      const nibSpeed = isEatingEgg ? 11.0 : 8.5;
      const sipBob = Math.sin(elapsed * nibSpeed) * 0.09;
      targetFL = (isEatingEgg ? -1.42 : -1.46) + sipBob;
      targetFR = (isEatingEgg ? -1.42 : -1.46) + sipBob;
      targetFLZ = -0.18;
      targetFRZ = 0.18;
      targetBL = inBathPosture ? -0.65 : -0.95;
      targetBR = inBathPosture ? -0.65 : -0.95;
      targetFrontLegScaleY = inBathPosture ? 0.65 : 0.92;
      targetBackLegScaleY = inBathPosture ? 0.65 : isFootSoak ? 0.42 : 0.92;
    } else if (isHoldingMilk) {
      // Reach both front paws forward so the milk bottle sits clearly outside chest & muzzle
      targetFL = -1.32 + Math.sin(walkPhase) * 0.14 * speedRatio;
      targetFR = -1.32 - Math.sin(walkPhase) * 0.14 * speedRatio;
      targetFLZ = -0.18;
      targetFRZ = 0.18;
      targetFrontLegScaleY = inBathPosture ? 0.65 : 0.92;
      targetBackLegScaleY = isFootSoak ? 0.42 : targetFrontLegScaleY;
    } else if (isKnead) {
      // Rhythmic alternating front-paw kneading clearly visible on cushion
      const kneadPhase = actionTime * 4.4;
      targetFL = -0.64 + Math.sin(kneadPhase) * 0.38;
      targetFR = -0.64 - Math.sin(kneadPhase) * 0.38;
      targetBL = -0.85;
      targetBR = -0.85;
      targetFrontLegScaleY = 0.94;
      targetBackLegScaleY = 0.56;
    } else if (isGroom) {
      // Cute face-washing groom: left front paw reaches cleanly outside cheek & wipes cyclically
      const groomCycle = actionTime * 4.8;
      targetFL = (inBathPosture ? -1.95 : -1.68) + Math.sin(groomCycle) * 0.3;
      targetFLZ = -0.32 + Math.cos(groomCycle) * 0.08;
      targetFR = inBathPosture ? 0.55 : 0.12;
      targetBL = inBathPosture ? -0.65 : -0.95;
      targetBR = inBathPosture ? -0.65 : -0.95;
      targetFrontLegScaleY = inBathPosture ? 0.68 : 0.94;
      targetBackLegScaleY = inBathPosture ? 0.62 : 0.56;
    } else if (isLoaf) {
      // Front & back paws tucked cleanly underneath for loafing / bench sitting
      targetFL = 1.02;
      targetFR = 1.02;
      targetBL = -1.1;
      targetBR = -1.1;
      targetFrontLegScaleY = 0.36;
      targetBackLegScaleY = 0.36;
    } else if (isFootSoak) {
      // Hind paws seated neatly on hinoki cushion while front paws dip deep into stream water
      const paddle = Math.sin(elapsed * 2.2) * 0.11;
      targetFL = -0.22 + paddle;
      targetFR = -0.22 - paddle;
      targetBL = -1.12;
      targetBR = -1.12;
      targetFrontLegScaleY = 1.42;
      targetBackLegScaleY = 0.36;
    } else if (inBathPosture && speedRatio > 0.04) {
      // Smooth underwater wading stride while moving inside the bath
      targetFL = 0.25 + Math.sin(walkPhase) * 0.32 * speedRatio;
      targetFR = 0.25 - Math.sin(walkPhase) * 0.32 * speedRatio;
      targetBL = -0.35 - Math.sin(walkPhase) * 0.32 * speedRatio;
      targetBR = -0.35 + Math.sin(walkPhase) * 0.32 * speedRatio;
      targetFrontLegScaleY = 0.62;
      targetBackLegScaleY = 0.62;
    } else if (isSoaking) {
      // Relaxed seated soak posture below the water line
      targetFL = 0.55;
      targetFR = 0.55;
      targetBL = -0.65;
      targetBR = -0.65;
      targetFrontLegScaleY = 0.52;
      targetBackLegScaleY = 0.52;
    }

    const holdingBottlePaws = isDrinkingMilk || isHoldingMilk || isEatingEgg;
    const frontLegPivotZ = holdingBottlePaws
      ? 0.25
      : isFootSoak || isKnead
        ? 0.205
        : 0.165;
    const frontLegPivotY = holdingBottlePaws
      ? isDrinkingMilk || isEatingEgg
        ? 0.02
        : -0.01
      : isFootSoak
        ? -0.075
        : -0.06;
    const frontLegPivotX = holdingBottlePaws
      ? 0.095
      : isGroom && !inBathPosture
        ? 0.125
        : 0.105;
    legFL.position.x = THREE.MathUtils.damp(legFL.position.x, frontLegPivotX, 12, safeDt);
    legFL.position.y = THREE.MathUtils.damp(legFL.position.y, frontLegPivotY, 12, safeDt);
    legFL.position.z = THREE.MathUtils.damp(legFL.position.z, frontLegPivotZ, 12, safeDt);
    legFR.position.x = THREE.MathUtils.damp(legFR.position.x, -frontLegPivotX, 12, safeDt);
    legFR.position.y = THREE.MathUtils.damp(legFR.position.y, frontLegPivotY, 12, safeDt);
    legFR.position.z = THREE.MathUtils.damp(legFR.position.z, frontLegPivotZ, 12, safeDt);

    legFL.rotation.x = THREE.MathUtils.damp(legFL.rotation.x, targetFL, 14, safeDt);
    legFL.rotation.z = THREE.MathUtils.damp(legFL.rotation.z, targetFLZ, 12, safeDt);
    legFR.rotation.x = THREE.MathUtils.damp(legFR.rotation.x, targetFR, 14, safeDt);
    legFR.rotation.z = THREE.MathUtils.damp(legFR.rotation.z, targetFRZ, 12, safeDt);
    legBL.rotation.x = THREE.MathUtils.damp(legBL.rotation.x, targetBL, 14, safeDt);
    legBR.rotation.x = THREE.MathUtils.damp(legBR.rotation.x, targetBR, 14, safeDt);

    const isFrontMilkPaw = isDrinkingMilk || isHoldingMilk;
    for (const leg of [legFL, legFR]) {
      leg.scale.y = THREE.MathUtils.damp(
        leg.scale.y,
        isFrontMilkPaw ? (inBathPosture ? 0.65 : 0.92) : targetFrontLegScaleY,
        12,
        safeDt,
      );
    }
    for (const leg of [legBL, legBR]) {
      leg.scale.y = THREE.MathUtils.damp(
        leg.scale.y,
        isFrontMilkPaw && isLoaf ? 0.36 : targetBackLegScaleY,
        12,
        safeDt,
      );
    }

    shadowMat.opacity = THREE.MathUtils.damp(
      shadowMat.opacity,
      inBathPosture ? 0.1 : 0.55,
      10,
      safeDt,
    );

    // 2. Body vertical posture, cute walk waddle & head expression
    const bounce = Math.abs(Math.sin(walkPhase)) * 0.022 * speedRatio;
    const breath = Math.sin(elapsed * 2.2) * 0.011;
    let targetRigY = bounce + breath;
    if (inBathPosture) {
      targetRigY =
        0.09 +
        (speedRatio > 0.04 ? bounce * 0.6 : 0) +
        Math.sin(elapsed * 1.4) * 0.01;
    } else if (isDrinkingMilk || isEatingEgg) targetRigY = -0.055 + breath * 0.5;
    else if (isGroom) targetRigY = -0.018 + breath * 0.4;
    else if (isKnead) targetRigY = -0.008 + Math.sin(actionTime * 4.4) * 0.018;
    else if (isLoaf) targetRigY = -0.128 + breath * 0.5;
    else if (isFootSoak) targetRigY = -0.105 + breath * 0.4;
    else if (isGreet) targetRigY = Math.sin(actionTime * 7.5) * 0.025;

    rig.position.y = THREE.MathUtils.damp(rig.position.y, targetRigY, 10, safeDt);
    const targetBodyRoll =
      !inBathPosture &&
      !isLoaf &&
      !isGroom &&
      !isDrinkingMilk &&
      !isEatingEgg &&
      speedRatio > 0.04
        ? Math.sin(walkPhase) * 0.065 * speedRatio
        : 0;
    bodyGroup.rotation.z = THREE.MathUtils.damp(bodyGroup.rotation.z, targetBodyRoll, 11, safeDt);

    // Raise head upright above water surface when inside bath so face remains clearly visible
    const targetHeadPosY = inBathPosture
      ? 0.29
      : isGroom || isDrinkingMilk || isEatingEgg
        ? 0.22
        : 0.19;
    const targetHeadPosZ = inBathPosture
      ? 0.18
      : isGroom || isDrinkingMilk || isEatingEgg
        ? 0.22
        : 0.26;
    headGroup.position.y = THREE.MathUtils.damp(headGroup.position.y, targetHeadPosY, 9, safeDt);
    headGroup.position.z = THREE.MathUtils.damp(headGroup.position.z, targetHeadPosZ, 9, safeDt);

    let targetHeadX = Math.sin(elapsed * 1.5) * 0.03;
    let targetHeadZ =
      !inBathPosture && speedRatio > 0.04 ? -Math.sin(walkPhase) * 0.055 * speedRatio : 0;
    if (isDrinkingMilk) {
      targetHeadX = -0.18 + Math.sin(elapsed * 9.0) * 0.06;
    } else if (isEatingEgg) {
      targetHeadX = -0.1 + Math.sin(elapsed * 11.0) * 0.09;
    } else if (isGroom) {
      const groomCycle = actionTime * 4.8;
      targetHeadX = (inBathPosture ? 0.04 : 0.16) + Math.sin(groomCycle) * 0.11;
      targetHeadZ = -0.18 - Math.sin(groomCycle * 0.5) * 0.06;
    } else if (inBathPosture) {
      targetHeadX = -0.12 + Math.sin(elapsed * 1.2) * 0.03;
    } else if (isGreet) {
      targetHeadX = -0.14;
      targetHeadZ = Math.sin(actionTime * 5.0) * 0.14;
    } else if (isKnead) {
      targetHeadX = 0.12 + Math.sin(actionTime * 4.4) * 0.05;
    } else if (isFootSoak) {
      targetHeadX = 0.04 + Math.sin(elapsed * 1.35) * 0.035;
      targetHeadZ = Math.sin(elapsed * 0.8) * 0.035;
    } else if (isLoaf) {
      targetHeadX = 0.06;
    }

    headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetHeadX, 9, safeDt);
    headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetHeadZ, 9, safeDt);
    headGroup.rotation.y = isGroom
      ? Math.sin(actionTime * 2.4) * 0.1
      : Math.sin(elapsed * 0.7) * 0.05 * (1 - speedRatio * 0.6);

    // 3. Tail sway & Greet "?" curl
    const tailFreq = isGreet ? 6.5 : 2.0 + speedRatio * 2.4;
    const tailAmp = isGreet ? 0.44 : 0.28 + speedRatio * 0.16;
    tailBasePivot.rotation.y = Math.sin(elapsed * tailFreq) * tailAmp;
    const targetTailX = isGreet
      ? -0.34
      : isSoaking || isFootSoak
        ? 0.24
        : isLoaf
          ? 0.35
          : Math.sin(elapsed * 1.3) * 0.08;
    tailBasePivot.rotation.x = THREE.MathUtils.damp(tailBasePivot.rotation.x, targetTailX, 9, safeDt);
    tailMidPivot.rotation.y = Math.sin(elapsed * tailFreq - 0.8) * 0.24;

    // 4. Blinking eyes (keep eyes softly open during soak so the face is expressive in photos)
    blinkTimer -= safeDt;
    if (blinkTimer <= 0) {
      blinkTimer = 3.2 + ((elapsed * 13.7) % 2.4);
      blinkAmount = 1.0;
    }
    blinkAmount = Math.max(0, blinkAmount - safeDt * 6.5);
    const targetEyeScaleY =
      isDrinkingMilk || isEatingEgg || isGroom
        ? 0.22
        : isLoaf
          ? 0.2
          : isKnead
            ? 0.32
            : blinkAmount > 0.15
              ? 0.08
              : isFootSoak
                ? 0.68
                : inBathPosture
                  ? 0.88
                  : 1.0;
    eyeLeftGroup.scale.y = THREE.MathUtils.damp(
      eyeLeftGroup.scale.y,
      targetEyeScaleY,
      18,
      safeDt,
    );
    eyeRightGroup.scale.y = eyeLeftGroup.scale.y;

    // 5. Ears perk up during Greet + occasional ear twitch
    earTwitchTimer -= safeDt;
    if (earTwitchTimer <= 0) {
      earTwitchTimer = 3.8 + ((elapsed * 7.3) % 3.5);
    }
    const twitch = earTwitchTimer < 0.22 ? Math.sin(earTwitchTimer * 38) * 0.18 : 0;
    const targetEarZ = isGreet ? 0.2 : 0.34;
    earLeftGroup.rotation.z = THREE.MathUtils.damp(earLeftGroup.rotation.z, -targetEarZ, 12, safeDt);
    earRightGroup.rotation.z = THREE.MathUtils.damp(earRightGroup.rotation.z, targetEarZ + twitch, 12, safeDt);

    // 6. Folded white onsen towel & yellow yuzu on head while soaking, OR checkered towel & log while carrying firewood
    const showTowel = !carrying && (hasHeadTowel !== undefined ? hasHeadTowel : isSoaking);
    const targetTowel = showTowel ? 1 : 0;
    towelScale = THREE.MathUtils.damp(towelScale, targetTowel, 9, safeDt);
    towelGroup.visible = towelScale > 0.03;
    towelGroup.scale.setScalar(Math.max(0.01, towelScale));

    const targetYuzu = showTowel && hasHeadYuzu ? 1 : 0;
    yuzuScale = THREE.MathUtils.damp(yuzuScale, targetYuzu, 11, safeDt);
    headYuzuGroup.visible = yuzuScale > 0.03;
    headYuzuGroup.scale.setScalar(Math.max(0.01, yuzuScale));

    checkeredTowelScale = THREE.MathUtils.damp(checkeredTowelScale, carrying ? 1 : 0, 11, safeDt);
    checkeredTowelGroup.visible = checkeredTowelScale > 0.03;
    checkeredTowelGroup.scale.setScalar(Math.max(0.01, checkeredTowelScale));

    carriedLogScale = THREE.MathUtils.damp(carriedLogScale, carrying ? 1 : 0, 11, safeDt);
    carriedLogGroup.visible = carriedLogScale > 0.03;
    carriedLogGroup.scale.setScalar(Math.max(0.01, carriedLogScale));
    if (carrying) {
      carriedLogGroup.rotation.z = Math.sin(walkPhase) * 0.05 * speedRatio;
    }

    const showMilkProp = isDrinkingMilk || isHoldingMilk;
    milkBottleScale = THREE.MathUtils.damp(
      milkBottleScale,
      showMilkProp ? 1 : 0,
      12,
      safeDt,
    );
    heldMilkGroup.visible = milkBottleScale > 0.03;
    heldMilkGroup.scale.setScalar(Math.max(0.01, milkBottleScale));
    if (heldMilkGroup.visible) {
      if (isDrinkingMilk) {
        heldMilkGroup.position.set(
          0,
          (inBathPosture ? 0.21 : isLoaf ? 0.15 : 0.11) +
            Math.sin(elapsed * 8.5) * 0.018,
          0.51,
        );
        heldMilkGroup.rotation.set(
          -0.48 + Math.sin(elapsed * 8.5) * 0.1,
          0,
          0,
        );
      } else {
        heldMilkGroup.position.set(
          0,
          (inBathPosture ? 0.16 : isLoaf ? 0.09 : 0.03) +
            Math.sin(walkPhase) * 0.015 * speedRatio,
          0.48,
        );
        heldMilkGroup.rotation.set(
          0.08 + Math.sin(walkPhase) * 0.05 * speedRatio,
          0,
          Math.cos(walkPhase) * 0.05 * speedRatio,
        );
      }
    }

    const showEggProp = isEatingEgg;
    eggPropScale = THREE.MathUtils.damp(
      eggPropScale,
      showEggProp ? 1 : 0,
      12,
      safeDt,
    );
    heldEggGroup.visible = eggPropScale > 0.03;
    heldEggGroup.scale.setScalar(Math.max(0.01, eggPropScale));
    if (heldEggGroup.visible) {
      heldEggGroup.position.set(
        0,
        (inBathPosture ? 0.2 : isLoaf ? 0.14 : 0.1) +
          Math.sin(elapsed * 11.0) * 0.015,
        0.49,
      );
      heldEggGroup.rotation.set(
        -0.25 + Math.sin(elapsed * 11.0) * 0.08,
        0,
        0,
      );
    }

    // 7. Overhead speech bubble sprite fade & gentle bob
    if (speechTimer > 0) {
      speechTimer = Math.max(0, speechTimer - safeDt);
      const age = Math.max(0, speechDuration - speechTimer);
      const popScale = age < 0.18 ? 0.72 + (age / 0.18) * 0.28 : 1.0;
      const fadeOut = speechTimer < 0.45 ? speechTimer / 0.45 : 1.0;
      speechSprite.visible = speechTimer > 0.01;
      speechSprite.position.y =
        (inBathPosture ? 0.96 : 0.86) + Math.sin(elapsed * 4.2) * 0.018;
      speechSprite.scale.set(1.15 * popScale, 0.29 * popScale, 1);
      speechMat.opacity = Math.max(0, Math.min(1, fadeOut));
    } else {
      speechSprite.visible = false;
      speechMat.opacity = 0;
    }

    // 8. Pink warmth aura & rising sparkle orbs after receiving a milk gift
    if (pinkGiftTimer > 0) {
      pinkGiftTimer = Math.max(0, pinkGiftTimer - safeDt);
      const fade = Math.min(1, pinkGiftTimer / 1.1);
      pinkAuraGroup.visible = true;
      const pulse = 1 + Math.sin(elapsed * 4.5) * 0.09;
      pinkRingMesh.scale.setScalar(pulse);
      pinkRingMat.opacity = 0.58 * fade;
      pinkOrbMat.opacity = 0.85 * fade;

      for (const orb of pinkOrbs) {
        const life = (elapsed * orb.speed + orb.phase) % 1;
        const a = orb.angle + elapsed * 0.9;
        orb.mesh.position.set(
          Math.cos(a) * orb.radius,
          0.12 + life * 1.15,
          Math.sin(a) * orb.radius,
        );
        const s = Math.sin(life * Math.PI) * 1.15;
        orb.mesh.scale.setScalar(Math.max(0.05, s));
      }
    } else {
      pinkAuraGroup.visible = false;
    }
  };

  const dispose = () => {
    if (activeCoatTexture) {
      activeCoatTexture.dispose();
      activeCoatTexture = null;
    }
    checkeredTex.dispose();
    speechTexture.dispose();
    speechMat.dispose();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
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
    root,
    setCoat,
    triggerGiftAfterglow,
    setHeldMilk,
    triggerDrinkMilk,
    triggerEatEgg,
    showSpeechBubble,
    update,
    dispose,
  };
}
