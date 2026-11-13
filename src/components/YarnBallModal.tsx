import { useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface YarnBallModalProps {
  isNight: boolean;
  count: number;
  onIncrement: () => void;
  onReset: () => void;
  onClose: () => void;
}

const SPIN_RADIANS_PER_COUNT = 0.9;

export function YarnBallModal({
  isNight,
  count,
  onIncrement,
  onReset,
  onClose,
}: YarnBallModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ rx: 0.35, ry: 0.2, vx: 0, vy: 0 });
  const spinAccumRef = useRef(0);
  const draggingRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  const onIncrementRef = useRef(onIncrement);
  onIncrementRef.current = onIncrement;
  const countRef = useRef(count);
  countRef.current = count;

  const [isDragging, setIsDragging] = useState(false);

  // Keyboard Escape to close
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

  // Procedural 3D-projected wool yarn ball canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let rafId = 0;

    const strandAngles = [
      { tilt: 0.25, roll: 0.0, color: '#d87f3d' },
      { tilt: 0.72, roll: 0.55, color: '#e59a54' },
      { tilt: -0.58, roll: 1.05, color: '#c46a2c' },
      { tilt: 1.15, roll: 1.65, color: '#eab070' },
      { tilt: -0.95, roll: 2.2, color: '#cc7234' },
      { tilt: 0.45, roll: 2.75, color: '#df8c48' },
      { tilt: -0.25, roll: 3.3, color: '#b96027' },
    ];

    const draw = () => {
      const rot = rotRef.current;
      rot.rx += rot.vx;
      rot.ry += rot.vy;
      rot.vx *= 0.9;
      rot.vy *= 0.9;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2 - 4;
      const radius = 78;

      // Ground soft shadow
      const shadowGrad = ctx.createRadialGradient(cx, cy + radius + 8, 8, cx, cy + radius + 8, radius * 0.92);
      shadowGrad.addColorStop(0, 'rgba(20, 16, 12, 0.28)');
      shadowGrad.addColorStop(1, 'rgba(20, 16, 12, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius + 6, radius * 0.85, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Base wool sphere gradient
      const baseGrad = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.12,
        cx,
        cy,
        radius,
      );
      baseGrad.addColorStop(0, '#f3bf84');
      baseGrad.addColorStop(0.55, '#d67c3a');
      baseGrad.addColorStop(1, '#8c441a');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = baseGrad;
      ctx.fill();

      // Clip wound yarn strands inside sphere silhouette
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.clip();

      for (let sIdx = 0; sIdx < strandAngles.length; sIdx++) {
        const s = strandAngles[sIdx];
        for (let band = -2; band <= 2; band++) {
          const bandOffset = band * 0.28;
          ctx.beginPath();
          let started = false;

          for (let a = 0; a <= Math.PI * 2 + 0.15; a += 0.12) {
            const p0x = Math.cos(a) * Math.cos(bandOffset) * radius;
            const p0y = Math.sin(bandOffset) * radius;
            const p0z = Math.sin(a) * Math.cos(bandOffset) * radius;

            // Tilt around Z + rotate by interactive spin
            const c1 = Math.cos(s.tilt);
            const s1 = Math.sin(s.tilt);
            const x1 = p0x * c1 - p0y * s1;
            const y1 = p0x * s1 + p0y * c1;
            const z1 = p0z;

            const cyRot = Math.cos(rot.ry + s.roll);
            const syRot = Math.sin(rot.ry + s.roll);
            const x2 = x1 * cyRot + z1 * syRot;
            const z2 = -x1 * syRot + z1 * cyRot;

            const cxRot = Math.cos(rot.rx);
            const sxRot = Math.sin(rot.rx);
            const y3 = y1 * cxRot - z2 * sxRot;
            const z3 = y1 * sxRot + z2 * cxRot;

            if (z3 >= -6) {
              const px = cx + x2;
              const py = cy + y3;
              if (!started) {
                ctx.moveTo(px, py);
                started = true;
              } else {
                ctx.lineTo(px, py);
              }
            } else {
              started = false;
            }
          }

          ctx.strokeStyle = s.color;
          ctx.lineWidth = 6.2;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 240, 215, 0.22)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      }
      ctx.restore();

      // Subtle trailing loose yarn tail at bottom right
      ctx.beginPath();
      ctx.moveTo(cx + radius * 0.52, cy + radius * 0.72);
      ctx.quadraticCurveTo(
        cx + radius * 0.92,
        cy + radius * 0.96,
        cx + radius * 1.12,
        cy + radius * 0.78 + Math.sin(rot.ry * 2) * 8,
      );
      ctx.strokeStyle = '#d87f3d';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const addSpinDelta = (dx: number, dy: number) => {
    const rot = rotRef.current;
    rot.vy += dx * 0.008;
    rot.vx += dy * 0.008;
    const dist = Math.hypot(dx, dy) * 0.015;
    spinAccumRef.current += dist;
    while (spinAccumRef.current >= SPIN_RADIANS_PER_COUNT) {
      spinAccumRef.current -= SPIN_RADIANS_PER_COUNT;
      if (countRef.current < 108) {
        onIncrementRef.current();
      }
    }
  };

  const surfaceCls = isNight
    ? 'bg-[#1a2030] border-white/15 text-[#f4eee3]'
    : 'bg-[#fcfaf5] border-[#2c251d]/15 text-[#2c251d]';

  const pct = Math.min(100, Math.round((count / 108) * 100));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="yarn-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
    >
      <div className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl ${surfaceCls}`}>
        <div className="flex items-center justify-between mb-2">
          <h2 id="yarn-modal-title" className="text-base font-semibold">
            털실 뭉치 굴리기
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="털실 모달 닫기"
            className="rounded-lg p-1.5 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs opacity-75 mb-3">
          마우스 휠을 굴리거나 털실을 드래그해 108번 포근하게 감아보세요.
        </p>

        <div className="flex flex-col items-center">
          <canvas
            ref={canvasRef}
            data-testid="yarn-ball-canvas"
            onPointerDown={(e) => {
              draggingRef.current = { active: true, x: e.clientX, y: e.clientY };
              setIsDragging(true);
              (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current.active) return;
              const dx = e.clientX - draggingRef.current.x;
              const dy = e.clientY - draggingRef.current.y;
              draggingRef.current.x = e.clientX;
              draggingRef.current.y = e.clientY;
              addSpinDelta(dx, dy);
            }}
            onPointerUp={() => {
              draggingRef.current.active = false;
              setIsDragging(false);
            }}
            onPointerCancel={() => {
              draggingRef.current.active = false;
              setIsDragging(false);
            }}
            onWheel={(e) => {
              e.stopPropagation();
              addSpinDelta(e.deltaX * 0.45, e.deltaY * 0.65);
            }}
            className={`w-[220px] h-[220px] touch-none select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          />

          <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
            <span data-testid="yarn-count-value" className="text-2xl font-bold text-[#d9842b]">
              {count}
            </span>
            <span className="text-xs opacity-70">/ 108</span>
          </div>

          <div
            className={`w-full h-2 rounded-full mt-2 overflow-hidden ${
              isNight ? 'bg-white/10' : 'bg-[#2c251d]/10'
            }`}
          >
            <div
              className="h-full bg-[#d9842b] transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="mt-2 min-h-[1.25rem] text-xs font-medium text-center opacity-85">
            {count >= 108
              ? '108바퀴 굴리기 완료 · 마음의 실타래가 포근히 풀렸어요.'
              : '드래그 · 휠 스크롤로 돌돌 굴리기'}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReset}
            className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium cursor-pointer border ${
              isNight
                ? 'border-white/15 hover:bg-white/10'
                : 'border-[#2c251d]/15 hover:bg-black/5'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>초기화</span>
          </button>

          <button
            type="button"
            onClick={() => addSpinDelta(45, 45)}
            disabled={count >= 108}
            className="rounded-xl px-4 py-2 text-xs font-semibold bg-[#d9842b] text-white hover:bg-[#c47422] disabled:opacity-50 cursor-pointer"
          >
            한 바퀴 굴리기
          </button>
        </div>
      </div>
    </div>
  );
}
