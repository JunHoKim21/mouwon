/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormEvent, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  Download,
  MapPin,
  Moon,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AudioMixerSettings, DEFAULT_MIXER_SETTINGS } from './audio/onsenAudio';
import { MilkVendingModal } from './components/MilkVendingModal';
import { YarnBallModal } from './components/YarnBallModal';
import { CAT_COATS, CatCoatId } from './world/catCoats';
import { OnsenScene, OnsenSceneHandle, TimeOfDay } from './world/OnsenScene';
import { TELEPORT_SPOTS, WorldZoneId } from './world/terrainMath';
import {
  CatActionMode,
  INITIAL_WISH_YUZUS,
  MILK_VENDING_UNLOCK_KNEADS,
  MilkDrinkOption,
  NearbyInteractPrompt,
  PENTATONIC_BAMBOO_NOTES,
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
  const [trainActive, setTrainActive] = useState(false);
  const [xylophoneOpen, setXylophoneOpen] = useState(false);

  // Yarn 108 Counter modal state
  const [yarnOpen, setYarnOpen] = useState(false);
  const [yarnCount, setYarnCount] = useState(0);

  // Milk vending & knead cumulative counter
  const [milkModalOpen, setMilkModalOpen] = useState(false);
  const [kneadCount, setKneadCount] = useState(0);
  const [carryingFirewood, setCarryingFirewood] = useState(false);
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyInteractPrompt | null>(null);

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
      setWishError('소원 문구를 한 글자 이상 입력해 주세요.');
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
    setWishText('');
    setWishError('');
    setComposerOpen(false);
    setReadingWish(newWish);
  };

  const handleSelectWish = (wishId: string) => {
    const found = wishes.find((w) => w.id === wishId) ?? null;
    if (found) {
      setComposerOpen(false);
      setReadingWish(found);
    }
  };

  const handlePullSelfMilk = (drink: MilkDrinkOption) => {
    sceneRef.current?.playVendingDrop();
    setMilkModalOpen(false);
    showToast(`따뜻한 ${drink.label}를 뽑아 홀짝 마셨어요!`);
  };

  const handleGiftNpcMilk = (drink: MilkDrinkOption) => {
    const npcName = sceneRef.current?.giftMilkToNearestNpc(drink.label);
    setMilkModalOpen(false);
    if (npcName) {
      showToast(
        `'${npcName}' 고양이에게 따뜻한 ${drink.label}를 선물했어요! 분홍빛 온기가 피어오릅니다`,
      );
    } else {
      showToast(`따뜻한 ${drink.label} 온기를 전했어요!`);
    }
  };

  const showPolaroidAction = actionMode === 'soak' || actionMode === 'sitBench';
  const showContextBar =
    showPolaroidAction || trainActive || carryingFirewood || nearbyPrompt !== null;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <OnsenScene
        ref={sceneRef}
        coatId={coatId}
        timeOfDay={timeOfDay}
        wishYuzus={wishes}
        mixerSettings={mixer}
        trainActive={trainActive}
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
          setMilkModalOpen(true);
        }}
        onIncrementKneadCount={() => setKneadCount((prev) => prev + 1)}
        onCarryingChange={setCarryingFirewood}
        onNearbyInteractChange={setNearbyPrompt}
        onShowToast={showToast}
        onToggleXylophone={() => setXylophoneOpen((prev) => !prev)}
        onToggleYarnModal={() => setYarnOpen((prev) => !prev)}
      />

      {/* Top Floating Bar: Brand Title (Left) + Teleport Menu, Sound Mixer & Day/Night (Right) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between gap-1.5 px-2.5 py-2.5 sm:gap-2 sm:px-6 sm:py-4">
        <div
          className={`pointer-events-auto flex items-baseline gap-2.5 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 border shrink-0 ${surfaceCls}`}
        >
          <h1 className="text-sm sm:text-base font-semibold tracking-tight whitespace-nowrap">
            묘유원
          </h1>
          <span
            className={`hidden sm:inline text-xs whitespace-nowrap ${
              isNight ? 'text-[#d8cbb6]/75' : 'text-[#5a4e40]/75'
            }`}
          >
            고양이 온천 여관
          </span>
        </div>

        <div className="pointer-events-auto relative flex items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMixerOpen(false);
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
                className={`absolute right-0 top-11 sm:top-12 w-56 max-h-[65vh] overflow-y-auto rounded-2xl p-1.5 border shadow-xl z-30 ${surfaceCls}`}
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
            onClick={() => {
              setTeleportOpen(false);
              setMixerOpen((prev) => !prev);
            }}
            aria-expanded={mixerOpen}
            aria-label="사운드 믹서 열기"
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium border whitespace-nowrap shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${surfaceCls}`}
          >
            {mixer.muted ? (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-75" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-85" aria-hidden="true" />
            )}
            <span>음향</span>
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
                <span>밤 온천</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#c97a28]" aria-hidden="true" />
                <span>낮 설경</span>
              </>
            )}
          </button>

          {mixerOpen && (
            <div
              role="region"
              aria-label="사운드 믹서"
              className={`absolute right-0 top-12 w-60 rounded-2xl p-3.5 border shadow-xl ${surfaceCls}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold">온천 사운드 믹서</span>
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
                소원 유자 띄우기
              </h2>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="소원 창 닫기"
                className="rounded-lg p-1.5 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs opacity-75 mb-3">
              유자 빛깔을 고르고 따뜻한 소원을 담아 연못에 띄워보세요.
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
              <span className="sr-only">소원 문구</span>
              <input
                type="text"
                maxLength={40}
                value={wishText}
                onChange={(e) => {
                  setWishText(e.target.value);
                  if (wishError) setWishError('');
                }}
                placeholder="소원 문구를 적어주세요 (최대 40자)"
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
                소원 띄우기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Wish Yuzu Reader Card */}
      {readingWish && (
        <div
          role="dialog"
          aria-label="소원 유자 읽기"
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
              aria-label="소원 읽기 닫기"
              className="rounded-lg p-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Auto-Walk Journey Banner (Top-Center below Header) */}
      {walkingTargetLabel && (
        <div className="pointer-events-none fixed inset-x-0 top-14 sm:top-16 z-30 flex justify-center px-4">
          <button
            type="button"
            data-testid="stop-autowalk-btn"
            onClick={() => sceneRef.current?.stopAutoWalk()}
            className={`pointer-events-auto flex items-center gap-2 max-w-full rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium border shadow-lg cursor-pointer transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9842b] ${
              isNight
                ? 'bg-[#1a2030]/95 border-[#ff9e3b]/40 text-[#ffe8c8] hover:bg-[#252d42]'
                : 'bg-[#fcfaf5]/95 border-[#d9842b]/45 text-[#2c251d] hover:bg-[#f6efe2]'
            }`}
          >
            <span className="truncate">
              🐾 {walkingTargetLabel}로 걸어가는 중 · 이동 멈추기 (ESC)
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
          className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${
            walkingTargetLabel ? 'top-26 sm:top-28' : 'top-14 sm:top-16'
          }`}
        >
          <div
            className={`max-w-md rounded-xl px-4 py-2 text-xs sm:text-sm font-medium border shadow-lg text-center ${surfaceCls}`}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Milk Vending Machine Modal (strictly unmounted when closed) */}
      {milkModalOpen && (
        <MilkVendingModal
          isNight={isNight}
          kneadCount={kneadCount}
          onPullSelfMilk={handlePullSelfMilk}
          onGiftNpcMilk={handleGiftNpcMilk}
          onClose={() => setMilkModalOpen(false)}
        />
      )}

      {/* 108 Yarn Ball Counter Modal (strictly unmounted when closed) */}
      {yarnOpen && (
        <YarnBallModal
          isNight={isNight}
          count={yarnCount}
          onIncrement={() => {
            setYarnCount((prev) => {
              const next = Math.min(108, prev + 1);
              sceneRef.current?.playYarnTick(next);
              return next;
            });
          }}
          onReset={() => setYarnCount(0)}
          onClose={() => setYarnOpen(false)}
        />
      )}

      {/* Polaroid Photo Preview Modal (strictly unmounted when closed) */}
      {polaroidUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="폴라로이드 사진 미리보기"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
        >
          <div className={`w-full max-w-xs rounded-2xl p-4 border shadow-2xl ${surfaceCls}`}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-semibold">폴라로이드 추억 저장</h2>
              <button
                type="button"
                onClick={() => setPolaroidUrl(null)}
                aria-label="폴라로이드 창 닫기"
                className="rounded-lg p-1 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={polaroidUrl}
              alt="묘유원 폴라로이드 스냅샷"
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
                <span>PNG 저장</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Stack: Context Status/Capture Bar + Xylophone + Action Dock + 6-Coat Switcher */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 sm:bottom-4 z-20 flex flex-col items-center gap-2 px-3">
        {showContextBar && (
          <div
            data-testid="context-status-bar"
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-1.5 border shadow-md max-w-full ${surfaceCls}`}
          >
            {nearbyPrompt && (
              <button
                type="button"
                data-testid="nearby-interact-btn"
                onClick={() => sceneRef.current?.triggerInteraction(nearbyPrompt.kind)}
                title={nearbyPrompt.hint}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm transition-colors ${
                  isNight
                    ? 'bg-[#ff9e3b] text-[#1a2030] hover:bg-[#ffb15c]'
                    : 'bg-[#5c4328] text-[#fcfaf5] hover:bg-[#49341e]'
                }`}
              >
                <span>
                  {nearbyPrompt.kind === 'milk_vending'
                    ? `${nearbyPrompt.label} (${Math.min(kneadCount, MILK_VENDING_UNLOCK_KNEADS)}/${MILK_VENDING_UNLOCK_KNEADS})`
                    : nearbyPrompt.label}
                </span>
                <span className="opacity-80 text-[11px]">(F)</span>
              </button>
            )}

            {actionMode === 'sitBench' && (
              <button
                type="button"
                onClick={() => sceneRef.current?.standUp()}
                className="text-xs font-medium hover:underline cursor-pointer whitespace-nowrap"
              >
                오목눈이와 휴식 중 · 일어나기 (ESC)
              </button>
            )}

            {showPolaroidAction && (
              <button
                type="button"
                onClick={handleCapturePolaroid}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                <span>📸 폴라로이드 저장</span>
              </button>
            )}

            {carryingFirewood && nearbyPrompt?.kind !== 'firewood_furnace' && (
              <span className="text-xs font-medium opacity-90 whitespace-nowrap">
                🪵 장작 운반 중 · 아궁이 장작터로 가져가 불을 지펴주세요
              </span>
            )}

            {trainActive && (
              <span className="text-xs font-medium opacity-90 whitespace-nowrap">
                산책 대열 합류 중 · 이동 시 고양이들이 따라와요
              </span>
            )}
          </div>
        )}

        {xylophoneOpen && (
          <div
            role="group"
            aria-label="대나무 실로폰 음계"
            className={`pointer-events-auto flex items-center gap-1 rounded-xl p-1 border shadow-md ${surfaceCls}`}
          >
            {PENTATONIC_BAMBOO_NOTES.map((note, idx) => (
              <button
                key={note.key}
                type="button"
                onClick={() => sceneRef.current?.playBambooNote(idx)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  isNight
                    ? 'hover:bg-[#ff9e3b]/25 text-[#ffe6c4]'
                    : 'hover:bg-[#5c4328]/12 text-[#3c3329]'
                }`}
              >
                {note.key} {note.label}
              </button>
            ))}
          </div>
        )}

        {/* Action Dock (4th button = 🧶 털실 굴리기) */}
        <div
          role="group"
          aria-label="고양이 행동 선택"
          className={`pointer-events-auto grid grid-cols-3 sm:flex items-center justify-center gap-1 rounded-2xl p-1.5 border shadow-lg max-w-full ${surfaceCls}`}
        >
          <button
            type="button"
            onClick={() => sceneRef.current?.triggerGreet()}
            aria-pressed={actionMode === 'greet'}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'greet'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🐾 코 인사 (G)
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.triggerKneadOrLoaf()}
            aria-pressed={actionMode === 'knead' || actionMode === 'loaf'}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'knead' || actionMode === 'loaf'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🍞 꾹꾹이 / 식빵 (B)
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.triggerBathSoak()}
            aria-pressed={actionMode === 'soak'}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              actionMode === 'soak'
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            ♨️ 노천탕 입욕 (E)
          </button>
          <button
            type="button"
            onClick={() => setYarnOpen((prev) => !prev)}
            aria-pressed={yarnOpen}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              yarnOpen
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🧶 털실 굴리기
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.toggleWalkTrain()}
            aria-pressed={trainActive}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              trainActive
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🐈 산책 대열 (T)
          </button>
          <button
            type="button"
            onClick={() => {
              setXylophoneOpen((prev) => !prev);
              sceneRef.current?.playBambooNote(Math.floor(Math.random() * 5));
            }}
            aria-pressed={xylophoneOpen}
            className={`rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d9842b] ${
              xylophoneOpen
                ? 'bg-[#d9842b] text-white'
                : isNight
                  ? 'text-[#f4eee3] hover:bg-white/10'
                  : 'text-[#2c251d] hover:bg-black/6'
            }`}
          >
            🎋 실로폰 (M)
          </button>
        </div>

        {/* 6-Coat Switcher */}
        <nav
          aria-label="고양이 털 무늬 선택"
          className={`pointer-events-auto grid grid-cols-3 sm:flex items-center justify-center gap-1 rounded-2xl p-1 border shadow-md max-w-full ${surfaceCls}`}
        >
          {CAT_COATS.map((coat) => {
            const active = coat.id === coatId;
            return (
              <button
                key={coat.id}
                type="button"
                onClick={() => setCoatId(coat.id)}
                aria-pressed={active}
                aria-label={`${coat.name} 선택`}
                className={`flex items-center gap-1.5 rounded-xl px-2 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active
                    ? isNight
                      ? 'bg-[#ff9e3b]/25 text-[#ffe5c2] ring-1 ring-[#ff9e3b]/60'
                      : 'bg-[#5c4328] text-[#fcfaf5]'
                    : isNight
                      ? 'text-[#f4eee3] hover:bg-white/10'
                      : 'text-[#2c251d] hover:bg-[#2c251d]/8'
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
        </nav>
      </div>
    </div>
  );
}
