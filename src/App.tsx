/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Gift,
  HandHeart,
  MapPin,
  Moon,
  SlidersHorizontal,
  Sun,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  MultiplayerRoomStatus,
  ROOM_MAX_PLAYERS,
} from './shared/multiplayerProtocol';
import { AudioMixerSettings, DEFAULT_MIXER_SETTINGS } from './audio/onsenAudio';
import { MilkBottleIllustration } from './components/MilkVendingModal';
import { CAT_COATS, CatCoatId, getCatCoatById } from './world/catCoats';
import {
  IncomingMilkOfferEvent,
  IncomingMilkRequestEvent,
  MilkSocialTargetInfo,
  OnsenScene,
  OnsenSceneHandle,
  TimeOfDay,
} from './world/OnsenScene';
import { TELEPORT_SPOTS, WorldZoneId } from './world/terrainMath';
import {
  CatActionMode,
  INITIAL_WISH_YUZUS,
  MILK_DRINK_OPTIONS,
  MILK_SOCIAL_MESSAGES,
  MilkDrinkOption,
  NearbyInteractPrompt,
  YUZU_WISH_COLORS,
  WishYuzuItem,
  clampWishMessage,
} from './world/ritualMath';

export default function App() {
  const sceneRef = useRef<OnsenSceneHandle | null>(null);

  const [coatId, setCoatId] = useState<CatCoatId>('cheese');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [actionMode, setActionMode] = useState<CatActionMode>('idle');
  const [currentZone, setCurrentZone] = useState<WorldZoneId>('entrance');
  const [walkingTargetLabel, setWalkingTargetLabel] = useState<string | null>(null);
  const [teleportOpen, setTeleportOpen] = useState(false);
  const [coatMenuOpen, setCoatMenuOpen] = useState(false);
  const [trainActive, setTrainActive] = useState(false);

  // Milk vending quick-bar state
  const [milkModalOpen, setMilkModalOpen] = useState(false);
  const [uiIdle, setUiIdle] = useState(false);
  const [heldMilk, setHeldMilk] = useState<MilkDrinkOption | null>(null);
  const [socialTargets, setSocialTargets] = useState<{
    nearbyGiveTarget: MilkSocialTargetInfo | null;
    nearbyVendingTarget: MilkSocialTargetInfo | null;
  }>({
    nearbyGiveTarget: null,
    nearbyVendingTarget: null,
  });
  const [incomingOffer, setIncomingOffer] = useState<IncomingMilkOfferEvent | null>(
    null,
  );
  const [incomingRequest, setIncomingRequest] =
    useState<IncomingMilkRequestEvent | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyInteractPrompt | null>(null);
  const [hideRemoteCats, setHideRemoteCats] = useState(false);
  const [roomStatus, setRoomStatus] = useState<MultiplayerRoomStatus>({
    state: 'offline',
    roomId: null,
    roomNumber: null,
    peerCount: 1,
    maxPeers: ROOM_MAX_PLAYERS,
    selfId: null,
  });

  // Non-blocking toast feedback banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3800);
  };

  // Polaroid capture state
  const [polaroidUrl, setPolaroidUrl] = useState<string | null>(null);

  // Sound Mixer state
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixer, setMixer] = useState<AudioMixerSettings>(DEFAULT_MIXER_SETTINGS);

  // Yuzu Wish Pond state
  const [wishes, setWishes] = useState<WishYuzuItem[]>(() => [...INITIAL_WISH_YUZUS]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [wishColorHex, setWishColorHex] = useState<string>(YUZU_WISH_COLORS[0].hex);
  const [wishText, setWishText] = useState('');
  const [wishError, setWishError] = useState('');
  const [readingWish, setReadingWish] = useState<WishYuzuItem | null>(null);

  const currentZoneLabel =
    TELEPORT_SPOTS.find((spot) => spot.zoneId === currentZone)?.label ?? '묘유원 정원';
  const activeCoat = getCatCoatById(coatId);

  const isNight = timeOfDay === 'night';

  const surfaceCls = isNight
    ? 'bg-[#1a2030]/95 border-white/15 text-[#f4eee3]'
    : 'bg-[#fcfaf5]/95 border-[#2c251d]/15 text-[#2c251d]';

  const triggerDownloadPolaroid = (dataUrl: string) => {
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = dataUrl;
    link.download = `myoyuwon-polaroid-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCapturePolaroid = () => {
    const dataUrl = sceneRef.current?.capturePolaroid();
    if (!dataUrl) return;
    triggerDownloadPolaroid(dataUrl);
    setPolaroidUrl(dataUrl);
  };

  const handleSubmitWish = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = clampWishMessage(wishText);
    if (!cleaned) {
      setWishError('감사나 응원 문구를 한 글자 이상 입력해 주세요.');
      return;
    }
    const angle = (wishes.length * 1.9 + 0.6) % (Math.PI * 2);
    const radius = 0.9 + ((wishes.length * 0.43) % 1.8);
    const newWish: WishYuzuItem = {
      id: `wish-${Date.now()}`,
      colorHex: wishColorHex,
      message: cleaned,
      localX: Number((Math.cos(angle) * radius).toFixed(2)),
      localZ: Number((Math.sin(angle) * radius).toFixed(2)),
      phase: wishes.length * 1.1,
    };
    setWishes((prev) => [...prev, newWish]);
    sceneRef.current?.broadcastWish(newWish);
    setWishText('');
    setWishError('');
    setComposerOpen(false);
    setReadingWish(newWish);
  };

  const handleRoomSnapshotWishes = (snapshotWishes: WishYuzuItem[]) => {
    if (snapshotWishes.length > 0) {
      setWishes(snapshotWishes);
    }
  };

  const handleRemoteWishReceived = (wish: WishYuzuItem) => {
    setWishes((prev) => {
      if (prev.some((item) => item.id === wish.id)) return prev;
      return [...prev, wish].slice(-30);
    });
  };

  const handleSelectWish = (wishId: string) => {
    const found = wishes.find((w) => w.id === wishId) ?? null;
    if (found) {
      setComposerOpen(false);
      setReadingWish(found);
    }
  };

  const handlePullHoldMilk = (drink: MilkDrinkOption) => {
    setHeldMilk(drink);
    sceneRef.current?.holdMilk(drink);
    setMilkModalOpen(false);
    showToast(
      `따뜻한 ${drink.label}를 뽑아 두 앞발로 꼭 들었어요! 걸어가며 다른 고양이를 만나면 건넬 수 있어요 🥛✨`,
    );
  };

  const handleDrinkHeldMilk = () => {
    if (!heldMilk) return;
    const drink = heldMilk;
    sceneRef.current?.drinkHeldMilk();
    setHeldMilk(null);
    showToast(
      `따뜻한 ${drink.label}를 두 앞발로 잡고 홀짝 마셨어요! 분홍빛 온기가 피어오릅니다 🥛💕`,
    );
  };

  const handleDropHeldMilk = () => {
    sceneRef.current?.holdMilk(null);
    setHeldMilk(null);
    showToast('들고 있던 병우유를 벤치 바구니에 조심스레 내려놓았어요.');
  };

  const handleOfferMilkToNearby = () => {
    sceneRef.current?.offerHeldMilkToTarget(
      socialTargets.nearbyGiveTarget ?? undefined,
    );
  };

  const handleRequestMilkFromPeer = (
    drink: MilkDrinkOption = MILK_DRINK_OPTIONS[0],
  ) => {
    setMilkModalOpen(false);
    sceneRef.current?.requestMilkFromTarget(
      drink.id,
      socialTargets.nearbyVendingTarget ?? undefined,
    );
  };

  const handleRespondMilkOffer = (accepted: boolean) => {
    if (!incomingOffer) return;
    sceneRef.current?.respondMilkOffer(
      incomingOffer.fromPeerId,
      incomingOffer.drink.id,
      accepted,
      incomingOffer.isNpc,
    );
    if (accepted) {
      showToast(
        MILK_SOCIAL_MESSAGES.acceptReceiverToast(
          incomingOffer.senderName,
          incomingOffer.drink.label,
        ),
      );
    }
    setIncomingOffer(null);
  };

  const handleRespondMilkRequest = (accepted: boolean) => {
    if (!incomingRequest) return;
    sceneRef.current?.respondMilkRequest(
      incomingRequest.fromPeerId,
      incomingRequest.drink.id,
      accepted,
    );
    setIncomingRequest(null);
  };

  const wasNearMilkVendingRef = useRef(false);

  useEffect(() => {
    const isNearMilkNow = nearbyPrompt?.kind === 'milk_vending';
    if (isNearMilkNow && !wasNearMilkVendingRef.current && heldMilk === null) {
      setMilkModalOpen(true);
    } else if (!isNearMilkNow && wasNearMilkVendingRef.current) {
      setMilkModalOpen(false);
    }
    wasNearMilkVendingRef.current = isNearMilkNow;
  }, [nearbyPrompt, heldMilk]);

  useEffect(() => {
    setUiIdle(false);
  }, [nearbyPrompt, currentZone]);

  useEffect(() => {
    let timerId: number | null = null;
    const scheduleFade = () => {
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        setUiIdle(true);
      }, 4500);
    };
    const handleActivity = (evt?: Event) => {
      if (evt instanceof KeyboardEvent && evt.key === 'Escape') {
        setMilkModalOpen(false);
        setCoatMenuOpen(false);
        setTeleportOpen(false);
        setMixerOpen(false);
      }
      setUiIdle(false);
      scheduleFade();
    };
    scheduleFade();
    const events: Array<keyof WindowEventMap> = [
      'pointermove',
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
    ];
    for (const evt of events) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      for (const evt of events) {
        window.removeEventListener(evt, handleActivity);
      }
    };
  }, []);

  const isAnyOverlayOpen =
    composerOpen ||
    readingWish !== null ||
    milkModalOpen ||
    polaroidUrl !== null ||
    incomingOffer !== null ||
    incomingRequest !== null ||
    teleportOpen ||
    mixerOpen ||
    coatMenuOpen ||
    heldMilk !== null ||
    nearbyPrompt !== null ||
    walkingTargetLabel !== null;
  const shouldFadeUi = uiIdle && !isAnyOverlayOpen;

  const showContextBar = heldMilk === null && !milkModalOpen && nearbyPrompt !== null;
  const isRestingPose =
    actionMode === 'footSoak' ||
    actionMode === 'sitBench' ||
    actionMode === 'knead' ||
    actionMode === 'loaf';

  return (
    <div className="relative w-screen h-dvh overflow-hidden">
      <OnsenScene
        ref={sceneRef}
        coatId={coatId}
        timeOfDay={timeOfDay}
        wishYuzus={wishes}
        mixerSettings={mixer}
        trainActive={trainActive}
        hideRemoteCats={hideRemoteCats}
        heldMilk={heldMilk}
        onActionModeChange={setActionMode}
        onZoneChange={setCurrentZone}
        onWalkingTargetChange={setWalkingTargetLabel}
        onTrainActiveChange={setTrainActive}
        onOpenWishComposer={() => {
          setReadingWish(null);
          setWishError('');
          setComposerOpen(true);
        }}
        onSelectWishYuzu={handleSelectWish}
        onOpenMilkVending={() => {
          setTeleportOpen(false);
          setMixerOpen(false);
          setCoatMenuOpen(false);
          setMilkModalOpen(true);
        }}
        onHeldMilkChange={setHeldMilk}
        onSocialTargetsChange={setSocialTargets}
        onIncomingMilkOffer={setIncomingOffer}
        onIncomingMilkRequest={setIncomingRequest}
        onNearbyInteractChange={setNearbyPrompt}
        onShowToast={showToast}
        onMultiplayerStatusChange={setRoomStatus}
        onRoomSnapshotWishes={handleRoomSnapshotWishes}
        onRemoteWishReceived={handleRemoteWishReceived}
      />

      {/* Top Floating Bar: Brand Title + Coat Dropdown (Left) + Teleport, Photo, Sound & Day/Night (Right) */}
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-1.5 px-2 py-2 sm:flex-nowrap sm:items-start sm:gap-2 sm:px-6 sm:py-4 transition-opacity duration-700 ${
          shouldFadeUi ? 'opacity-0 [&_*]:!pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 min-w-0">
          <div
            className={`flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 border shrink-0 ${surfaceCls}`}
          >
            <h1 className="text-xs sm:text-base font-semibold tracking-tight whitespace-nowrap">
              묘유원
            </h1>
            <span
              className={`hidden md:inline text-xs whitespace-nowrap ${
                isNight ? 'text-[#d8cbb6]/75' : 'text-[#5a4e40]/75'
              }`}
            >
              고양이 온천 여관
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              data-testid="coat-menu-btn"
              onClick={() => {
                setTeleportOpen(false);
                setMixerOpen(false);
                setCoatMenuOpen((prev) => !prev);
              }}
              aria-expanded={coatMenuOpen}
              aria-haspopup="menu"
              aria-label={`고양이 털 무늬 선택 (${activeCoat.name})`}
              title={`고양이 털 무늬: ${activeCoat.name}`}
              className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${surfaceCls}`}
            >
              <span
                aria-hidden="true"
                className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                style={{ background: activeCoat.swatchGradient }}
              />
              <span className="hidden sm:inline">{activeCoat.name}</span>
              <ChevronDown
                className={`w-3 h-3 opacity-75 shrink-0 transition-transform ${
                  coatMenuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {coatMenuOpen && (
              <div
                role="menu"
                aria-label="고양이 털 무늬 선택"
                className={`absolute left-0 top-11 sm:top-12 w-40 rounded-2xl p-1.5 border shadow-xl z-30 ${surfaceCls}`}
              >
                <div className="px-2.5 py-1 text-[11px] font-semibold opacity-70">
                  🐱 털 무늬 선택
                </div>
                <div className="flex flex-col gap-0.5">
                  {CAT_COATS.map((coat) => {
                    const active = coat.id === coatId;
                    return (
                      <button
                        key={coat.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setCoatId(coat.id);
                          setCoatMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 w-full rounded-xl px-2.5 py-1.5 text-left text-xs font-medium cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
                          active
                            ? 'bg-[#d9842b] text-white'
                            : isNight
                              ? 'text-[#f4eee3] hover:bg-white/10'
                              : 'text-[#2c251d] hover:bg-black/6'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                          style={{ background: coat.swatchGradient }}
                        />
                        <span>{coat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div
            data-testid="room-status-badge"
            title={
              roomStatus.state === 'connected'
                ? `실시간 온천 방 ${roomStatus.roomNumber ?? 1}번 (${roomStatus.peerCount}/${roomStatus.maxPeers}명)`
                : '서버 미연결 (혼자서도 모든 온천 기능을 이용할 수 있어요)'
            }
            className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-medium border whitespace-nowrap shrink-0 ${surfaceCls}`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                roomStatus.state === 'connected'
                  ? 'bg-emerald-500'
                  : roomStatus.state === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : isNight
                      ? 'bg-[#d8cbb6]/45'
                      : 'bg-[#5a4e40]/40'
              }`}
              aria-hidden="true"
            />
            <Users className="w-3.5 h-3.5 opacity-80 shrink-0 hidden sm:inline" aria-hidden="true" />
            <span>
              {roomStatus.state === 'connected'
                ? `${roomStatus.roomNumber ?? 1}번 방 · ${roomStatus.peerCount}/${roomStatus.maxPeers}`
                : roomStatus.state === 'connecting'
                  ? '연결 중'
                  : '오프라인'}
            </span>
          </div>

          {roomStatus.state === 'connected' && (
            <button
              type="button"
              onClick={() => setHideRemoteCats((prev) => !prev)}
              aria-pressed={hideRemoteCats}
              title={
                hideRemoteCats
                  ? '다른 고양이 다시 보이기'
                  : '다른 고양이 숨기고 혼자 보기'
              }
              className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${
                hideRemoteCats
                  ? 'bg-[#d9842b] text-white border-[#d9842b]'
                  : surfaceCls
              }`}
            >
              {hideRemoteCats ? (
                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden md:inline">혼자 보기</span>
            </button>
          )}
        </div>

        <div className="pointer-events-auto relative flex items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMixerOpen(false);
                setCoatMenuOpen(false);
                setTeleportOpen((prev) => !prev);
              }}
              aria-expanded={teleportOpen}
              aria-haspopup="menu"
              aria-label={`장소 이동 (현재 위치: ${currentZoneLabel})`}
              title={`장소 이동 · 현재: ${currentZoneLabel}`}
              className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${surfaceCls}`}
            >
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#d9842b] shrink-0" aria-hidden="true" />
              <span className="max-w-[74px] sm:max-w-none truncate">{currentZoneLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-75 shrink-0 transition-transform ${
                  teleportOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {teleportOpen && (
              <div
                role="menu"
                aria-label="장소 걸어가기 메뉴"
                className={`absolute left-0 sm:left-auto sm:right-0 top-11 sm:top-12 w-56 max-h-[65vh] overflow-y-auto rounded-2xl p-1.5 border shadow-xl z-30 ${surfaceCls}`}
              >
                <div className="px-2.5 py-1.5 text-[11px] font-semibold opacity-70">
                  📍 장소 걸어가기
                </div>
                <div className="flex flex-col gap-0.5">
                  {TELEPORT_SPOTS.map((spot) => {
                    const isHere = spot.zoneId === currentZone;
                    return (
                      <button
                        key={spot.zoneId}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          sceneRef.current?.walkToZone(spot.zoneId);
                          setTeleportOpen(false);
                        }}
                        className={`flex items-center justify-between w-full rounded-xl px-2.5 py-2 text-left text-xs font-medium cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
                          isHere
                            ? 'bg-[#d9842b] text-white'
                            : isNight
                              ? 'text-[#f4eee3] hover:bg-white/10'
                              : 'text-[#2c251d] hover:bg-black/6'
                        }`}
                      >
                        <span>{spot.label}</span>
                        {isHere && (
                          <span className="text-[10px] font-semibold opacity-90">현재</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="capture-polaroid-btn"
            onClick={handleCapturePolaroid}
            aria-label="추억 사진 저장"
            title="추억 사진 저장"
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${surfaceCls}`}
          >
            <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#d9842b] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">사진</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTeleportOpen(false);
              setCoatMenuOpen(false);
              setMixerOpen((prev) => !prev);
            }}
            aria-expanded={mixerOpen}
            aria-label="온천 소리 조절 열기"
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${surfaceCls}`}
          >
            {mixer.muted ? (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-85" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">음향</span>
          </button>

          <button
            type="button"
            onClick={() => setTimeOfDay((prev) => (prev === 'day' ? 'night' : 'day'))}
            aria-label={isNight ? '낮 시간으로 전환' : '밤 시간으로 전환'}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${
              isNight
                ? 'bg-[#2a221c]/95 border-[#ff9e3b]/40 text-[#ffd9a8] hover:bg-[#382d24]'
                : 'bg-[#fcfaf5]/95 border-[#2c251d]/15 text-[#2c251d] hover:bg-[#f3ede2]'
            }`}
          >
            {isNight ? (
              <>
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ff9e3b]" aria-hidden="true" />
                <span className="hidden sm:inline">밤 온천</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#c97a28]" aria-hidden="true" />
                <span className="hidden sm:inline">낮 설경</span>
              </>
            )}
          </button>

          {mixerOpen && (
            <div
              role="region"
              aria-label="온천 소리 조절"
              className={`absolute left-0 sm:left-auto sm:right-0 top-11 sm:top-12 w-60 rounded-2xl p-3.5 border shadow-xl z-30 ${surfaceCls}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold">온천 소리 조절</span>
                <button
                  type="button"
                  onClick={() =>
                    setMixer((prev) => ({ ...prev, muted: !prev.muted }))
                  }
                  aria-pressed={mixer.muted}
                  aria-label={mixer.muted ? '전체 음소거 해제' : '전체 음소거'}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium cursor-pointer border ${
                    mixer.muted
                      ? 'bg-[#c94a3a]/20 border-[#c94a3a]/40 text-[#e06a5a]'
                      : isNight
                        ? 'border-white/15 hover:bg-white/10'
                        : 'border-[#2c251d]/15 hover:bg-black/5'
                  }`}
                >
                  {mixer.muted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>음소거됨</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>소리 켬</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between gap-2">
                  <span className="w-12 shrink-0">환경음</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(mixer.ambient * 100)}
                    onChange={(e) =>
                      setMixer((prev) => ({
                        ...prev,
                        ambient: Number(e.target.value) / 100,
                      }))
                    }
                    className="w-full accent-[#d48b35] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="w-12 shrink-0">골골송</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(mixer.purr * 100)}
                    onChange={(e) =>
                      setMixer((prev) => ({
                        ...prev,
                        purr: Number(e.target.value) / 100,
                      }))
                    }
                    className="w-full accent-[#d48b35] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="w-12 shrink-0">효과음</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(mixer.sfx * 100)}
                    onChange={(e) =>
                      setMixer((prev) => ({
                        ...prev,
                        sfx: Number(e.target.value) / 100,
                      }))
                    }
                    className="w-full accent-[#d48b35] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Wish Yuzu Composer Modal */}
      {composerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wish-composer-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
        >
          <form
            onSubmit={handleSubmitWish}
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl ${surfaceCls}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="wish-composer-title" className="text-base font-semibold">
                감사·응원 유자 띄우기
              </h2>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="유자 쪽지 창 닫기"
                className="rounded-lg p-1.5 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs opacity-75 mb-3">
              유자 빛깔을 고르고 따뜻한 감사와 응원 쪽지를 연못에 띄워보세요.
            </p>

            <div className="flex items-center gap-2 mb-3.5" role="group" aria-label="유자 색상 선택">
              {YUZU_WISH_COLORS.map((c) => {
                const selected = c.hex === wishColorHex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setWishColorHex(c.hex)}
                    aria-label={c.label}
                    aria-pressed={selected}
                    className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                      selected ? 'scale-110 border-[#5c4328] ring-2 ring-[#ff9e3b]/60' : 'border-black/15'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
            </div>

            <label className="block mb-2">
              <span className="sr-only">감사·응원 쪽지</span>
              <input
                type="text"
                maxLength={40}
                value={wishText}
                onChange={(e) => {
                  setWishText(e.target.value);
                  if (wishError) setWishError('');
                }}
                placeholder="따뜻한 감사나 응원 한마디를 적어주세요 (최대 40자)"
                className={`w-full rounded-xl px-3 py-2 text-sm border outline-none ${
                  isNight
                    ? 'bg-[#121622] border-white/15 text-[#f4eee3] placeholder:text-white/35'
                    : 'bg-white border-[#2c251d]/20 text-[#2c251d] placeholder:text-[#2c251d]/40'
                }`}
              />
            </label>

            <div className="flex items-center justify-between text-[11px] mb-3">
              <span className="text-[#d45746]">{wishError}</span>
              <span className="opacity-65 tabular-nums">{wishText.trim().length}/40</span>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-xl px-3.5 py-2 text-xs font-medium opacity-80 hover:opacity-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded-xl px-4 py-2 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer"
              >
                쪽지 띄우기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Yuzu Note Reader Card */}
      {readingWish && (
        <div
          role="dialog"
          aria-label="유자 쪽지 읽기"
          className="fixed inset-x-0 top-16 z-30 flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto flex items-center gap-3 max-w-md rounded-2xl px-4 py-3 border shadow-xl ${surfaceCls}`}
          >
            <span
              className="w-4 h-4 rounded-full shrink-0 border border-black/15"
              style={{ backgroundColor: readingWish.colorHex }}
              aria-hidden="true"
            />
            <p className="text-sm font-medium leading-snug">{readingWish.message}</p>
            <button
              type="button"
              onClick={() => setReadingWish(null)}
              aria-label="쪽지 읽기 닫기"
              className="rounded-lg p-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Auto-Walk Journey Banner (Top-Center below Header) */}
      {walkingTargetLabel && (
        <div className="pointer-events-none fixed inset-x-0 top-[88px] sm:top-16 z-30 flex justify-center px-3 sm:px-4">
          <button
            type="button"
            data-testid="stop-autowalk-btn"
            onClick={() => sceneRef.current?.stopAutoWalk()}
            className={`pointer-events-auto flex items-center gap-2 max-w-full rounded-xl px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium border shadow-lg cursor-pointer transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${
              isNight
                ? 'bg-[#1a2030]/95 border-[#ff9e3b]/40 text-[#ffe8c8] hover:bg-[#252d42]'
                : 'bg-[#fcfaf5]/95 border-[#d9842b]/45 text-[#2c251d] hover:bg-[#f6efe2]'
            }`}
          >
            <span className="truncate">
              🐾 {walkingTargetLabel}로 걸어가는 중 · 이동 멈추기 <span className="hidden sm:inline">(ESC)</span>
            </span>
          </button>
        </div>
      )}

      {/* Non-blocking Top-Center Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          data-testid="onsen-toast"
          className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3 sm:px-4 ${
            walkingTargetLabel ? 'top-[136px] sm:top-28' : 'top-[88px] sm:top-16'
          }`}
        >
          <div
            className={`max-w-md rounded-xl px-4 py-2 text-xs sm:text-sm font-medium border shadow-lg text-center ${surfaceCls}`}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Non-blocking Floating Card: Incoming Milk Gift Offer Approval / Decline */}
      {incomingOffer && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="우유 선물 도착"
          className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-3 pointer-events-none"
        >
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-2xl p-3.5 sm:p-4 border shadow-2xl ${surfaceCls}`}
          >
            <div className="flex items-center gap-3 mb-2.5">
              <MilkBottleIllustration drink={incomingOffer.drink} size="md" />
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-[#fce8ef] text-[#7a2846] px-2 py-0.5 text-[10px] font-semibold mb-0.5">
                  따뜻한 병우유 선물
                </span>
                <h2 className="text-sm font-semibold leading-snug truncate">
                  {incomingOffer.senderName}의 {incomingOffer.drink.label}
                </h2>
              </div>
            </div>
            <p className="text-xs leading-relaxed opacity-85 mb-3">
              {MILK_SOCIAL_MESSAGES.offerPrompt(
                incomingOffer.senderName,
                incomingOffer.drink.label,
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="accept-milk-offer-btn"
                onClick={() => handleRespondMilkOffer(true)}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer transition-colors"
              >
                😻 고맙다냥! 마시기
              </button>
              <button
                type="button"
                data-testid="decline-milk-offer-btn"
                onClick={() => handleRespondMilkOffer(false)}
                className={`rounded-xl px-3 py-2 text-xs font-medium border cursor-pointer transition-colors ${
                  isNight
                    ? 'border-white/15 hover:bg-white/10'
                    : 'border-[#2c251d]/15 hover:bg-black/5'
                }`}
              >
                😿 마음만 받기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Floating Card: Incoming Milk Request (Near Vending Machine) */}
      {incomingRequest && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="우유 요청 도착"
          className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-3 pointer-events-none"
        >
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-2xl p-3.5 sm:p-4 border shadow-2xl ${surfaceCls}`}
          >
            <div className="flex items-center gap-3 mb-2.5">
              <MilkBottleIllustration drink={incomingRequest.drink} size="md" />
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-[#eaf2fc] text-[#1f4268] px-2 py-0.5 text-[10px] font-semibold mb-0.5">
                  자판기 앞 요청 🥺
                </span>
                <h2 className="text-sm font-semibold leading-snug truncate">
                  {incomingRequest.requesterName}의 {incomingRequest.drink.label} 부탁
                </h2>
              </div>
            </div>
            <p className="text-xs leading-relaxed opacity-85 mb-3">
              {MILK_SOCIAL_MESSAGES.requestPrompt(
                incomingRequest.requesterName,
                incomingRequest.drink.label,
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="accept-milk-request-btn"
                onClick={() => handleRespondMilkRequest(true)}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold bg-[#4f77a8] text-white hover:bg-[#3f6493] cursor-pointer transition-colors"
              >
                🍼 뽑아서 건네기
              </button>
              <button
                type="button"
                data-testid="decline-milk-request-btn"
                onClick={() => handleRespondMilkRequest(false)}
                className={`rounded-xl px-3 py-2 text-xs font-medium border cursor-pointer transition-colors ${
                  isNight
                    ? 'border-white/15 hover:bg-white/10'
                    : 'border-[#2c251d]/15 hover:bg-black/5'
                }`}
              >
                🌰 다음에 사주기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory Photo Preview Modal (strictly unmounted when closed) */}
      {polaroidUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="추억 사진 미리보기"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
        >
          <div className={`w-full max-w-xs rounded-2xl p-4 border shadow-2xl ${surfaceCls}`}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-semibold">추억 사진 저장</h2>
              <button
                type="button"
                onClick={() => setPolaroidUrl(null)}
                aria-label="추억 사진 창 닫기"
                className="rounded-lg p-1 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={polaroidUrl}
              alt="묘유원 추억 사진"
              className="w-full rounded-lg border border-black/10 shadow-sm"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPolaroidUrl(null)}
                className="rounded-xl px-3 py-1.5 text-xs font-medium opacity-80 hover:opacity-100 cursor-pointer"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => triggerDownloadPolaroid(polaroidUrl)}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>사진 파일 저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Stack: Quick Milk Bar / Held Milk / Nearby Action Pill + Slim Action Dock */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-3 sm:bottom-5 pb-[env(safe-area-inset-bottom)] z-20 flex flex-col items-center gap-1.5 px-2 sm:px-3 transition-opacity duration-700 ${
          shouldFadeUi ? 'opacity-0 [&_*]:!pointer-events-none' : 'opacity-100'
        }`}
      >
        {milkModalOpen && (
          <div
            data-testid="milk-quick-bar"
            role="region"
            aria-label="병우유 원터치 뽑기"
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl px-2.5 py-1.5 border shadow-lg max-w-full ${surfaceCls}`}
          >
            <span className="text-[11px] sm:text-xs font-semibold px-1.5 whitespace-nowrap">
              🥛 따뜻한 병우유 자판기
            </span>
            {MILK_DRINK_OPTIONS.map((drink, idx) => (
              <button
                key={drink.id}
                type="button"
                data-testid={idx === 0 ? 'pull-self-milk-btn' : `pull-milk-${drink.id}-btn`}
                onClick={() => handlePullHoldMilk(drink)}
                className={`flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] sm:text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                  isNight
                    ? 'hover:bg-[#ff9e3b]/25 text-[#ffe8c8]'
                    : 'hover:bg-[#f6e4c8] text-[#2c251d]'
                }`}
              >
                <MilkBottleIllustration drink={drink} size="sm" />
                <span>{drink.label}</span>
              </button>
            ))}
            {socialTargets.nearbyVendingTarget && (
              <button
                type="button"
                data-testid="request-milk-vending-btn"
                onClick={() => handleRequestMilkFromPeer(MILK_DRINK_OPTIONS[0])}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm transition-colors ${
                  isNight
                    ? 'bg-[#4f77a8] text-white hover:bg-[#6189ba]'
                    : 'bg-[#356396] text-white hover:bg-[#2a507a]'
                }`}
              >
                <HandHeart className="w-3 h-3" aria-hidden="true" />
                <span>🥺 {socialTargets.nearbyVendingTarget.name}에게 조르기</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMilkModalOpen(false)}
              aria-label="우유 자판기 닫기"
              className="rounded-full p-1 opacity-65 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {heldMilk && (
          <div
            data-testid="held-milk-banner"
            className={`pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1 border shadow-lg max-w-full ${surfaceCls}`}
          >
            <MilkBottleIllustration drink={heldMilk} size="sm" />
            <span className="text-xs font-semibold whitespace-nowrap">
              {heldMilk.label}
            </span>
            {socialTargets.nearbyGiveTarget && (
              <button
                type="button"
                data-testid="give-held-milk-btn"
                onClick={handleOfferMilkToNearby}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold bg-[#e0608a] text-white hover:bg-[#c94e76] cursor-pointer whitespace-nowrap shadow-sm"
              >
                <Gift className="w-3 h-3" aria-hidden="true" />
                <span>{socialTargets.nearbyGiveTarget.name}에게 주기</span>
              </button>
            )}
            <button
              type="button"
              data-testid="drink-held-milk-btn"
              onClick={handleDrinkHeldMilk}
              className="rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer whitespace-nowrap shadow-sm"
            >
              😋 마시기
            </button>
            <button
              type="button"
              onClick={handleDropHeldMilk}
              aria-label="들고 있는 우유 내려놓기"
              title="내려놓기"
              className="rounded-full p-1 opacity-65 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {showContextBar && nearbyPrompt && (
          <div
            data-testid="context-status-bar"
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full px-2 py-1 border shadow-md max-w-full ${surfaceCls}`}
          >
            <button
              type="button"
              data-testid="nearby-interact-btn"
              onClick={() => sceneRef.current?.triggerInteraction(nearbyPrompt.kind)}
              title={nearbyPrompt.hint}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm transition-colors ${
                isNight
                  ? 'bg-[#ff9e3b] text-[#1a2030] hover:bg-[#ffb15c]'
                  : 'bg-[#5c4328] text-[#fcfaf5] hover:bg-[#49341e]'
              }`}
            >
              <kbd
                className={`hidden sm:inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  isNight ? 'bg-black/20 text-[#1a2030]' : 'bg-white/20 text-white'
                }`}
              >
                F
              </kbd>
              <span>{nearbyPrompt.label}</span>
            </button>
            {nearbyPrompt.kind === 'milk_vending' &&
              socialTargets.nearbyVendingTarget && (
                <button
                  type="button"
                  data-testid="context-request-milk-btn"
                  onClick={() => handleRequestMilkFromPeer()}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm transition-colors ${
                    isNight
                      ? 'bg-[#4f77a8] text-white hover:bg-[#6189ba]'
                      : 'bg-[#356396] text-white hover:bg-[#2a507a]'
                  }`}
                >
                  <HandHeart className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    🥺 {socialTargets.nearbyVendingTarget.name}에게 우유 요청하기
                  </span>
                </button>
              )}
          </div>
        )}

        {!showContextBar && isRestingPose && !milkModalOpen && (
          <button
            type="button"
            onClick={() => sceneRef.current?.standUp()}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] sm:text-xs font-medium border shadow-sm cursor-pointer transition-colors ${surfaceCls}`}
          >
            <kbd
              className={`hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                isNight ? 'bg-white/15 text-[#f4eee3]' : 'bg-[#2c251d]/10 text-[#2c251d]'
              }`}
            >
              WASD · Esc
            </kbd>
            <span>일어서기</span>
          </button>
        )}

        {/* Slim Action Dock: 5 Core Actions */}
        <div
          role="group"
          aria-label="고양이 행동 선택"
          className={`pointer-events-auto flex items-center justify-start sm:justify-center gap-1 rounded-2xl p-1 sm:p-1.5 border shadow-lg overflow-x-auto max-w-full ${surfaceCls}`}
        >
          <button
            type="button"
            title="코 인사 (G)"
            onClick={() => sceneRef.current?.triggerGreet()}
            aria-pressed={actionMode === 'greet'}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'greet'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🐾 코 인사
            <kbd className="hidden sm:inline-block ml-1 text-[10px] opacity-60 font-sans">G</kbd>
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.triggerGroom()}
            aria-pressed={actionMode === 'groom'}
            title="세수/그루밍 (R)"
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'groom'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🧼 그루밍
            <kbd className="hidden sm:inline-block ml-1 text-[10px] opacity-60 font-sans">R</kbd>
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.triggerKneadOrLoaf()}
            aria-pressed={actionMode === 'knead' || actionMode === 'loaf'}
            title="꾹꾹이/식빵 (B)"
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'knead' || actionMode === 'loaf'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🍞 꾹꾹이
            <kbd className="hidden sm:inline-block ml-1 text-[10px] opacity-60 font-sans">B</kbd>
          </button>
          <button
            type="button"
            title="노천탕 입욕 (E)"
            onClick={() => sceneRef.current?.triggerBathSoak()}
            aria-pressed={actionMode === 'soak'}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'soak'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            ♨️ 입욕
            <kbd className="hidden sm:inline-block ml-1 text-[10px] opacity-60 font-sans">E</kbd>
          </button>
          <button
            type="button"
            title="산책 동행 (T)"
            onClick={() => sceneRef.current?.toggleWalkTrain()}
            aria-pressed={trainActive}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              trainActive
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🐈 산책
            <kbd className="hidden sm:inline-block ml-1 text-[10px] opacity-60 font-sans">T</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
