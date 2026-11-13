import { useEffect, useState } from 'react';
import { Gift, Milk, Sparkles, X } from 'lucide-react';
import {
  MILK_DRINK_OPTIONS,
  MILK_VENDING_UNLOCK_KNEADS,
  MilkDrinkOption,
} from '../world/ritualMath';

interface MilkVendingModalProps {
  isNight: boolean;
  kneadCount: number;
  onPullSelfMilk: (drink: MilkDrinkOption) => void;
  onGiftNpcMilk: (drink: MilkDrinkOption) => void;
  onClose: () => void;
}

export function MilkVendingModal({
  isNight,
  kneadCount,
  onPullSelfMilk,
  onGiftNpcMilk,
  onClose,
}: MilkVendingModalProps) {
  const [selectedId, setSelectedId] = useState<MilkDrinkOption['id']>('banana');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const unlocked = kneadCount >= MILK_VENDING_UNLOCK_KNEADS;
  const clampedCount = Math.min(MILK_VENDING_UNLOCK_KNEADS, kneadCount);
  const progressPct = Math.round(
    (clampedCount / MILK_VENDING_UNLOCK_KNEADS) * 100,
  );
  const selectedDrink =
    MILK_DRINK_OPTIONS.find((d) => d.id === selectedId) ?? MILK_DRINK_OPTIONS[0];

  const surfaceCls = isNight
    ? 'bg-[#1a2030] border-white/15 text-[#f4eee3]'
    : 'bg-[#fcfaf5] border-[#2c251d]/15 text-[#2c251d]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="milk-vending-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
    >
      <div
        className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl ${surfaceCls}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Milk className="w-4 h-4 text-[#d9842b]" aria-hidden="true" />
            <h2 id="milk-vending-title" className="text-base font-semibold">
              따뜻한 병우유 자판기
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="병우유 자판기 닫기"
            className="rounded-lg p-1.5 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs opacity-75 mb-3">
          꾹꾹이 · 식빵 누적 25회를 채우면 내 병우유를 뽑을 수 있어요. 주변 고양이에게는 언제든 바로 선물할 수 있습니다.
        </p>

        {/* Knead progress toward 25 */}
        <div
          className={`rounded-xl p-3 mb-3.5 border ${
            isNight
              ? 'bg-white/5 border-white/10'
              : 'bg-[#f4ede0]/80 border-[#2c251d]/10'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium">꾹꾹이 / 식빵 누적</span>
            <span
              data-testid="knead-progress-text"
              className="font-semibold tabular-nums text-[#d9842b]"
            >
              {kneadCount}/{MILK_VENDING_UNLOCK_KNEADS}회
            </span>
          </div>
          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              isNight ? 'bg-white/10' : 'bg-[#2c251d]/12'
            }`}
          >
            <div
              className="h-full bg-[#d9842b] transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] opacity-75">
            {unlocked
              ? '25회 달성 완료! 원하는 따뜻한 병우유를 뽑아보세요.'
              : `목표까지 ${MILK_VENDING_UNLOCK_KNEADS - kneadCount}회 남았어요 (B키 또는 하단 꾹꾹이 버튼)`}
          </p>
        </div>

        {/* 4 Drink Selector */}
        <div
          role="radiogroup"
          aria-label="병우유 종류 선택"
          className="grid grid-cols-2 gap-2 mb-4"
        >
          {MILK_DRINK_OPTIONS.map((drink) => {
            const active = drink.id === selectedDrink.id;
            return (
              <button
                key={drink.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedId(drink.id)}
                className={`flex items-center gap-2.5 rounded-xl p-2.5 border text-left cursor-pointer transition-colors ${
                  active
                    ? isNight
                      ? 'bg-[#ff9e3b]/20 border-[#ff9e3b] text-[#ffe8c8]'
                      : 'bg-[#f8ead4] border-[#d9842b] text-[#2c251d]'
                    : isNight
                      ? 'border-white/12 hover:bg-white/8'
                      : 'border-[#2c251d]/12 hover:bg-black/5'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="relative w-5 h-8 rounded-b-md rounded-t-sm border border-black/15 shrink-0 flex flex-col items-center"
                  style={{ backgroundColor: drink.bottleColor }}
                >
                  <span
                    className="w-3 h-1.5 rounded-t-sm -mt-1 border border-black/15"
                    style={{ backgroundColor: drink.capColor }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold truncate">
                    {drink.label}
                  </span>
                  <span className="block text-[10px] opacity-70 truncate">
                    따뜻한 병음료
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] opacity-75 mb-3.5 px-0.5">
          {selectedDrink.desc}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="pull-self-milk-btn"
            disabled={!unlocked}
            onClick={() => onPullSelfMilk(selectedDrink)}
            className={`flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors ${
              unlocked
                ? 'bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer'
                : isNight
                  ? 'bg-white/10 text-white/45 cursor-not-allowed'
                  : 'bg-[#2c251d]/10 text-[#2c251d]/45 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {unlocked
                ? `나에게 따뜻한 ${selectedDrink.label} 뽑기`
                : `나에게 따뜻한 병우유 뽑기 (${kneadCount}/${MILK_VENDING_UNLOCK_KNEADS}회)`}
            </span>
          </button>

          <button
            type="button"
            data-testid="gift-npc-milk-btn"
            onClick={() => onGiftNpcMilk(selectedDrink)}
            className={`flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-2.5 text-xs font-semibold border cursor-pointer transition-colors ${
              isNight
                ? 'bg-[#d8648d]/25 border-[#ff9ebc]/45 text-[#ffdbe8] hover:bg-[#d8648d]/35'
                : 'bg-[#fce8ef] border-[#e082a3] text-[#7a2846] hover:bg-[#f9dae5]'
            }`}
          >
            <Gift className="w-3.5 h-3.5" aria-hidden="true" />
            <span>주변 고양이에게 {selectedDrink.label} 선물하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
