import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioMixerSettings, OnsenAudioEngine } from '../audio/onsenAudio';
import {
  REMOTE_PEER_STALE_MS,
  type ClientPlayerPayload,
  type MultiplayerRoomStatus,
} from '../shared/multiplayerProtocol';
import { CatCoatId, getCatCoatById } from './catCoats';
import { createCatAvatar, CatAvatarController } from './catAvatar';
import { OnsenMultiplayerClient } from './multiplayerClient';
import {
  DEFAULT_MAX_TRAIN_FOLLOWERS,
  NPC_CAT_SPECS,
  NpcCatRuntimeState,
  stepNpcCats,
} from './npcTrainMath';
import {
  RemoteCatSimState,
  applyRemotePeerUpdate,
  collectStaleRemoteIds,
  createRemoteCatSimState,
  findNearestMilkRecipient,
  stepRemoteCatSim,
} from './remoteCatsMath';
import { createOnsenWorld, OnsenWorldController } from './onsenWorld';
import { createProceduralTextureBundle } from './proceduralTextures';
import {
  ACTION_SPOTS,
  CatActionMode,
  GREET_DURATION,
  GROOM_DURATION,
  KNEAD_LOOP_DURATION,
  MILK_DRINK_OPTIONS,
  MILK_SOCIAL_MESSAGES,
  MilkDrinkId,
  MilkDrinkOption,
  NearbyInteractKind,
  NearbyInteractPrompt,
  SOAK_YUZU_DELAY,
  WishYuzuItem,
  computeForestWindGain,
  computeHearthFireGain,
  computePurrProximity,
  computeWaterGain,
  detectFootstepSurface,
  findNearbyInteractPrompt,
  getMilkDrinkById,
  isNearMilkVending,
} from './ritualMath';
import { findWorldPath } from './pathfinding';
import {
  CAMERA_DEFAULTS,
  FOOTBATH_DECK_HEIGHT,
  FOOTBATH_SEAT_SPOTS,
  LANDMARKS,
  MYOYEONGAK_CUSHION_SPOTS,
  TELEPORT_SPOTS,
  Vec2,
  WorldZoneId,
  computeCameraRig,
  computeWorldMoveFromInput,
  detectZone,
  exponentialDampingAlpha,
  findNearestEmptyCushion,
  findNearestEmptyFootbathSeat,
  groundHeightAt,
  isInsideMainBath,
  resolvePlayerCollisions,
} from './terrainMath';

export type TimeOfDay = 'day' | 'night';

export interface MilkSocialTargetInfo {
  kind: 'remote' | 'npc';
  id: string;
  name: string;
}

export interface IncomingMilkOfferEvent {
  fromPeerId: string;
  senderName: string;
  drink: MilkDrinkOption;
  isNpc?: boolean;
}

export interface IncomingMilkRequestEvent {
  fromPeerId: string;
  requesterName: string;
  drink: MilkDrinkOption;
}

export interface OnsenSceneHandle {
  triggerGreet: () => void;
  triggerKneadOrLoaf: () => void;
  triggerBathSoak: () => void;
  triggerGroom: () => void;
  playVendingDrop: () => void;
  holdMilk: (drink: MilkDrinkOption | null) => void;
  drinkHeldMilk: () => void;
  drinkSelfMilk: (bottleColor: string, capColor: string) => void;
  offerHeldMilkToTarget: (explicitTarget?: MilkSocialTargetInfo) => void;
  respondMilkOffer: (
    fromPeerId: string,
    drinkId: MilkDrinkId,
    accepted: boolean,
    isNpc?: boolean,
  ) => void;
  requestMilkFromTarget: (
    drinkId?: MilkDrinkId,
    explicitTarget?: MilkSocialTargetInfo,
  ) => void;
  respondMilkRequest: (
    toPeerId: string,
    drinkId: MilkDrinkId,
    accepted: boolean,
  ) => void;
  giftMilkToNearestNpc: (drinkLabel: string) => string | null;
  toggleWalkTrain: () => void;
  walkToZone: (zoneId: WorldZoneId) => void;
  stopAutoWalk: () => void;
  capturePolaroid: () => string | null;
  standUp: () => void;
  triggerInteraction: (kind: NearbyInteractKind) => void;
  broadcastWish: (wish: WishYuzuItem) => void;
}

interface OnsenSceneProps {
  coatId: CatCoatId;
  timeOfDay: TimeOfDay;
  wishYuzus: readonly WishYuzuItem[];
  mixerSettings: AudioMixerSettings;
  trainActive: boolean;
  hideRemoteCats?: boolean;
  heldMilk?: MilkDrinkOption | null;
  onActionModeChange?: (mode: CatActionMode) => void;
  onZoneChange?: (zone: WorldZoneId) => void;
  onWalkingTargetChange?: (label: string | null) => void;
  onTrainActiveChange?: (active: boolean) => void;
  onOpenWishComposer?: () => void;
  onSelectWishYuzu?: (wishId: string) => void;
  onOpenMilkVending?: () => void;
  onIncrementKneadCount?: () => void;
  onCarryingChange?: (carrying: boolean) => void;
  onHeldMilkChange?: (drink: MilkDrinkOption | null) => void;
  onSocialTargetsChange?: (targets: {
    nearbyGiveTarget: MilkSocialTargetInfo | null;
    nearbyVendingTarget: MilkSocialTargetInfo | null;
  }) => void;
  onIncomingMilkOffer?: (offer: IncomingMilkOfferEvent) => void;
  onIncomingMilkRequest?: (req: IncomingMilkRequestEvent) => void;
  onNearbyInteractChange?: (prompt: NearbyInteractPrompt | null) => void;
  onShowToast?: (message: string) => void;
  onMultiplayerStatusChange?: (status: MultiplayerRoomStatus) => void;
  onRoomSnapshotWishes?: (wishes: WishYuzuItem[]) => void;
  onRemoteWishReceived?: (wish: WishYuzuItem) => void;
  onWebglContextChange?: (lost: boolean) => void;
}

const DAY_HEMI_SKY = new THREE.Color('#e4eef5');
const DAY_HEMI_GROUND = new THREE.Color('#b5aba0');
const NIGHT_HEMI_SKY = new THREE.Color('#8ea2c8');
const NIGHT_HEMI_GROUND = new THREE.Color('#6e6052');

const DAY_AMBIENT = new THREE.Color('#f8efe6');
const NIGHT_AMBIENT = new THREE.Color('#ebd0c4');

const DAY_DIR = new THREE.Color('#fff3dc');
const NIGHT_DIR = new THREE.Color('#9fb8ec');

const DAY_FOG = new THREE.Color('#bccad1');
const NIGHT_FOG = new THREE.Color('#252d42');

