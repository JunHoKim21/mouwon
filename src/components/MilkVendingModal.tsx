import { useEffect, useState } from 'react';
import { HandHeart, Milk, Sparkles, X } from 'lucide-react';
import {
  MILK_DRINK_OPTIONS,
  MilkDrinkId,
  MilkDrinkOption,
} from '../world/ritualMath';

export interface MilkSocialTarget {
  kind: 'remote' | 'npc';
  id: string;
  name: string;
}

const DRINK_EMOJI: Record<MilkDrinkId, string> = {
  banana: '🍌',
  strawberry: '🍓',
  white: '🥛',
  matatabi: '🌿',
};

export function MilkBottleIllustration({
  drink,
  size = 'md',
}: {
  drink: MilkDrinkOption;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'lg'
      ? 'w-14 h-20'
      : size === 'sm'
        ? 'w-8 h-12'
        : 'w-11 h-16';
  const emojiSize =
    size === 'lg' ? 14 : size === 'sm' ? 12 : 13;

  return (
    <svg
      viewBox="0 0 64 96"
      className={`${dims} shrink-0 drop-shadow-sm select-none`}
      aria-hidden="true"
    >
      {/* Rising warm steam wisps */}
      <path
        d="M24 14 C21 9, 27 6, 24 2"
        fill="none"
        stroke="#f3dfc1"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M39 13 C42 8, 36 5, 39 1"
        fill="none"
        stroke="#f3dfc1"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Outer glass silhouette */}
      <path
        d="M23 23 L41 23 L43 34 C48 40, 50 45, 50 53 L50 84 C50 88.5, 46.5 92, 42 92 L22 92 C17.5 92, 14 88.5, 14 84 L14 53 C14 45, 16 40, 21 34 Z"
        fill={drink.bottleColor}
        stroke="rgba(44, 37, 29, 0.25)"
        strokeWidth="2.2"
      />

      {/* Bottle cap & folded paper hood */}
      <rect
        x="21"
        y="17"
        width="22"
        height="7.5"
        rx="3"
        fill={drink.capColor}
        stroke="rgba(44, 37, 29, 0.28)"
        strokeWidth="1.6"
      />
      <rect
        x="23"
        y="24.5"
        width="18"
        height="3.5"
        rx="1.5"
        fill="#fff8ec"
        opacity="0.85"
      />

      {/* White paper label band */}
      <rect
        x="15.5"
        y="50"
        width="33"
        height="26"
        rx="3"
        fill="#fffcf6"
        opacity="0.93"
        stroke="rgba(44, 37, 29, 0.14)"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y="65"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={emojiSize}
      >
        {DRINK_EMOJI[drink.id]}
      </text>

      {/* Glass specular highlight */}
      <path
        d="M20 44 C18.5 52, 18.5 72, 20 83"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

interface MilkVendingModalProps {
  isNight: boolean;
  kneadCount: number;
  nearbyVendingTarget?: MilkSocialTarget | null;
  onPullHoldMilk: (drink: MilkDrinkOption) => void;
  onRequestMilkFromPeer?: (drink: MilkDrinkOption) => void;
  onClose: () => void;
}

export function MilkVendingModal({
  isNight,
  kneadCount,
  nearbyVendingTarget = null,
  onPullHoldMilk,
  onRequestMilkFromPeer,
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
        className={`w-full max-w-sm rounded-2xl p-4 sm:p-5 border shadow-2xl ${surfaceCls}`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <Milk className="w-4 h-4 text-[#d9842b] shrink-0" aria-hidden="true" />
            <h2 id="milk-vending-title" className="text-base font-semibold truncate">
              따뜻한 병우유 자판기
            </h2>
            <span
              data-testid="knead-progress-text"
              className="rounded-full bg-[#d9842b]/15 text-[#d9842b] px-2 py-0.5 text-[10px] font-semibold tabular-nums shrink-0"
              title="오늘 꾹꾹이 · 그루밍 한 횟수"
            >
              🐾 {kneadCount}회
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="병우유 자판기 닫기"
            className="rounded-lg p-1.5 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs opacity-75 mb-3">
          원하는 따뜻한 병우유를 골라 두 앞발로 뽑아 들어보세요.
        </p>

        {/* 4 Drink Selector */}
        <div
          role="radiogroup"
          aria-label="병우유 종류 선택"
          className="grid grid-cols-2 gap-2 mb-3"
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
                className={`flex items-center gap-2.5 rounded-xl p-2 border text-left cursor-pointer transition-colors ${
                  active
                    ? isNight
                      ? 'bg-[#ff9e3b]/20 border-[#ff9e3b] text-[#ffe8c8]'
                      : 'bg-[#f8ead4] border-[#d9842b] text-[#2c251d]'
                    : isNight
                      ? 'border-white/12 hover:bg-white/8'
                      : 'border-[#2c251d]/12 hover:bg-black/5'
                }`}
              >
                <MilkBottleIllustration drink={drink} size="sm" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold truncate">
                    {drink.label}
                  </span>
                  <span className="block text-[10px] opacity-70 truncate">
                    따뜻한 병우유
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] opacity-75 mb-3 px-0.5">
          {selectedDrink.desc}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="pull-self-milk-btn"
            onClick={() => onPullHoldMilk(selectedDrink)}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-2.5 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] cursor-pointer transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>🍼 따뜻한 {selectedDrink.label} 뽑기</span>
          </button>

          {nearbyVendingTarget && onRequestMilkFromPeer && (
            <button
              type="button"
              data-testid="request-milk-vending-btn"
              onClick={() => onRequestMilkFromPeer(selectedDrink)}
              className={`flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-2 text-xs font-semibold border cursor-pointer transition-colors ${
                isNight
                  ? 'bg-[#4f77a8]/25 border-[#8ebeff]/45 text-[#dcebff] hover:bg-[#4f77a8]/35'
                  : 'bg-[#eaf2fc] border-[#7aa8de] text-[#1f4268] hover:bg-[#dceafb]'
              }`}
            >
              <HandHeart className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                🥺 {nearbyVendingTarget.name}에게 {selectedDrink.label} 조르기
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