function detectSoftwareWebGL(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function shortestAngleLerp(current: number, target: number, alpha: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

export const OnsenScene = forwardRef<OnsenSceneHandle, OnsenSceneProps>(
  function OnsenScene(
    {
      coatId,
      timeOfDay,
      wishYuzus,
      mixerSettings,
      trainActive,
      hideRemoteCats = false,
      heldMilk = null,
      onActionModeChange,
      onZoneChange,
      onWalkingTargetChange,
      onTrainActiveChange,
      onOpenWishComposer,
      onSelectWishYuzu,
      onOpenMilkVending,
      onIncrementKneadCount,
      onCarryingChange,
      onHeldMilkChange,
      onSocialTargetsChange,
      onIncomingMilkOffer,
      onIncomingMilkRequest,
      onNearbyInteractChange,
      onShowToast,
      onMultiplayerStatusChange,
      onRoomSnapshotWishes,
      onRemoteWishReceived,
      onWebglContextChange,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const coatRef = useRef<CatCoatId>(coatId);
    const timeOfDayRef = useRef<TimeOfDay>(timeOfDay);
    const wishYuzusRef = useRef<readonly WishYuzuItem[]>(wishYuzus);
    const mixerRef = useRef<AudioMixerSettings>(mixerSettings);
    const trainActiveRef = useRef<boolean>(trainActive);
    const hideRemoteCatsRef = useRef<boolean>(hideRemoteCats);
    const heldMilkRef = useRef<MilkDrinkOption | null>(heldMilk);

    const onActionModeChangeRef = useRef(onActionModeChange);
    const onZoneChangeRef = useRef(onZoneChange);
    const onWalkingTargetChangeRef = useRef(onWalkingTargetChange);
    const onTrainActiveChangeRef = useRef(onTrainActiveChange);
    const onOpenWishComposerRef = useRef(onOpenWishComposer);
    const onSelectWishYuzuRef = useRef(onSelectWishYuzu);
    const onOpenMilkVendingRef = useRef(onOpenMilkVending);
    const onIncrementKneadCountRef = useRef(onIncrementKneadCount);
    const onCarryingChangeRef = useRef(onCarryingChange);
    const onHeldMilkChangeRef = useRef(onHeldMilkChange);
    const onSocialTargetsChangeRef = useRef(onSocialTargetsChange);
    const onIncomingMilkOfferRef = useRef(onIncomingMilkOffer);
    const onIncomingMilkRequestRef = useRef(onIncomingMilkRequest);
    const onNearbyInteractChangeRef = useRef(onNearbyInteractChange);
    const onShowToastRef = useRef(onShowToast);
    const onMultiplayerStatusChangeRef = useRef(onMultiplayerStatusChange);
    const onRoomSnapshotWishesRef = useRef(onRoomSnapshotWishes);
    const onRemoteWishReceivedRef = useRef(onRemoteWishReceived);
    const onWebglContextChangeRef = useRef(onWebglContextChange);
    onActionModeChangeRef.current = onActionModeChange;
    onZoneChangeRef.current = onZoneChange;
    onWalkingTargetChangeRef.current = onWalkingTargetChange;
    onTrainActiveChangeRef.current = onTrainActiveChange;
    onOpenWishComposerRef.current = onOpenWishComposer;
    onSelectWishYuzuRef.current = onSelectWishYuzu;
    onOpenMilkVendingRef.current = onOpenMilkVending;
    onIncrementKneadCountRef.current = onIncrementKneadCount;
    onCarryingChangeRef.current = onCarryingChange;
    onHeldMilkChangeRef.current = onHeldMilkChange;
    onSocialTargetsChangeRef.current = onSocialTargetsChange;
    onIncomingMilkOfferRef.current = onIncomingMilkOffer;
    onIncomingMilkRequestRef.current = onIncomingMilkRequest;
    onNearbyInteractChangeRef.current = onNearbyInteractChange;
    onShowToastRef.current = onShowToast;
    onMultiplayerStatusChangeRef.current = onMultiplayerStatusChange;
    onRoomSnapshotWishesRef.current = onRoomSnapshotWishes;
    onRemoteWishReceivedRef.current = onRemoteWishReceived;
    onWebglContextChangeRef.current = onWebglContextChange;

    const avatarRef = useRef<CatAvatarController | null>(null);
    const worldRef = useRef<OnsenWorldController | null>(null);
    const audioRef = useRef<OnsenAudioEngine | null>(null);
    const forceTickRef = useRef<(() => void) | null>(null);
    const actionApiRef = useRef<OnsenSceneHandle | null>(null);
    const syncRemoteVisibilityRef = useRef<((hidden: boolean) => void) | null>(null);
    const multiplayerRef = useRef<OnsenMultiplayerClient | null>(null);

    useImperativeHandle(ref, () => ({
      triggerGreet: () => actionApiRef.current?.triggerGreet(),
      triggerKneadOrLoaf: () => actionApiRef.current?.triggerKneadOrLoaf(),
      triggerBathSoak: () => actionApiRef.current?.triggerBathSoak(),
      triggerGroom: () => actionApiRef.current?.triggerGroom(),
      playVendingDrop: () => actionApiRef.current?.playVendingDrop(),
      holdMilk: (drink: MilkDrinkOption | null) =>
        actionApiRef.current?.holdMilk(drink),
      drinkHeldMilk: () => actionApiRef.current?.drinkHeldMilk(),
      drinkSelfMilk: (bottleColor: string, capColor: string) =>
        actionApiRef.current?.drinkSelfMilk(bottleColor, capColor),
      offerHeldMilkToTarget: (explicitTarget?: MilkSocialTargetInfo) =>
        actionApiRef.current?.offerHeldMilkToTarget(explicitTarget),
      respondMilkOffer: (
        fromPeerId: string,
        drinkId: MilkDrinkId,
        accepted: boolean,
        isNpc?: boolean,
      ) =>
        actionApiRef.current?.respondMilkOffer(
          fromPeerId,
          drinkId,
          accepted,
          isNpc,
        ),
      requestMilkFromTarget: (
        drinkId?: MilkDrinkId,
        explicitTarget?: MilkSocialTargetInfo,
      ) => actionApiRef.current?.requestMilkFromTarget(drinkId, explicitTarget),
      respondMilkRequest: (
        toPeerId: string,
        drinkId: MilkDrinkId,
        accepted: boolean,
      ) => actionApiRef.current?.respondMilkRequest(toPeerId, drinkId, accepted),
      giftMilkToNearestNpc: (drinkLabel: string) =>
        actionApiRef.current?.giftMilkToNearestNpc(drinkLabel) ?? null,
      toggleWalkTrain: () => actionApiRef.current?.toggleWalkTrain(),
      walkToZone: (zoneId: WorldZoneId) =>
        actionApiRef.current?.walkToZone(zoneId),
      stopAutoWalk: () => actionApiRef.current?.stopAutoWalk(),
      capturePolaroid: () => actionApiRef.current?.capturePolaroid() ?? null,
      standUp: () => actionApiRef.current?.standUp(),
      triggerInteraction: (kind: NearbyInteractKind) =>
        actionApiRef.current?.triggerInteraction(kind),
      broadcastWish: (wish: WishYuzuItem) =>
        multiplayerRef.current?.sendWishAdd(wish),
    }));

    useEffect(() => {
      hideRemoteCatsRef.current = hideRemoteCats;
      syncRemoteVisibilityRef.current?.(hideRemoteCats);
      forceTickRef.current?.();
    }, [hideRemoteCats]);

    useEffect(() => {
      heldMilkRef.current = heldMilk;
      avatarRef.current?.setHeldMilk(
        heldMilk ? heldMilk.bottleColor : null,
        heldMilk?.capColor,
      );
      forceTickRef.current?.();
    }, [heldMilk]);

    useEffect(() => {
      coatRef.current = coatId;
      avatarRef.current?.setCoat(coatId);
      if (mountRef.current) mountRef.current.dataset.coat = coatId;
      forceTickRef.current?.();
    }, [coatId]);

    useEffect(() => {
      timeOfDayRef.current = timeOfDay;
      if (mountRef.current) mountRef.current.dataset.time = timeOfDay;
      forceTickRef.current?.();
    }, [timeOfDay]);

    useEffect(() => {
      wishYuzusRef.current = wishYuzus;
      worldRef.current?.syncWishYuzus(wishYuzus);
      forceTickRef.current?.();
    }, [wishYuzus]);

    useEffect(() => {
      mixerRef.current = mixerSettings;
      audioRef.current?.updateSettings(mixerSettings);
    }, [mixerSettings]);

    useEffect(() => {
      trainActiveRef.current = trainActive;
      if (mountRef.current) mountRef.current.dataset.train = trainActive ? '1' : '0';
      forceTickRef.current?.();
    }, [trainActive]);

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const isMobile = detectMobileDevice();
      const lowPerf = isSoftwareGl || isMobile;
      const pixelRatioCap = lowPerf ? 1 : 1.75;
      const audio = new OnsenAudioEngine();
      audio.updateSettings(mixerRef.current);
      audioRef.current = audio;

      const renderer = new THREE.WebGLRenderer({
        antialias: !lowPerf,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: isSoftwareGl,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, pixelRatioCap),
      );
      renderer.shadowMap.enabled = !lowPerf;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );

      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      canvas.setAttribute('data-testid', 'onsen-canvas');
      container.appendChild(canvas);

      let contextLost = false;
      const onContextLost = (e: Event) => {
        e.preventDefault();
        contextLost = true;
        cancelAnimationFrame(rafId);
        clearTimeout(frameId);
        onWebglContextChangeRef.current?.(true);
      };
      const onContextRestored = () => {
        if (disposed) return;
        contextLost = false;
        onWebglContextChangeRef.current?.(false);
        lastTime = performance.now();
        if (isSoftwareGl) {
          renderer.render(scene, camera);
          afterDraw(() => tick(true));
        } else {
          rafId = requestAnimationFrame(() => tick(true));
        }
      };
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);

      const scene = new THREE.Scene();
      scene.background = DAY_FOG.clone();
      const fog = new THREE.Fog(DAY_FOG.getHex(), 65, 185);
      scene.fog = fog;

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
      scene.environment = envTarget.texture;
      roomEnv.dispose();
      pmremGenerator.dispose();

      const initW = container.clientWidth || window.innerWidth;
      const initH = container.clientHeight || window.innerHeight;
      const initAspect = initW / Math.max(1, initH);
      const camera = new THREE.PerspectiveCamera(
        initAspect < 0.85 ? CAMERA_DEFAULTS.fovPortrait : CAMERA_DEFAULTS.fovLandscape,
        initAspect,
        0.08,
        280,
      );

      const hemiLight = new THREE.HemisphereLight(
        DAY_HEMI_SKY.getHex(),
        DAY_HEMI_GROUND.getHex(),
        0.82,
      );
      hemiLight.position.set(0, 50, 0);
      scene.add(hemiLight);

      const ambientLight = new THREE.AmbientLight(DAY_AMBIENT.getHex(), 0.16);
      scene.add(ambientLight);

      const sunLight = new THREE.DirectionalLight(DAY_DIR.getHex(), 2.15);
      sunLight.position.set(-32, 36, 30);
      sunLight.target.position.set(0, 0, 8);
      scene.add(sunLight.target);
      sunLight.castShadow = !lowPerf;
      const shadowRes = isMobile ? 1024 : 2048;
      sunLight.shadow.mapSize.set(shadowRes, shadowRes);
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 145;
      sunLight.shadow.camera.left = -58;
      sunLight.shadow.camera.right = 58;
      sunLight.shadow.camera.top = 58;
      sunLight.shadow.camera.bottom = -58;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.075;
      sunLight.shadow.radius = isMobile ? 2.0 : 3.5;
      scene.add(sunLight);

      const maxAnisotropy = Math.min(
        isMobile ? 2 : 8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      const textures = createProceduralTextureBundle(maxAnisotropy);
      const world = createOnsenWorld(textures, lowPerf);
      world.syncWishYuzus(wishYuzusRef.current);
      worldRef.current = world;
      scene.add(world.group);

      const avatar = createCatAvatar(
        coatRef.current,
        textures.contactShadowMap,
        maxAnisotropy,
      );
      avatarRef.current = avatar;
      scene.add(avatar.root);

      // 7 NPC Cat Friends (soaking in bath with towels/yuzus + loafing in Myoyeongak & rim)
      const npcEntries = NPC_CAT_SPECS.map((spec) => {
        const npcAvatar = createCatAvatar(
          spec.coatId,
          textures.contactShadowMap,
          maxAnisotropy,
        );
        const startY = groundHeightAt(spec.homeX, spec.homeZ);
        npcAvatar.root.position.set(spec.homeX, startY, spec.homeZ);
        npcAvatar.root.rotation.y = spec.homeHeading;
        npcAvatar.root.userData = { isNpcCat: true, npcId: spec.id };
        npcAvatar.root.traverse((obj) => {
          obj.userData.isNpcCat = true;
          obj.userData.npcId = spec.id;
        });
        scene.add(npcAvatar.root);
        const state: NpcCatRuntimeState = {
          spec,
          x: spec.homeX,
          y: startY,
          z: spec.homeZ,
          heading: spec.homeHeading,
          actionMode: spec.homeAction,
          moveSpeed: 0,
        };
        return { avatar: npcAvatar, state };
      });
      const npcStates = npcEntries.map((e) => e.state);
      const npcRoots = npcEntries.map((e) => e.avatar.root);

      // Player & Action State
      const playerPos: { x: number; y: number; z: number } = {
        x: LANDMARKS.entranceBridge.x,
        y: groundHeightAt(LANDMARKS.entranceBridge.x, LANDMARKS.entranceBridge.z),
        z: LANDMARKS.entranceBridge.z,
      };
      let playerHeading = Math.PI;
      let cameraYaw = 0;
      let cameraPitch = 0.02;
      let cameraDistance: number = CAMERA_DEFAULTS.defaultDistance;
      let nightBlend = timeOfDayRef.current === 'night' ? 1 : 0;

      let actionMode: CatActionMode = 'idle';
      let actionTime = 0;
      let soakTime = 0;
      let hasHeadYuzu = false;
      let carryingFirewood = false;
      let footstepTimer = 0;
      let bathAutoGroomCooldown = 8.0;
      let preGroomAction: CatActionMode = 'idle';
      let pendingArrivalAction:
        | 'soak'
        | 'sitBench'
        | 'footSoak'
        | 'pickup_firewood'
        | 'stoke_firewood'
        | 'egg_ritual'
        | 'greet'
        | 'milk_offer'
        | 'milk_request'
        | 'loaf'
        | 'knead'
        | 'groom'
        | 'idle'
        | null = null;
      let pendingArrivalHeading: number | null = null;
      let pendingArrivalPos: { x: number; z: number } | null = null;
      let pendingSocialTarget: MilkSocialTargetInfo | null = null;
      let pendingSocialDrinkId: MilkDrinkId = 'banana';
      let snapCameraNextTick = false;
      let hoveredInteractType: string | null = null;
      let lastNearbyPromptKey = '';
      let currentNearbyPrompt: NearbyInteractPrompt | null = null;
      let lastSocialTargetsKey = '';
      let lastNearbyGiveTarget: MilkSocialTargetInfo | null = null;
      let lastNearbyVendingTarget: MilkSocialTargetInfo | null = null;
      let npcMilkTimeoutId: number | null = null;

      const setCarryingFirewood = (next: boolean) => {
        if (carryingFirewood !== next) {
          carryingFirewood = next;
          container.dataset.carrying = next ? '1' : '0';
          onCarryingChangeRef.current?.(next);
        }
      };

      const setActionMode = (next: CatActionMode) => {
        if (next === 'soak' || next === 'sitBench' || next === 'footSoak') {
          setCarryingFirewood(false);
        }
        if (actionMode !== next) {
          const prevAction = actionMode;
          const keepBathState =
            next === 'soak' || isInsideMainBath(playerPos.x, playerPos.z);

          if (next === 'soak' && prevAction !== 'groom') {
            bathAutoGroomCooldown = 1.6;
          }
          if (next === 'groom') {
            preGroomAction =
              prevAction === 'soak' ||
              prevAction === 'sitBench' ||
              prevAction === 'footSoak' ||
              prevAction === 'carrying'
                ? prevAction
                : isInsideMainBath(playerPos.x, playerPos.z)
                  ? 'soak'
                  : carryingFirewood
                    ? 'carrying'
                    : 'idle';
          }

          actionMode = next;
          actionTime = 0;
          if (!keepBathState) {
            soakTime = 0;
            hasHeadYuzu = false;
          }
          container.dataset.action = next;
          container.dataset.headYuzu = hasHeadYuzu ? '1' : '0';
          onActionModeChangeRef.current?.(next);
        }
      };

      const setHeldMilkState = (drink: MilkDrinkOption | null) => {
        if (drink) {
          setCarryingFirewood(false);
        }
        heldMilkRef.current = drink;
        avatar.setHeldMilk(drink ? drink.bottleColor : null, drink?.capColor);
        onHeldMilkChangeRef.current?.(drink);
      };

      const remoteEntries = new Map<
        string,
        { sim: RemoteCatSimState; avatar: CatAvatarController }
      >();
      let syncedServerFireCount = 0;

      const formatRemoteCatName = (coatId: CatCoatId) =>
        `${getCatCoatById(coatId).name} 손님`;

      const clearRemoteEntries = () => {
        for (const entry of remoteEntries.values()) {
          scene.remove(entry.avatar.root);
          entry.avatar.dispose();
        }
        remoteEntries.clear();
      };

      const upsertRemoteEntry = (peer: Parameters<typeof applyRemotePeerUpdate>[1], nowMs: number) => {
        const existing = remoteEntries.get(peer.id);
        if (existing) {
          const { coatChanged } = applyRemotePeerUpdate(existing.sim, peer, nowMs);
          if (coatChanged) {
            existing.avatar.setCoat(existing.sim.coatId);
          }
          existing.avatar.root.visible = !hideRemoteCatsRef.current;
          return;
        }
        const sim = createRemoteCatSimState(peer, nowMs);
        const remoteAvatar = createCatAvatar(
          sim.coatId,
          textures.contactShadowMap,
          maxAnisotropy,
        );
        remoteAvatar.root.name = `RemoteCat-${peer.id}`;
        remoteAvatar.root.userData = { isRemoteCat: true, remoteId: peer.id };
        remoteAvatar.root.traverse((obj) => {
          obj.userData.isRemoteCat = true;
          obj.userData.remoteId = peer.id;
        });
        remoteAvatar.root.position.set(sim.x, sim.y, sim.z);
        remoteAvatar.root.rotation.y = sim.heading;
        remoteAvatar.root.visible = !hideRemoteCatsRef.current;
        scene.add(remoteAvatar.root);
        remoteEntries.set(peer.id, { sim, avatar: remoteAvatar });
      };

      const removeRemoteEntry = (peerId: string) => {
        const entry = remoteEntries.get(peerId);
        if (!entry) return;
        scene.remove(entry.avatar.root);
        entry.avatar.dispose();
        remoteEntries.delete(peerId);
      };

      syncRemoteVisibilityRef.current = (hidden: boolean) => {
        for (const entry of remoteEntries.values()) {
          entry.avatar.root.visible = !hidden;
        }
      };

      const getPlayerPayload = (currentSpeed = 0): ClientPlayerPayload => ({
        coatId: coatRef.current,
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        heading: playerHeading,
        actionMode,
        moveSpeed: currentSpeed,
        hasHeadYuzu,
        carryingFirewood,
        heldMilkId: heldMilkRef.current?.id ?? null,
      });

      const multiplayer = new OnsenMultiplayerClient({
        getInitialState: () => getPlayerPayload(0),
        onStatusChange: (status) => {
          container.dataset.room = status.roomId ?? 'offline';
          container.dataset.peers = String(status.peerCount);
          onMultiplayerStatusChangeRef.current?.(status);
        },
        onRoomSnapshot: (snapshot) => {
          clearRemoteEntries();
          const nowMs = Date.now();
          for (const peer of snapshot.peers) {
            upsertRemoteEntry(peer, nowMs);
          }
          onRoomSnapshotWishesRef.current?.(snapshot.wishes);
          const targetLogs = Math.min(8, snapshot.fireCount);
          while (syncedServerFireCount < targetLogs) {
            world.stokeFirewood();
            syncedServerFireCount += 1;
          }
          forceTickRef.current?.();
        },
        onPeerUpdate: (peer) => {
          upsertRemoteEntry(peer, Date.now());
          forceTickRef.current?.();
        },
        onPeerLeave: (peerId) => {
          removeRemoteEntry(peerId);
          forceTickRef.current?.();
        },
        onRemoteWishAdd: (wish) => {
          onRemoteWishReceivedRef.current?.(wish);
          if (!hideRemoteCatsRef.current) {
            onShowToastRef.current?.('다른 고양이가 연못에 감사·응원 유자를 띄웠어요 🍊');
          }
        },
        onRemoteFireStoke: (_fromPeerId, fireCount) => {
          world.stokeFirewood();
          syncedServerFireCount = Math.max(
            syncedServerFireCount,
            Math.min(8, fireCount),
          );
          if (!hideRemoteCatsRef.current) {
            audio.playFireStoke();
            onShowToastRef.current?.('다른 고양이가 아궁이에 장작을 넣었어요 🔥');
          }
          forceTickRef.current?.();
        },
        onRemoteBambooRing: () => {
          world.triggerShishiOdoshi();
          if (!hideRemoteCatsRef.current) {
            audio.playShishiOdoshi();
          }
          forceTickRef.current?.();
        },
        onRemoteMilkGift: (_fromPeerId, targetPeerId) => {
          if (hideRemoteCatsRef.current) return;
          const selfId = multiplayer.getStatus().selfId;
          if (!targetPeerId || targetPeerId === selfId) {
            avatar.triggerGiftAfterglow();
            audio.playGiftChime();
            onShowToastRef.current?.(
              '다른 고양이에게서 따뜻한 우유 선물을 받았어요 🥛✨',
            );
          } else {
            const targetEntry = remoteEntries.get(targetPeerId);
            if (targetEntry) {
              targetEntry.avatar.triggerGiftAfterglow();
              audio.playGiftChime();
            }
          }
          forceTickRef.current?.();
        },
        onRemoteMilkOffer: (fromPeerId, fromCoatId, drinkId) => {
          if (hideRemoteCatsRef.current) return;
          const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
          const senderName = formatRemoteCatName(fromCoatId);
          audio.playMeow(1.1);
          onIncomingMilkOfferRef.current?.({
            fromPeerId,
            senderName,
            drink,
          });
          forceTickRef.current?.();
        },
        onRemoteMilkRespond: (fromPeerId, fromCoatId, drinkId, accepted) => {
          if (hideRemoteCatsRef.current) return;
          const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
          const receiverName = formatRemoteCatName(fromCoatId);
          if (accepted) {
            setHeldMilkState(null);
            const targetAvatar = remoteEntries.get(fromPeerId)?.avatar;
            targetAvatar?.triggerDrinkMilk(drink.bottleColor, drink.capColor);
            targetAvatar?.showSpeechBubble('😻 고맙다냥! 꿀꺽~ 💕', 3.5);
            audio.playGiftChime();
            multiplayer.sendState(getPlayerPayload(0), Date.now(), true);
            onShowToastRef.current?.(
              MILK_SOCIAL_MESSAGES.acceptSenderToast(receiverName, drink.label),
            );
          } else {
            remoteEntries
              .get(fromPeerId)
              ?.avatar.showSpeechBubble('😿 배부르다냥... 마음만 고마워!', 3.0);
            audio.playMeow(0.95);
            onShowToastRef.current?.(
              MILK_SOCIAL_MESSAGES.declineSenderToast(receiverName),
            );
          }
          forceTickRef.current?.();
        },
        onRemoteMilkRequest: (fromPeerId, fromCoatId, drinkId) => {
          if (hideRemoteCatsRef.current) return;
          const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
          const requesterName = formatRemoteCatName(fromCoatId);
          audio.playMeow(1.18);
          onIncomingMilkRequestRef.current?.({
            fromPeerId,
            requesterName,
            drink,
          });
          forceTickRef.current?.();
        },
        onRemoteMilkRequestDecline: (_fromPeerId, fromCoatId) => {
          if (hideRemoteCatsRef.current) return;
          const targetName = formatRemoteCatName(fromCoatId);
          audio.playMeow(0.95);
          onShowToastRef.current?.(
            MILK_SOCIAL_MESSAGES.requestDeclineSenderToast(targetName),
          );
          forceTickRef.current?.();
        },
      });
      multiplayerRef.current = multiplayer;
      multiplayer.start();

      avatar.root.position.set(playerPos.x, playerPos.y, playerPos.z);
      avatar.root.rotation.y = playerHeading;

      const initRig = computeCameraRig(
        initAspect,
        cameraDistance,
        cameraYaw,
        cameraPitch,
        playerPos,
      );
      const currentCamPos = new THREE.Vector3(
        initRig.position.x,
        initRig.position.y,
        initRig.position.z,
      );
      const currentCamLook = new THREE.Vector3(
        initRig.lookAt.x,
        initRig.lookAt.y,
        initRig.lookAt.z,
      );
      camera.fov = initRig.fov;
      camera.position.copy(currentCamPos);
      camera.lookAt(currentCamLook);
      camera.updateProjectionMatrix();

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      const initialZone = detectZone(playerPos.x, playerPos.z);
      container.dataset.coat = coatRef.current;
      container.dataset.time = timeOfDayRef.current;
      container.dataset.zone = initialZone;
      container.dataset.action = actionMode;
      container.dataset.headYuzu = '0';
      container.dataset.carrying = '0';
      container.dataset.walking = '';
      container.dataset.train = trainActiveRef.current ? '1' : '0';
      container.dataset.npcCount = String(npcEntries.length);
      onZoneChangeRef.current?.(initialZone);

      const pressedKeys = new Set<string>();
      let walkQueue: Vec2[] = [];
      let walkSpeedMode: 'normal' | 'journey' = 'normal';
      let walkingTargetLabel: string | null = null;
      let userCameraOverrideTimer = 0;
      let isDragging = false;
      let dragDistance = 0;
      let lastPointerX = 0;
      let lastPointerY = 0;
      let lastPointerType = 'mouse'; // 'mouse' | 'touch' | 'pen'

      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      const targetCamPosVec = new THREE.Vector3();
      const targetCamLookVec = new THREE.Vector3();

      const setWalkingTarget = (label: string | null) => {
        if (walkingTargetLabel !== label) {
          walkingTargetLabel = label;
          container.dataset.walking = label ?? '';
          onWalkingTargetChangeRef.current?.(label);
        }
      };

      const clearWalkJourney = () => {
        walkQueue = [];
        walkSpeedMode = 'normal';
        pendingArrivalAction = null;
        pendingArrivalHeading = null;
        pendingArrivalPos = null;
        pendingSocialTarget = null;
        setWalkingTarget(null);
        world.setDestinationMarker(0, 0, 0, false);
      };

      const stopAutoWalk = () => {
        const hadAutoWalk = walkQueue.length > 0 || walkingTargetLabel !== null;
        clearWalkJourney();
        if (hadAutoWalk && actionMode === 'walk') {
          setActionMode(
            isInsideMainBath(playerPos.x, playerPos.z)
              ? 'soak'
              : carryingFirewood
                ? 'carrying'
                : 'idle',
          );
        }
        forceTickRef.current?.();
      };

      const performFirewoodPickup = () => {
        setCarryingFirewood(true);
        setActionMode('carrying');
        audio.playWoodPickup();
        avatar.showSpeechBubble('🪵 영차! 아궁이로 가져가자냥', 2.6);
        onShowToastRef.current?.(
          '체크무늬 수건을 두르고 장작 1개비를 들었어요! 옆의 아궁이를 클릭해 넣어주세요.',
        );
        forceTickRef.current?.();
      };

      const performFirewoodStoke = () => {
        setCarryingFirewood(false);
        setActionMode('idle');
        world.stokeFirewood();
        syncedServerFireCount = Math.min(8, syncedServerFireCount + 1);
        audio.playFireStoke();
        multiplayer.sendFireStoke();
        avatar.showSpeechBubble('🔥 아궁이 활활! 노천탕이 더 따뜻해졌다냥', 3.2);
        onShowToastRef.current?.('온천 온도 +1°C (노천탕 수증기가 모락모락!)');
        forceTickRef.current?.();
      };

      const performEggRitual = () => {
        const started = world.triggerEggRitual(() => {
          playerHeading = cameraYaw;
          avatar.triggerEatEgg();
          avatar.showSpeechBubble('🥚 반숙 달걀 냠냠! 따끈하다냥 😋', 3.6);
          audio.playEggReadyChime();
          onShowToastRef.current?.(
            '온천 달걀이 따끈하게 익었어요! (촉촉한 반숙 완성)',
          );
          forceTickRef.current?.();
        });
        if (started) {
          audio.playEggDipBubbles();
          avatar.showSpeechBubble('🥚 온천수에 달걀 삶는 중...', 2.4);
          onShowToastRef.current?.(
            '온천수 원천 바구니에 달걀을 담그고 있어요...',
          );
        }
        forceTickRef.current?.();
      };

      const offerMilkToSocialTarget = (explicitTarget?: MilkSocialTargetInfo) => {
        const drink = heldMilkRef.current;
        if (!drink) {
          onShowToastRef.current?.('먼저 자판기에서 따뜻한 병우유를 뽑아 들어주세요.');
          return;
        }
        const target = explicitTarget ?? lastNearbyGiveTarget;
        if (!target) {
          onShowToastRef.current?.(
            '가까이에 우유를 건넬 다른 유저나 고양이가 없어요. 옆으로 걸어가 보세요!',
          );
          return;
        }

        audio.unlock();
        if (target.kind === 'remote') {
          const remoteEntry = remoteEntries.get(target.id);
          if (!remoteEntry) {
            onShowToastRef.current?.('친구가 방금 자리를 비웠어요.');
            return;
          }
          playerHeading = Math.atan2(
            remoteEntry.sim.x - playerPos.x,
            remoteEntry.sim.z - playerPos.z,
          );
          setActionMode('greet');
          audio.playMeow(1.08);
          avatar.showSpeechBubble(`🎁 ${drink.label} 마실래냥?`, 3.0);
          multiplayer.sendMilkOffer(target.id, drink.id);
          onShowToastRef.current?.(
            `${target.name}에게 ${drink.label}를 두 앞발로 내밀었어요! 응답을 기다리는 중... 🥛`,
          );
          forceTickRef.current?.();
          return;
        }

        const npc = npcEntries.find((e) => e.state.spec.id === target.id);
        if (!npc) return;
        playerHeading = Math.atan2(
          npc.state.x - playerPos.x,
          npc.state.z - playerPos.z,
        );
        npc.state.greetReactionTimer = 2.6;
        npc.state.greetTargetHeading = Math.atan2(
          playerPos.x - npc.state.x,
          playerPos.z - npc.state.z,
        );
        avatar.showSpeechBubble(`🎁 ${drink.label} 선물이다냥!`, 2.4);
        npc.avatar.triggerDrinkMilk(drink.bottleColor, drink.capColor);
        npc.avatar.showSpeechBubble('😻 고맙다냥! 꿀꺽~ 💕', 3.5);
        audio.playGiftChime();
        setHeldMilkState(null);
        multiplayer.sendState(getPlayerPayload(0), Date.now(), true);
        onShowToastRef.current?.(
          MILK_SOCIAL_MESSAGES.acceptSenderToast(npc.state.spec.name, drink.label),
        );
        forceTickRef.current?.();
      };

      const requestMilkFromSocialTarget = (
        drinkId: MilkDrinkId = 'banana',
        explicitTarget?: MilkSocialTargetInfo,
      ) => {
        if (!isNearMilkVending(playerPos.x, playerPos.z)) {
          onShowToastRef.current?.(
            '우유 자판기 근처에서 다른 고양이에게 우유를 요청할 수 있어요 🥛',
          );
          return;
        }
        const target = explicitTarget ?? lastNearbyVendingTarget;
        if (!target) {
          onShowToastRef.current?.(
            '자판기 근처에 우유를 요청할 다른 유저나 고양이가 없어요.',
          );
          return;
        }
        const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
        audio.unlock();

        if (target.kind === 'remote') {
          const remoteEntry = remoteEntries.get(target.id);
          if (!remoteEntry) {
            onShowToastRef.current?.('상대 고양이가 멀어졌어요.');
            return;
          }
          playerHeading = Math.atan2(
            remoteEntry.sim.x - playerPos.x,
            remoteEntry.sim.z - playerPos.z,
          );
          setActionMode('greet');
          audio.playMeow(1.16);
          avatar.showSpeechBubble(`🥺 ${drink.label} 한 병만 사달라냥~`, 2.8);
          multiplayer.sendMilkRequest(target.id, drink.id);
          onShowToastRef.current?.(
            `${target.name}에게 "${drink.label} 한 병만 사달라냥~" 하고 조르는 중... 🥺`,
          );
          forceTickRef.current?.();
          return;
        }

        const npc = npcEntries.find((e) => e.state.spec.id === target.id);
        if (!npc) return;
        playerHeading = Math.atan2(
          npc.state.x - playerPos.x,
          npc.state.z - playerPos.z,
        );
        npc.state.greetReactionTimer = 2.4;
        npc.state.greetTargetHeading = Math.atan2(
          playerPos.x - npc.state.x,
          playerPos.z - npc.state.z,
        );
        setActionMode('greet');
        npc.avatar.setHeldMilk(drink.bottleColor, drink.capColor);
        audio.playMeow(1.16);
        avatar.showSpeechBubble(`🥺 ${drink.label} 한 병만 사달라냥~`, 2.8);
        onShowToastRef.current?.(
          `${npc.state.spec.name}에게 "${drink.label} 한 병만 사달라냥~" 하고 조르는 중... 🥺`,
        );

        if (npcMilkTimeoutId !== null) window.clearTimeout(npcMilkTimeoutId);
        npcMilkTimeoutId = window.setTimeout(() => {
          npcMilkTimeoutId = null;
          npc.avatar.showSpeechBubble(`🍼 여기 ${drink.label} 마셔라냥!`, 3.2);
          audio.playVendingDrop();
          onIncomingMilkOfferRef.current?.({
            fromPeerId: npc.state.spec.id,
            senderName: npc.state.spec.name,
            drink,
            isNpc: true,
          });
        }, 650);
        forceTickRef.current?.();
      };

      const isSeatArrivalAction = (
        arrival: typeof pendingArrivalAction,
      ): boolean =>
        arrival === 'footSoak' ||
        arrival === 'sitBench' ||
        arrival === 'knead' ||
        arrival === 'groom';

      const executeArrival = (
        arrival: typeof pendingArrivalAction,
        heading: number | null,
        seatPos: { x: number; z: number } | null = null,
      ) => {
        const socialTarget = pendingSocialTarget;
        const socialDrinkId = pendingSocialDrinkId;
        pendingSocialTarget = null;
        if (arrival !== 'soak' && heading !== null) playerHeading = heading;
        const shouldSnapToSeat =
          seatPos !== null && isSeatArrivalAction(arrival);
        if (shouldSnapToSeat) {
          playerPos.x = seatPos.x;
          playerPos.z = seatPos.z;
        }
        if (arrival === 'sitBench') {
          setActionMode('sitBench');
        } else if (arrival === 'footSoak') {
          setActionMode('footSoak');
        } else if (arrival === 'soak') {
          setActionMode('soak');
        } else if (arrival === 'loaf') {
          setActionMode('loaf');
        } else if (arrival === 'knead') {
          setActionMode('knead');
          onIncrementKneadCountRef.current?.();
        } else if (arrival === 'groom') {
          setActionMode('groom');
          audio.playGroomSound();
          onIncrementKneadCountRef.current?.();
        } else if (arrival === 'pickup_firewood') {
          performFirewoodPickup();
        } else if (arrival === 'stoke_firewood') {
          performFirewoodStoke();
        } else if (arrival === 'egg_ritual') {
          setActionMode(carryingFirewood ? 'carrying' : 'idle');
          performEggRitual();
        } else if (arrival === 'greet') {
          triggerGreetAction();
        } else if (arrival === 'milk_offer') {
          offerMilkToSocialTarget(socialTarget ?? undefined);
        } else if (arrival === 'milk_request') {
          requestMilkFromSocialTarget(socialDrinkId, socialTarget ?? undefined);
        } else {
          setActionMode(
            isInsideMainBath(playerPos.x, playerPos.z)
              ? 'soak'
              : carryingFirewood
                ? 'carrying'
                : 'idle',
          );
        }
        if (shouldSnapToSeat) {
          avatar.root.position.set(playerPos.x, playerPos.y, playerPos.z);
          avatar.root.rotation.y = playerHeading;
          multiplayer.sendState(getPlayerPayload(0), Date.now(), true);
        }
      };

      const getOccupiedCushionPositions = (): Vec2[] => {
        const occupied: Vec2[] = npcEntries.map((entry) => ({
          x: entry.state.x,
          z: entry.state.z,
        }));
        if (!hideRemoteCatsRef.current) {
          for (const entry of remoteEntries.values()) {
            occupied.push({ x: entry.sim.x, z: entry.sim.z });
          }
        }
        return occupied;
      };

      const triggerCushionActionInHall = (
        action: 'knead' | 'groom',
        toastMessage: string,
      ) => {
        const cushion = findNearestEmptyCushion(
          playerPos.x,
          playerPos.z,
          getOccupiedCushionPositions(),
        );
        const cushionPos = { x: cushion.x, z: cushion.z };
        if (Math.hypot(cushion.x - playerPos.x, cushion.z - playerPos.z) <= 0.32) {
          executeArrival(action, cushion.heading, cushionPos);
        } else {
          onShowToastRef.current?.(toastMessage);
          startWalkPath(cushion.x, cushion.z, {
            arrivalAction: action,
            headingOnArrival: cushion.heading,
            arrivalPos: cushionPos,
            speedMode: 'normal',
            label: null,
          });
        }
      };

      const startWalkPath = (
        destX: number,
        destZ: number,
        opts: {
          arrivalAction?: typeof pendingArrivalAction;
          headingOnArrival?: number;
          arrivalPos?: { x: number; z: number } | null;
          speedMode?: 'normal' | 'journey';
          label?: string | null;
        } = {},
      ) => {
        const dist = Math.hypot(destX - playerPos.x, destZ - playerPos.z);
        if (dist <= 0.25) {
          clearWalkJourney();
          executeArrival(
            opts.arrivalAction ?? null,
            opts.headingOnArrival ?? null,
            opts.arrivalPos ?? null,
          );
          forceTickRef.current?.();
          return;
        }

        const path = findWorldPath(
          { x: playerPos.x, z: playerPos.z },
          { x: destX, z: destZ },
        );
        walkQueue = path;
        walkSpeedMode = opts.speedMode ?? 'normal';
        pendingArrivalAction = opts.arrivalAction ?? null;
        pendingArrivalHeading = opts.headingOnArrival ?? null;
        pendingArrivalPos = opts.arrivalPos ?? null;
        setWalkingTarget(opts.label ?? null);
        const lastWp = walkQueue[walkQueue.length - 1];
        if (lastWp) {
          const markerY =
            pendingArrivalAction === 'sitBench'
              ? 0.34
              : pendingArrivalAction === 'footSoak'
                ? FOOTBATH_DECK_HEIGHT + 0.02
                : groundHeightAt(lastWp.x, lastWp.z);
          world.setDestinationMarker(lastWp.x, markerY, lastWp.z, true);
        }
        if (walkQueue.length > 0 && actionMode !== 'walk') {
          setActionMode('walk');
        }
        forceTickRef.current?.();
      };

      const moveOrSettleTo = (
        destX: number,
        destZ: number,
        arrivalAction:
          | 'soak'
          | 'sitBench'
          | 'footSoak'
          | 'pickup_firewood'
          | 'stoke_firewood'
          | 'egg_ritual'
          | 'greet'
          | 'milk_offer'
          | 'milk_request'
          | 'knead'
          | 'groom',
        headingOnArrival?: number,
        socialTarget?: MilkSocialTargetInfo,
        socialDrinkId: MilkDrinkId = 'banana',
      ) => {
        const dist = Math.hypot(destX - playerPos.x, destZ - playerPos.z);
        const immediateRadius =
          arrivalAction === 'pickup_firewood' ||
          arrivalAction === 'stoke_firewood' ||
          arrivalAction === 'egg_ritual' ||
          arrivalAction === 'greet' ||
          arrivalAction === 'milk_offer' ||
          arrivalAction === 'milk_request'
            ? 0.65
            : 0.35;
        const arrivalPos = isSeatArrivalAction(arrivalAction)
          ? { x: destX, z: destZ }
          : null;
        if (dist <= immediateRadius) {
          clearWalkJourney();
          pendingSocialTarget = socialTarget ?? null;
          pendingSocialDrinkId = socialDrinkId;
          executeArrival(arrivalAction, headingOnArrival ?? null, arrivalPos);
          forceTickRef.current?.();
          return;
        }

        startWalkPath(destX, destZ, {
          arrivalAction,
          headingOnArrival,
          arrivalPos,
          speedMode: 'normal',
          label: null,
        });
        pendingSocialTarget = socialTarget ?? null;
        pendingSocialDrinkId = socialDrinkId;
      };

      let greetNpcTimeoutId: number | null = null;

      const triggerGreetAction = () => {
        audio.unlock();
        clearWalkJourney();
        setActionMode('greet');
        audio.playMeow();

        // 3.2m 반경 내 가장 가까운 NPC 고양이 친구 탐색
        let closestNpc: (typeof npcEntries)[0] | null = null;
        let minNpcDist = 3.2;

        for (const entry of npcEntries) {
          const dist = Math.hypot(entry.state.x - playerPos.x, entry.state.z - playerPos.z);
          if (dist < minNpcDist) {
            minNpcDist = dist;
            closestNpc = entry;
          }
        }

        if (closestNpc) {
          // 플레이어와 NPC가 서로 마주보도록 정렬
          playerHeading = Math.atan2(
            closestNpc.state.x - playerPos.x,
            closestNpc.state.z - playerPos.z,
          );

          // NPC 고양이 반응 (2.4초 지속: 몸 흔들기, 귀 쫑긋, 꼬리 흔들기)
          closestNpc.state.greetReactionTimer = 2.4;
          closestNpc.state.greetTargetHeading = Math.atan2(
            playerPos.x - closestNpc.state.x,
            playerPos.z - closestNpc.state.z,
          );
          closestNpc.avatar.triggerGiftAfterglow();

          // NPC 고양이가 다정하게 대답 야옹(1.2배 피치) 소리를 냄
          if (greetNpcTimeoutId !== null) window.clearTimeout(greetNpcTimeoutId);
          greetNpcTimeoutId = window.setTimeout(() => {
            audio.playMeow(1.2);
            greetNpcTimeoutId = null;
          }, 280);

          avatar.showSpeechBubble('🐾 반갑다냥!', 2.4);
          closestNpc.avatar.showSpeechBubble('💕 야옹~ 반가워!', 2.6);
          onShowToastRef.current?.(
            `${closestNpc.state.spec.name}(이)가 코를 콩 맞대며 반갑게 인사해요! 🐾💕`,
          );
        } else {
          avatar.showSpeechBubble('🐾 반갑다냥!', 2.4);
          onShowToastRef.current?.('코를 쫑긋거리며 주변 친구들에게 반갑게 코인사해요 🐾');
        }

        forceTickRef.current?.();
      };

      const performSelfMilkDrink = (bottleColor: string, capColor: string) => {
        clearWalkJourney();
        playerHeading = cameraYaw;
        if (
          actionMode === 'greet' ||
          actionMode === 'knead' ||
          actionMode === 'groom'
        ) {
          setActionMode(isInsideMainBath(playerPos.x, playerPos.z) ? 'soak' : 'idle');
        }
        setHeldMilkState(null);
        audio.unlock();
        audio.playVendingDrop();
        avatar.triggerDrinkMilk(bottleColor, capColor);
        avatar.showSpeechBubble('🥛 꿀꺽꿀꺽~ 노곤해진다냥 💕', 3.5);
        multiplayer.sendState(getPlayerPayload(0), Date.now(), true);
        window.setTimeout(() => {
          audio.playGiftChime();
        }, 220);
        forceTickRef.current?.();
      };

      actionApiRef.current = {
        triggerGreet: () => {
          triggerGreetAction();
        },
        triggerKneadOrLoaf: () => {
          audio.unlock();
          clearWalkJourney();
          if (actionMode === 'knead') {
            setActionMode('loaf');
          } else if (actionMode === 'loaf') {
            setActionMode(carryingFirewood ? 'carrying' : 'idle');
          } else if (detectZone(playerPos.x, playerPos.z) === 'tatami_hall') {
            triggerCushionActionInHall(
              'knead',
              '가까운 빈 방석으로 총총 걸어가 앉아요 🐾',
            );
          } else {
            executeArrival('knead', null);
          }
          forceTickRef.current?.();
        },
        triggerBathSoak: () => {
          audio.unlock();
          if (
            actionMode === 'soak' ||
            (actionMode === 'groom' && isInsideMainBath(playerPos.x, playerPos.z))
          ) {
            startWalkPath(0, 12.2, {
              arrivalAction: 'idle',
              headingOnArrival: 0,
              speedMode: 'normal',
              label: null,
            });
            return;
          }
          moveOrSettleTo(
            ACTION_SPOTS.bathSoakSpot.x,
            ACTION_SPOTS.bathSoakSpot.z,
            'soak',
            cameraYaw,
          );
        },
        triggerGroom: () => {
          audio.unlock();
          clearWalkJourney();
          if (actionMode === 'groom') {
            const returnAction = isInsideMainBath(playerPos.x, playerPos.z)
              ? 'soak'
              : preGroomAction === 'sitBench' || preGroomAction === 'footSoak'
                ? preGroomAction
                : carryingFirewood
                  ? 'carrying'
                  : 'idle';
            if (returnAction === 'soak') {
              bathAutoGroomCooldown = 12.0;
            }
            setActionMode(returnAction);
          } else if (detectZone(playerPos.x, playerPos.z) === 'tatami_hall') {
            triggerCushionActionInHall(
              'groom',
              '가까운 빈 방석으로 총총 걸어가 그루밍해요 🐾',
            );
          } else {
            executeArrival('groom', null);
          }
          forceTickRef.current?.();
        },
        playVendingDrop: () => {
          audio.playVendingDrop();
        },
        holdMilk: (drink: MilkDrinkOption | null) => {
          audio.unlock();
          if (drink) {
            clearWalkJourney();
            playerHeading = cameraYaw;
            audio.playVendingDrop();
            avatar.showSpeechBubble(`🍼 ${drink.label} 뽑았다냥!`, 2.6);
          }
          setHeldMilkState(drink);
          multiplayer.sendState(getPlayerPayload(0), Date.now(), true);
          forceTickRef.current?.();
        },
        drinkHeldMilk: () => {
          const drink = heldMilkRef.current ?? MILK_DRINK_OPTIONS[0];
          performSelfMilkDrink(drink.bottleColor, drink.capColor);
        },
        drinkSelfMilk: (bottleColor: string, capColor: string) => {
          performSelfMilkDrink(bottleColor, capColor);
        },
        offerHeldMilkToTarget: (explicitTarget?: MilkSocialTargetInfo) => {
          offerMilkToSocialTarget(explicitTarget);
        },
        respondMilkOffer: (
          fromPeerId: string,
          drinkId: MilkDrinkId,
          accepted: boolean,
          isNpc?: boolean,
        ) => {
          const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
          audio.unlock();
          if (isNpc) {
            for (const entry of npcEntries) {
              entry.avatar.setHeldMilk(null);
            }
          } else {
            multiplayer.sendMilkRespond(fromPeerId, drink.id, accepted);
          }
          if (accepted) {
            performSelfMilkDrink(drink.bottleColor, drink.capColor);
          } else {
            audio.playMeow(1.1);
            avatar.showSpeechBubble('😿 배가 볼록하다냥... 마음만 받을게!', 3.0);
            onShowToastRef.current?.(MILK_SOCIAL_MESSAGES.declineReceiverToast);
            forceTickRef.current?.();
          }
        },
        requestMilkFromTarget: (
          drinkId: MilkDrinkId = 'banana',
          explicitTarget?: MilkSocialTargetInfo,
        ) => {
          requestMilkFromSocialTarget(drinkId, explicitTarget);
        },
        respondMilkRequest: (
          toPeerId: string,
          drinkId: MilkDrinkId,
          accepted: boolean,
        ) => {
          const drink = getMilkDrinkById(drinkId) ?? MILK_DRINK_OPTIONS[0];
          audio.unlock();
          if (accepted) {
            audio.playVendingDrop();
            avatar.triggerGiftAfterglow();
            multiplayer.sendMilkOffer(toPeerId, drink.id);
            onShowToastRef.current?.(
              `${drink.label}를 자판기에서 뽑아 조르는 친구에게 건넸어요! 🍼✨`,
            );
          } else {
            audio.playMeow(0.95);
            multiplayer.sendMilkRequestDecline(toPeerId, drink.id);
            onShowToastRef.current?.(
              '도토리뿐이라 다음에 사주겠다고 전했어요 🌰🐾',
            );
          }
          forceTickRef.current?.();
        },
        giftMilkToNearestNpc: (drinkLabel: string) => {
          const drink =
            MILK_DRINK_OPTIONS.find((d) => d.label === drinkLabel) ??
            MILK_DRINK_OPTIONS[0];
          const visibleRemotes = hideRemoteCatsRef.current
            ? []
            : Array.from(remoteEntries.values()).map((entry) => ({
                id: entry.sim.id,
                x: entry.sim.x,
                z: entry.sim.z,
              }));
          const npcCandidates = npcEntries.map((entry) => ({
            id: entry.state.spec.id,
            x: entry.state.x,
            z: entry.state.z,
          }));
          const winner = findNearestMilkRecipient(
            playerPos.x,
            playerPos.z,
            npcCandidates,
            visibleRemotes,
            60,
          );
          if (!winner) return null;

          if (winner.kind === 'remote') {
            const target = remoteEntries.get(winner.id);
            if (!target) return null;
            target.avatar.triggerDrinkMilk(drink.bottleColor, drink.capColor);
            audio.playGiftChime();
            multiplayer.sendMilkGift(winner.id);
            forceTickRef.current?.();
            return '함께 온 고양이 친구';
          }

          const npc = npcEntries.find((e) => e.state.spec.id === winner.id);
          if (!npc) return null;
          npc.avatar.triggerDrinkMilk(drink.bottleColor, drink.capColor);
          audio.playGiftChime();
          forceTickRef.current?.();
          return npc.state.spec.name;
        },
        toggleWalkTrain: () => {
          audio.unlock();
          const next = !trainActiveRef.current;
          trainActiveRef.current = next;
          container.dataset.train = next ? '1' : '0';
          if (next && actionMode === 'soak') {
            startWalkPath(0, 12.2, {
              arrivalAction: 'idle',
              headingOnArrival: 0,
              speedMode: 'normal',
              label: null,
            });
          }
          if (next) {
            audio.playMeow();
          }
          onTrainActiveChangeRef.current?.(next);
          forceTickRef.current?.();
        },
        walkToZone: (zoneId: WorldZoneId) => {
          const spot = TELEPORT_SPOTS.find((s) => s.zoneId === zoneId);
          if (!spot) return;
          audio.unlock();
          pressedKeys.clear();
          userCameraOverrideTimer = 0;

          let targetX = spot.x;
          let targetZ = spot.z;
          let targetHeading = spot.heading;
          if (zoneId === 'foot_stream') {
            const seat = pickEmptySeatSpot(FOOTBATH_SEAT_SPOTS, 2, findNearestEmptyFootbathSeat);
            targetX = seat.x;
            targetZ = seat.z;
            targetHeading = seat.heading;
          }

          const arrivalAction =
            spot.mode === 'idle' && carryingFirewood ? null : spot.mode;
          const arrivalPos = isSeatArrivalAction(spot.mode)
            ? { x: targetX, z: targetZ }
            : null;
          const dist = Math.hypot(targetX - playerPos.x, targetZ - playerPos.z);
          if (dist <= 0.35) {
            clearWalkJourney();
            executeArrival(arrivalAction, targetHeading, arrivalPos);
            forceTickRef.current?.();
            return;
          }
          startWalkPath(targetX, targetZ, {
            arrivalAction: spot.mode,
            headingOnArrival: targetHeading,
            arrivalPos,
            speedMode: 'journey',
            label: spot.label,
          });
        },
        stopAutoWalk,
        capturePolaroid: () => {
          audio.playCameraShutter();
          // Render synchronously right before reading pixels so GPU/Software buffers are never blank
          renderer.render(scene, camera);
          const srcCanvas = renderer.domElement;
          const sw = srcCanvas.width || 1200;
          const sh = srcCanvas.height || 800;

          // Crop central 4:3 frame onto a warm Polaroid card
          const cropW = Math.min(sw, Math.round(sh * 1.25));
          const cropH = Math.min(sh, Math.round(cropW * 0.8));
          const sx = Math.max(0, Math.round((sw - cropW) / 2));
          const sy = Math.max(0, Math.round((sh - cropH) / 2));

          const pad = 28;
          const bottomPad = 104;
          const outW = 720;
          const photoW = outW - pad * 2;
          const photoH = Math.round(photoW * 0.78);
          const outH = pad + photoH + bottomPad;

          const card = document.createElement('canvas');
          card.width = outW;
          card.height = outH;
          const ctx = card.getContext('2d');
          if (!ctx) return null;

          // Warm cream Polaroid paper
          ctx.fillStyle = '#faf6ee';
          ctx.fillRect(0, 0, outW, outH);
          ctx.strokeStyle = '#e4dccb';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, outW - 2, outH - 2);

          // Draw captured 3D viewport
          ctx.drawImage(srcCanvas, sx, sy, cropW, cropH, pad, pad, photoW, photoH);

          // Subtle inner photo border
          ctx.strokeStyle = 'rgba(44, 37, 29, 0.14)';
          ctx.lineWidth = 1;
          ctx.strokeRect(pad, pad, photoW, photoH);

          // Caption text
          const coatName = getCatCoatById(coatRef.current).name;
          const modeCaption =
            actionMode === 'soak'
              ? '노천 편백탕 유자 입욕'
              : actionMode === 'footSoak'
                ? '편백 족욕 데크 물장구 쉼터'
                : actionMode === 'groom' && isInsideMainBath(playerPos.x, playerPos.z)
                  ? '노천 편백탕 그루밍'
                  : actionMode === 'groom'
                    ? '포근한 고양이 그루밍'
                    : actionMode === 'sitBench'
                      ? '오목눈이와 원목 평상 휴식'
                      : '묘유원의 따뜻한 한때';
          const d = new Date();
          const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

          ctx.fillStyle = '#3a3026';
          ctx.font = '600 22px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          ctx.fillText(`묘유원(猫湯院) · ${modeCaption}`, pad + 4, pad + photoH + 44);

          ctx.fillStyle = '#786a5a';
          ctx.font = '500 15px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          ctx.fillText(`${coatName}  |  ${dateStr}`, pad + 4, pad + photoH + 74);

          const hostLabel =
            typeof window !== 'undefined' && window.location?.host
              ? window.location.host
              : 'myoyuwon-cat-onsen.onrender.com';
          ctx.save();
          ctx.textAlign = 'right';
          ctx.fillStyle = '#9a8c7a';
          ctx.font = '500 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
          ctx.fillText(hostLabel, outW - pad - 4, pad + photoH + 74);
          ctx.restore();

          return card.toDataURL('image/png');
        },
        standUp: () => {
          audio.unlock();
          clearWalkJourney();
          setActionMode(carryingFirewood ? 'carrying' : 'idle');
          forceTickRef.current?.();
        },
        triggerInteraction: (kind: NearbyInteractKind) => {
          audio.unlock();
          executeInteractType(kind);
        },
        broadcastWish: (wish: WishYuzuItem) => {
          multiplayer.sendWishAdd(wish);
        },
      };

      function pickEmptySeatSpot<T extends { x: number; z: number; heading: number }>(
        spots: readonly T[],
        requestedIndex: number | undefined,
        fallbackFinder: (x: number, z: number, occupied: readonly Vec2[]) => T,
        hitPoint?: THREE.Vector3,
      ): T {
        const occupied = getOccupiedCushionPositions();
        const clickedSpot =
          requestedIndex !== undefined ? spots[requestedIndex] : undefined;
        const clickedOccupied =
          clickedSpot !== undefined &&
          occupied.some(
            (occ) => Math.hypot(clickedSpot.x - occ.x, clickedSpot.z - occ.z) <= 0.75,
          );
        if (clickedSpot && !clickedOccupied) {
          return clickedSpot;
        }
        return fallbackFinder(
          hitPoint?.x ?? playerPos.x,
          hitPoint?.z ?? playerPos.z,
          occupied,
        );
      }

      function executeInteractType(
        kind: string | undefined,
        hitPoint?: THREE.Vector3,
        wishId?: string,
        cushionIndex?: number,
        footbathIndex?: number,
      ): boolean {
        if (kind === 'wish_yuzu' && wishId) {
          onSelectWishYuzuRef.current?.(wishId);
          return true;
        }
        if (kind === 'yuzu_pond') {
          onOpenWishComposerRef.current?.();
          return true;
        }
        if (kind === 'shishi_odoshi') {
          world.triggerShishiOdoshi();
          audio.playShishiOdoshi();
          multiplayer.sendBambooRing();
          forceTickRef.current?.();
          return true;
        }
        if (kind === 'milk_vending') {
          onOpenMilkVendingRef.current?.();
          const distToVending = Math.hypot(
            playerPos.x - ACTION_SPOTS.milkVendingSpot.x,
            playerPos.z - ACTION_SPOTS.milkVendingSpot.z,
          );
          if (distToVending > 3.8) {
            startWalkPath(
              ACTION_SPOTS.milkVendingSpot.x,
              ACTION_SPOTS.milkVendingSpot.z,
              {
                arrivalAction: 'idle',
                headingOnArrival: ACTION_SPOTS.milkVendingSpot.heading,
                speedMode: 'normal',
                label: null,
              },
            );
          }
          return true;
        }
        if (kind === 'milk_bench') {
          moveOrSettleTo(
            ACTION_SPOTS.benchSitSpot.x,
            ACTION_SPOTS.benchSitSpot.z,
            'sitBench',
            ACTION_SPOTS.benchSitSpot.heading,
          );
          return true;
        }
        if (kind === 'firewood_pile') {
          moveOrSettleTo(
            ACTION_SPOTS.firewoodPickupSpot.x,
            ACTION_SPOTS.firewoodPickupSpot.z,
            'pickup_firewood',
            ACTION_SPOTS.firewoodPickupSpot.heading,
          );
          return true;
        }
        if (kind === 'firewood_furnace') {
          if (!carryingFirewood) {
            onShowToastRef.current?.(
              '먼저 왼쪽 장작 더미를 클릭해 장작 1개비를 들어주세요.',
            );
            return true;
          }
          moveOrSettleTo(
            ACTION_SPOTS.firewoodFurnaceSpot.x,
            ACTION_SPOTS.firewoodFurnaceSpot.z,
            'stoke_firewood',
            ACTION_SPOTS.firewoodFurnaceSpot.heading,
          );
          return true;
        }
        if (kind === 'egg_basket') {
          moveOrSettleTo(
            ACTION_SPOTS.eggBasketSpot.x,
            ACTION_SPOTS.eggBasketSpot.z,
            'egg_ritual',
            ACTION_SPOTS.eggBasketSpot.heading,
          );
          return true;
        }
        if (kind === 'tatami_cushion') {
          const targetSpot = pickEmptySeatSpot(
            MYOYEONGAK_CUSHION_SPOTS,
            cushionIndex,
            findNearestEmptyCushion,
            hitPoint,
          );
          moveOrSettleTo(targetSpot.x, targetSpot.z, 'knead', targetSpot.heading);
          return true;
        }
        if (kind === 'footbath_seat') {
          const targetSeat = pickEmptySeatSpot(
            FOOTBATH_SEAT_SPOTS,
            footbathIndex,
            findNearestEmptyFootbathSeat,
            hitPoint,
          );
          moveOrSettleTo(targetSeat.x, targetSeat.z, 'footSoak', targetSeat.heading);
          return true;
        }
        if (kind === 'main_bath' && hitPoint) {
          moveOrSettleTo(hitPoint.x, hitPoint.z, 'soak', cameraYaw);
          return true;
        }
        return false;
      }

      const getVisibleRemoteRoots = (): THREE.Object3D[] =>
        hideRemoteCatsRef.current
          ? []
          : Array.from(remoteEntries.values(), (entry) => entry.avatar.root);

      const walkToAndInteractWithCat = (
        catX: number,
        catZ: number,
        socialTarget?: MilkSocialTargetInfo,
      ) => {
        const dist = Math.hypot(catX - playerPos.x, catZ - playerPos.z);
        const desiredAction: 'milk_offer' | 'milk_request' | 'greet' =
          heldMilkRef.current && socialTarget
            ? 'milk_offer'
            : isNearMilkVending(playerPos.x, playerPos.z) && socialTarget
              ? 'milk_request'
              : 'greet';

        if (dist <= 3.2) {
          if (desiredAction === 'milk_offer') {
            offerMilkToSocialTarget(socialTarget);
          } else if (desiredAction === 'milk_request') {
            requestMilkFromSocialTarget('banana', socialTarget);
          } else {
            triggerGreetAction();
          }
          return;
        }

        const angle = Math.atan2(playerPos.x - catX, playerPos.z - catZ);
        const stopX = catX + Math.sin(angle) * 1.35;
        const stopZ = catZ + Math.cos(angle) * 1.35;
        moveOrSettleTo(
          stopX,
          stopZ,
          desiredAction,
          Math.atan2(catX - stopX, catZ - stopZ),
          socialTarget,
        );
      };

      const updateHoverRaycast = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const interactHits = raycaster.intersectObjects(world.interactables, false);
        const npcHits = raycaster.intersectObjects(npcRoots, true);
        const remoteHits = raycaster.intersectObjects(getVisibleRemoteRoots(), true);
        const isHoverCat = npcHits.length > 0 || remoteHits.length > 0;
        hoveredInteractType =
          (interactHits[0]?.object.userData?.interactType as string | undefined) ??
          (isHoverCat ? 'npc_cat' : null);
        canvas.style.cursor = hoveredInteractType ? 'pointer' : 'grab';
      };

      const onKeyDown = (e: KeyboardEvent) => {
        audio.unlock();

        // Ignore shortcuts when typing inside wish input modal
        const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          if (e.code === 'Escape') {
            (document.activeElement as HTMLElement).blur();
          }
          return;
        }

        pressedKeys.add(e.code);

        if (
          e.code === 'KeyW' ||
          e.code === 'KeyA' ||
          e.code === 'KeyS' ||
          e.code === 'KeyD' ||
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight'
        ) {
          clearWalkJourney();
          if (
            actionMode === 'knead' ||
            actionMode === 'loaf' ||
            actionMode === 'greet' ||
            actionMode === 'groom' ||
            actionMode === 'sitBench' ||
            actionMode === 'footSoak'
          ) {
            setActionMode('walk');
          }
        } else if (e.code === 'KeyG') {
          actionApiRef.current?.triggerGreet();
        } else if (e.code === 'KeyB') {
          actionApiRef.current?.triggerKneadOrLoaf();
        } else if (e.code === 'KeyE') {
          actionApiRef.current?.triggerBathSoak();
        } else if (e.code === 'KeyR') {
          actionApiRef.current?.triggerGroom();
        } else if (e.code === 'KeyF') {
          const promptNow =
            currentNearbyPrompt ??
            findNearbyInteractPrompt(playerPos.x, playerPos.z, carryingFirewood, actionMode);
          if (promptNow) {
            executeInteractType(promptNow.kind);
          }
        } else if (e.code === 'KeyT') {
          actionApiRef.current?.toggleWalkTrain();
        } else if (e.code === 'Escape') {
          if (walkQueue.length > 0 || walkingTargetLabel !== null) {
            stopAutoWalk();
          } else {
            actionApiRef.current?.standUp();
          }
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        pressedKeys.delete(e.code);
      };

      const onPointerDown = (e: PointerEvent) => {
        audio.unlock();
        isDragging = true;
        dragDistance = 0;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        lastPointerType = e.pointerType; // 'touch' | 'mouse' | 'pen'
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) {
          if (e.target === canvas) {
            updateHoverRaycast(e.clientX, e.clientY);
          } else if (hoveredInteractType !== null) {
            hoveredInteractType = null;
            canvas.style.cursor = 'grab';
          }
          return;
        }
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        dragDistance += Math.hypot(dx, dy);
        if (dragDistance > 3) {
          userCameraOverrideTimer = 2.8;
          hoveredInteractType = null;
          canvas.style.cursor = 'grabbing';
        }

        const sensMultiplier = lastPointerType === 'touch'
          ? CAMERA_DEFAULTS.mobileSensitivityMultiplier
          : 1.0;
        const effectiveSens = CAMERA_DEFAULTS.yawSensitivity * sensMultiplier;
        cameraYaw -= dx * effectiveSens;
        cameraPitch = Math.max(
          CAMERA_DEFAULTS.minPitch,
          Math.min(
            CAMERA_DEFAULTS.maxPitch,
            cameraPitch +
              dy *
                effectiveSens *
                CAMERA_DEFAULTS.pitchSensitivityRatio,
          ),
        );
      };

      const onPointerLeave = () => {
        if (!isDragging) {
          hoveredInteractType = null;
          canvas.style.cursor = 'grab';
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = hoveredInteractType ? 'pointer' : 'grab';

        if (dragDistance < 6) {
          const rect = canvas.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);

          // 1. Check landmark & wish yuzu interactables first
          const interactHits = raycaster.intersectObjects(world.interactables, false);
          if (interactHits.length > 0) {
            const hitObj = interactHits[0].object;
            const kind = hitObj.userData?.interactType as string | undefined;
            const wishId = hitObj.userData?.wishId ? String(hitObj.userData.wishId) : undefined;
            const cushionIndex =
              typeof hitObj.userData?.cushionIndex === 'number'
                ? hitObj.userData.cushionIndex
                : undefined;
            const footbathIndex =
              typeof hitObj.userData?.footbathIndex === 'number'
                ? hitObj.userData.footbathIndex
                : undefined;
            if (
              executeInteractType(
                kind,
                interactHits[0].point,
                wishId,
                cushionIndex,
                footbathIndex,
              )
            ) {
              return;
            }
          }

          // 1b. Check direct click on Remote Peer Cats -> offer held milk / request at vending / greet!
          const remoteRoots = getVisibleRemoteRoots();
          if (remoteRoots.length > 0) {
            const remoteHits = raycaster.intersectObjects(remoteRoots, true);
            if (remoteHits.length > 0) {
              let hitObj: THREE.Object3D | null = remoteHits[0].object;
              let targetRemoteId: string | undefined;
              while (hitObj && !targetRemoteId) {
                if (hitObj.userData?.remoteId) {
                  targetRemoteId = hitObj.userData.remoteId as string;
                }
                hitObj = hitObj.parent;
              }
              const hitRemote = targetRemoteId ? remoteEntries.get(targetRemoteId) : undefined;
              if (hitRemote) {
                walkToAndInteractWithCat(hitRemote.sim.x, hitRemote.sim.z, {
                  kind: 'remote',
                  id: hitRemote.sim.id,
                  name: formatRemoteCatName(hitRemote.sim.coatId),
                });
                return;
              }
            }
          }

          // 1c. Check direct click on NPC Cat Friends -> offer held milk / request / 코인사!
          const npcHits = raycaster.intersectObjects(npcRoots, true);
          if (npcHits.length > 0) {
            let hitObj: THREE.Object3D | null = npcHits[0].object;
            let targetNpcId: string | undefined;
            while (hitObj && !targetNpcId) {
              if (hitObj.userData?.npcId) {
                targetNpcId = hitObj.userData.npcId as string;
              }
              hitObj = hitObj.parent;
            }
            const hitNpc = npcEntries.find((e) => e.state.spec.id === targetNpcId);
            if (hitNpc) {
              walkToAndInteractWithCat(hitNpc.state.x, hitNpc.state.z, {
                kind: 'npc',
                id: hitNpc.state.spec.id,
                name: hitNpc.state.spec.name,
              });
              return;
            }
          }

          // 2. Otherwise pathfind & walk to clicked ground/bridge/deck point
          const hits = raycaster.intersectObjects(world.walkableMeshes, false);
          if (hits.length > 0) {
            const hit = hits[0].point;
            startWalkPath(hit.x, hit.z, { speedMode: 'normal', label: null });
          }
        }
      };

      const onPointerCancel = () => {
        isDragging = false;
        canvas.style.cursor = hoveredInteractType ? 'pointer' : 'grab';
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        userCameraOverrideTimer = 2.8;
        cameraDistance = Math.max(
          CAMERA_DEFAULTS.minDistance,
          Math.min(CAMERA_DEFAULTS.maxDistance, cameraDistance + e.deltaY * 0.0025),
        );
      };

      const onResize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, pixelRatioCap),
        );
        renderer.setSize(w, h);
        renderer.render(scene, camera);
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', onResize);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerleave', onPointerLeave);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      let frameId = 0;
      let rafId = 0;
      let disposed = false;
      let lastTime = performance.now();
      let elapsed = 0;
      let frameCount = 0;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        if (!sync) {
          frameId = window.setTimeout(() => {
            if (!disposed) rafId = requestAnimationFrame(cb);
          }, 35);
          return;
        }
        const poll = () => {
          if (disposed) {
            gl.deleteSync(sync);
            return;
          }
          const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            gl.deleteSync(sync);
            frameId = window.setTimeout(() => {
              if (!disposed) rafId = requestAnimationFrame(cb);
            }, 35);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      const tick = (scheduleNext = true) => {
        if (disposed || contextLost) return;

        const now = performance.now();
        const wallDt = Math.max(0.001, (now - lastTime) / 1000);
        const dt = Math.min(0.08, wallDt);
        const lightDt = Math.min(0.5, wallDt);
        lastTime = now;
        elapsed += dt;
        actionTime += dt;
        if (userCameraOverrideTimer > 0) {
          userCameraOverrideTimer = Math.max(0, userCameraOverrideTimer - dt);
        }

        // 1. Movement & State Machine
        const forwardAxis =
          (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp') ? 1 : 0) -
          (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown') ? 1 : 0);
        const rightAxis =
          (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight') ? 1 : 0) -
          (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft') ? 1 : 0);

        let moveDirX = 0;
        let moveDirZ = 0;
        let moveSpeed = 0;

        const keyMove = computeWorldMoveFromInput(forwardAxis, rightAxis, cameraYaw);
        if (keyMove) {
          if (walkQueue.length > 0 || walkingTargetLabel !== null) {
            clearWalkJourney();
          }
          moveDirX = keyMove.dx;
          moveDirZ = keyMove.dz;
          moveSpeed = 1.65;
          playerHeading = shortestAngleLerp(
            playerHeading,
            keyMove.heading,
            exponentialDampingAlpha(dt, 14),
          );
          if (actionMode !== 'walk') {
            setActionMode('walk');
          }
        } else if (walkQueue.length > 0) {
          while (
            walkQueue.length > 1 &&
            Math.hypot(walkQueue[0].x - playerPos.x, walkQueue[0].z - playerPos.z) <=
              0.35
          ) {
            walkQueue.shift();
          }

          const target = walkQueue[0];
          const dx = target.x - playerPos.x;
          const dz = target.z - playerPos.z;
          const dist = Math.hypot(dx, dz);

          if (walkQueue.length === 1 && dist <= 0.25) {
            const arrival = pendingArrivalAction;
            const arrivalHeading = pendingArrivalHeading;
            const arrivalPos = pendingArrivalPos;
            clearWalkJourney();
            executeArrival(arrival, arrivalHeading, arrivalPos);
          } else {
            moveDirX = dx / (dist || 1);
            moveDirZ = dz / (dist || 1);
            const cruiseSpeed = walkSpeedMode === 'journey' ? 2.25 : 1.65;
            moveSpeed =
              walkQueue.length === 1 && dist < 0.7
                ? Math.min(cruiseSpeed, Math.max(0.85, dist * 3.5))
                : cruiseSpeed;
            const targetHeading = Math.atan2(moveDirX, moveDirZ);
            playerHeading = shortestAngleLerp(
              playerHeading,
              targetHeading,
              exponentialDampingAlpha(dt, 14),
            );
            if (actionMode !== 'walk') {
              setActionMode('walk');
            }
            if (walkSpeedMode === 'journey' && userCameraOverrideTimer <= 0) {
              const desiredYaw = playerHeading + Math.PI;
              cameraYaw = shortestAngleLerp(
                cameraYaw,
                desiredYaw,
                exponentialDampingAlpha(dt, 2.2),
              );
            }
          }
        } else {
          // Timed ritual state transitions
          if (actionMode === 'greet' && actionTime >= GREET_DURATION) {
            setActionMode(carryingFirewood ? 'carrying' : 'idle');
          } else if (actionMode === 'groom' && actionTime >= GROOM_DURATION) {
            const returnAction = isInsideMainBath(playerPos.x, playerPos.z)
              ? 'soak'
              : preGroomAction === 'sitBench' || preGroomAction === 'footSoak'
                ? preGroomAction
                : carryingFirewood
                  ? 'carrying'
                  : 'idle';
            if (returnAction === 'soak') {
              bathAutoGroomCooldown = 12.0;
            }
            setActionMode(returnAction);
          } else if (actionMode === 'soak') {
            bathAutoGroomCooldown -= wallDt;
            if (bathAutoGroomCooldown <= 0) {
              bathAutoGroomCooldown = 12.0;
              setActionMode('groom');
              audio.playGroomSound();
              onIncrementKneadCountRef.current?.();
            }
          } else if (actionMode === 'knead' && actionTime >= KNEAD_LOOP_DURATION) {
            setActionMode('loaf');
          } else if (actionMode === 'walk') {
            setActionMode(
              isInsideMainBath(playerPos.x, playerPos.z)
                ? 'soak'
                : carryingFirewood
                  ? 'carrying'
                  : 'idle',
            );
          }
        }

        if (moveSpeed > 0.01) {
          const nextX = playerPos.x + moveDirX * moveSpeed * dt;
          const nextZ = playerPos.z + moveDirZ * moveSpeed * dt;
          const resolved = resolvePlayerCollisions(nextX, nextZ);
          playerPos.x = resolved.x;
          playerPos.z = resolved.z;

          footstepTimer -= dt;
          if (footstepTimer <= 0) {
            footstepTimer = walkSpeedMode === 'journey' ? 0.38 : 0.45;
            audio.playFootstep(detectFootstepSurface(playerPos.x, playerPos.z));
          }
        } else {
          footstepTimer = 0.08;
        }

        // Smoothly face camera when resting inside the bath so cat's face stays clearly visible
        if (
          actionMode === 'soak' ||
          (actionMode === 'groom' && isInsideMainBath(playerPos.x, playerPos.z))
        ) {
          playerHeading = shortestAngleLerp(
            playerHeading,
            cameraYaw,
            exponentialDampingAlpha(dt, 9),
          );
        }

        // Soak timer -> pop yellow yuzu onto head towel after SOAK_YUZU_DELAY
        if (isInsideMainBath(playerPos.x, playerPos.z)) {
          soakTime += wallDt;
          if (!hasHeadYuzu && soakTime >= SOAK_YUZU_DELAY) {
            hasHeadYuzu = true;
            container.dataset.headYuzu = '1';
          }
        } else if (actionMode !== 'soak' && (soakTime > 0 || hasHeadYuzu)) {
          soakTime = 0;
          hasHeadYuzu = false;
          container.dataset.headYuzu = '0';
        }

        // Smooth ground/stair/bench/deck/basin Y damping
        const targetGroundY =
          actionMode === 'sitBench'
            ? 0.34
            : actionMode === 'footSoak'
              ? FOOTBATH_DECK_HEIGHT + 0.025
              : groundHeightAt(playerPos.x, playerPos.z);
        playerPos.y = THREE.MathUtils.damp(playerPos.y, targetGroundY, 12, dt);

        avatar.root.position.set(playerPos.x, playerPos.y, playerPos.z);
        avatar.root.rotation.y = playerHeading;

        const playerBathTowel =
          !carryingFirewood &&
          (actionMode === 'soak' || isInsideMainBath(playerPos.x, playerPos.z));
        avatar.update(
          dt,
          moveSpeed,
          actionMode,
          actionTime,
          hasHeadYuzu,
          playerBathTowel,
          carryingFirewood,
        );

        // Step 7 NPC cats (soaking/loafing or calm companion stroll behind player)
        stepNpcCats(
          npcStates,
          { x: playerPos.x, z: playerPos.z, heading: playerHeading },
          trainActiveRef.current,
          dt,
          groundHeightAt,
          { maxFollowers: DEFAULT_MAX_TRAIN_FOLLOWERS },
          elapsed,
        );
        for (let i = 0; i < npcEntries.length; i++) {
          const entry = npcEntries[i];
          const s = entry.state;
          entry.avatar.root.position.set(s.x, s.y, s.z);
          entry.avatar.root.rotation.y = s.heading;
          const showRestingProps =
            s.actionMode === 'soak' ||
            s.actionMode === 'loaf' ||
            s.actionMode === 'greet' ||
            s.actionMode === 'groom';
          entry.avatar.update(
            dt,
            s.moveSpeed,
            s.actionMode,
            elapsed + i * 0.85,
            showRestingProps && s.spec.hasYuzu,
            showRestingProps && s.spec.hasTowel,
          );
        }

        // Step connected multiplayer cat avatars & sync own state (~10Hz throttled)
        const nowEpoch = Date.now();
        if (remoteEntries.size > 0) {
          const staleIds = collectStaleRemoteIds(
            Array.from(remoteEntries.values(), (entry) => entry.sim),
            nowEpoch,
            REMOTE_PEER_STALE_MS * 2,
          );
          for (const staleId of staleIds) {
            removeRemoteEntry(staleId);
          }
          for (const entry of remoteEntries.values()) {
            const renderedSpeed = stepRemoteCatSim(entry.sim, dt);
            const remoteMilk = getMilkDrinkById(entry.sim.heldMilkId);
            entry.avatar.setHeldMilk(
              remoteMilk ? remoteMilk.bottleColor : null,
              remoteMilk?.capColor,
            );
            entry.avatar.root.visible = !hideRemoteCatsRef.current;
            entry.avatar.root.position.set(entry.sim.x, entry.sim.y, entry.sim.z);
            entry.avatar.root.rotation.y = entry.sim.heading;
            entry.avatar.update(
              dt,
              renderedSpeed,
              entry.sim.actionMode,
              entry.sim.actionTime,
              entry.sim.hasHeadYuzu,
              undefined,
              entry.sim.carryingFirewood,
            );
          }
        }
        multiplayer.sendState(getPlayerPayload(moveSpeed), nowEpoch);

        const zoneNow = detectZone(playerPos.x, playerPos.z);
        if (container.dataset.zone !== zoneNow) {
          container.dataset.zone = zoneNow;
          onZoneChangeRef.current?.(zoneNow);
        }

        const nextNearby = findNearbyInteractPrompt(
          playerPos.x,
          playerPos.z,
          carryingFirewood,
          actionMode,
        );
        const nextNearbyKey = nextNearby ? `${nextNearby.kind}:${nextNearby.label}` : '';
        if (nextNearbyKey !== lastNearbyPromptKey) {
          lastNearbyPromptKey = nextNearbyKey;
          currentNearbyPrompt = nextNearby;
          container.dataset.nearby = nextNearby?.kind ?? '';
          onNearbyInteractChangeRef.current?.(nextNearby);
        }

        const findClosestSocialCat = (maxRange: number): MilkSocialTargetInfo | null => {
          const maxSq = maxRange * maxRange;
          let bestRemote: { info: MilkSocialTargetInfo; d2: number } | null = null;
          if (!hideRemoteCatsRef.current) {
            for (const entry of remoteEntries.values()) {
              const dx = entry.sim.x - playerPos.x;
              const dz = entry.sim.z - playerPos.z;
              const d2 = dx * dx + dz * dz;
              if (d2 <= maxSq && (!bestRemote || d2 < bestRemote.d2)) {
                bestRemote = {
                  info: {
                    kind: 'remote',
                    id: entry.sim.id,
                    name: formatRemoteCatName(entry.sim.coatId),
                  },
                  d2,
                };
              }
            }
          }
          if (bestRemote) return bestRemote.info;

          let bestNpc: { info: MilkSocialTargetInfo; d2: number } | null = null;
          for (const entry of npcEntries) {
            const dx = entry.state.x - playerPos.x;
            const dz = entry.state.z - playerPos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= maxSq && (!bestNpc || d2 < bestNpc.d2)) {
              bestNpc = {
                info: {
                  kind: 'npc',
                  id: entry.state.spec.id,
                  name: entry.state.spec.name,
                },
                d2,
              };
            }
          }
          return bestNpc?.info ?? null;
        };

        const nextGiveTarget = findClosestSocialCat(4.8);
        const nextVendingTarget = isNearMilkVending(playerPos.x, playerPos.z)
          ? findClosestSocialCat(8.5)
          : null;
        const nextSocialKey = `${nextGiveTarget?.kind ?? ''}:${nextGiveTarget?.id ?? ''}:${nextGiveTarget?.name ?? ''}|${nextVendingTarget?.kind ?? ''}:${nextVendingTarget?.id ?? ''}:${nextVendingTarget?.name ?? ''}`;
        if (nextSocialKey !== lastSocialTargetsKey) {
          lastSocialTargetsKey = nextSocialKey;
          lastNearbyGiveTarget = nextGiveTarget;
          lastNearbyVendingTarget = nextVendingTarget;
          onSocialTargetsChangeRef.current?.({
            nearbyGiveTarget: nextGiveTarget,
            nearbyVendingTarget: nextVendingTarget,
          });
        }

        // Update spatial audio levels (water + cedar/bamboo/waterwheel + purr proximity + indoor attenuation)
        audio.setIndoorAttenuation(zoneNow === 'tatami_hall');
        audio.updateSpatialVolumes(
          computeWaterGain(playerPos.x, playerPos.z),
          computePurrProximity(playerPos.x, playerPos.z, actionMode),
          computeForestWindGain(playerPos.x, playerPos.z),
          computeHearthFireGain(playerPos.x, playerPos.z, syncedServerFireCount),
        );

        // 2. Smooth Day/Night lighting & fog transition
        const targetNight = timeOfDayRef.current === 'night' ? 1 : 0;
        nightBlend = THREE.MathUtils.damp(nightBlend, targetNight, 6.0, lightDt);

        hemiLight.color.copy(DAY_HEMI_SKY).lerp(NIGHT_HEMI_SKY, nightBlend);
        hemiLight.groundColor.copy(DAY_HEMI_GROUND).lerp(NIGHT_HEMI_GROUND, nightBlend);
        hemiLight.intensity = THREE.MathUtils.lerp(0.82, 0.58, nightBlend);

        ambientLight.color.copy(DAY_AMBIENT).lerp(NIGHT_AMBIENT, nightBlend);
        ambientLight.intensity = THREE.MathUtils.lerp(0.16, 0.4, nightBlend);

        sunLight.color.copy(DAY_DIR).lerp(NIGHT_DIR, nightBlend);
        sunLight.intensity = THREE.MathUtils.lerp(2.15, 0.5, nightBlend);

        fog.color.copy(DAY_FOG).lerp(NIGHT_FOG, nightBlend);
        fog.near = THREE.MathUtils.lerp(65, 55, nightBlend);
        fog.far = THREE.MathUtils.lerp(185, 165, nightBlend);
        if (scene.background instanceof THREE.Color) {
          scene.background.copy(fog.color);
        }

        for (const nl of world.nightLights) {
          const lightVisible = nightBlend > 0.01;
          nl.light.visible = lightVisible;
          if (lightVisible) {
            const flicker = 0.94 + 0.06 * Math.sin(elapsed * 4.2 + nl.baseIntensity);
            nl.light.intensity = nl.baseIntensity * nightBlend * flicker;
          }
        }
        for (const lm of world.lanternGlowMaterials) {
          lm.emissiveIntensity = THREE.MathUtils.lerp(0.22, 1.35, nightBlend);
        }

        // 3. World animations + bird companion on bench + interaction guide cues
        world.update(dt, elapsed, nightBlend, actionMode === 'sitBench', {
          hoveredKind: hoveredInteractType,
          nearbyKind: currentNearbyPrompt?.kind ?? null,
          carryingFirewood,
          footSoakSpot:
            actionMode === 'footSoak'
              ? { x: playerPos.x, z: playerPos.z, heading: playerHeading }
              : null,
        });

        // 4. Diorama camera with exponential damping (1 - exp(-dt * 6.5))
        const rig = computeCameraRig(
          camera.aspect,
          cameraDistance,
          cameraYaw,
          cameraPitch,
          playerPos,
        );
        if (Math.abs(camera.fov - rig.fov) > 0.05) {
          camera.fov = THREE.MathUtils.damp(camera.fov, rig.fov, 8, dt);
          camera.updateProjectionMatrix();
        }

        const camAlpha = snapCameraNextTick
          ? 1.0
          : exponentialDampingAlpha(dt, CAMERA_DEFAULTS.dampingRate);
        snapCameraNextTick = false;
        targetCamPosVec.set(rig.position.x, rig.position.y, rig.position.z);
        targetCamLookVec.set(rig.lookAt.x, rig.lookAt.y, rig.lookAt.z);

        currentCamPos.lerp(targetCamPosVec, camAlpha);
        currentCamLook.lerp(targetCamLookVec, camAlpha);
        camera.position.copy(currentCamPos);
        camera.lookAt(currentCamLook);

        renderer.render(scene, camera);
        frameCount += 1;
        container.dataset.frames = String(frameCount);

        if (!scheduleNext) return;
        if (isSoftwareGl) {
          afterDraw(() => tick(true));
        } else {
          rafId = requestAnimationFrame(() => tick(true));
        }
      };

      forceTickRef.current = () => {
        if (!disposed && isSoftwareGl) {
          tick(false);
        }
      };

      if (isSoftwareGl) {
        renderer.render(scene, camera);
        container.dataset.frames = '1';
        afterDraw(() => tick(true));
      } else {
        rafId = requestAnimationFrame(() => tick(true));
      }

      return () => {
        disposed = true;
        forceTickRef.current = null;
        actionApiRef.current = null;
        cancelAnimationFrame(frameId);
        cancelAnimationFrame(rafId);
        clearTimeout(frameId);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);

        if (greetNpcTimeoutId !== null) {
          window.clearTimeout(greetNpcTimeoutId);
          greetNpcTimeoutId = null;
        }
        if (npcMilkTimeoutId !== null) {
          window.clearTimeout(npcMilkTimeoutId);
          npcMilkTimeoutId = null;
        }

        audio.dispose();
        avatar.dispose();
        for (const npc of npcEntries) {
          npc.avatar.dispose();
        }
        multiplayerRef.current = null;
        syncRemoteVisibilityRef.current = null;
        multiplayer.dispose();
        clearRemoteEntries();
        world.dispose();
        textures.dispose();
        envTarget.dispose();
        renderer.dispose();
        if (canvas.parentElement === container) {
          container.removeChild(canvas);
        }
      };
    }, []);

    return (
      <div
        ref={mountRef}
        data-testid="onsen-viewport"
        className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      />
    );
  },
);
