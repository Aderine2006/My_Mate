import React, { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CelebrationScenario =
  | 'all_tasks_complete'   // Full premium — Phase B
  | 'single_task'          // Micro check — Phase A
  | 'first_ever_task'      // First achievement — Phase C
  | 'streak_milestone'     // Streak flame — Phase D
  | 'major_goal';          // Trophy reveal — Phase E

export interface CelebrationStats {
  completedCount: number;
  totalCount: number;
  completionPct: number;
  streakDays?: number;
  streakMilestone?: number;
  goalTitle?: string;
}

interface Props {
  show: boolean;
  scenario: CelebrationScenario;
  stats: CelebrationStats;
  userName?: string;
  onDismiss: () => void;
  /** Extra key so parent can force-remount on each new celebration */
  animKey?: number;
}

// ─── Brand tokens ────────────────────────────────────────────────────────────

const BRAND = {
  blue:   '#315EFB',
  purple: '#7857E8',
  pink:   '#EC4899',
  orange: '#F97316',
  gold:   '#F59E0B',
  white:  '#FFFFFF',
};

const PALETTE = [
  BRAND.blue, BRAND.purple, BRAND.pink, BRAND.orange, BRAND.gold,
  '#60A5FA', '#A78BFA', '#F472B6', '#34D399', BRAND.white,
];

// ─── Particle shapes ──────────────────────────────────────────────────────────

type Shape = 'circle' | 'rect' | 'star' | 'triangle';

interface Particle {
  id: number;
  x: number;          // start %, centre
  y: number;          // start %, centre
  vx: number;         // velocity px/frame
  vy: number;
  gravity: number;
  size: number;
  color: string;
  shape: Shape;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  fade: number;
  life: number;
  maxLife: number;
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function makeParticle(id: number, cx: number, cy: number): Particle {
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(4, 14);
  const shapes: Shape[] = ['circle', 'rect', 'star', 'triangle'];
  return {
    id,
    x: cx,
    y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - randomBetween(3, 8), // upward bias
    gravity: randomBetween(0.18, 0.35),
    size: randomBetween(5, 14),
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    rotation: randomBetween(0, 360),
    rotationSpeed: randomBetween(-6, 6),
    opacity: 1,
    fade: randomBetween(0.008, 0.018),
    life: 0,
    maxLife: randomBetween(120, 220),
  };
}

// ─── Canvas Confetti ──────────────────────────────────────────────────────────

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const spikes = 5;
  const inner = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = ((i * Math.PI) / spikes) - Math.PI / 2;
    const dist = i % 2 === 0 ? r : inner;
    ctx.lineTo(cx + Math.cos(rad) * dist, cy + Math.sin(rad) * dist);
  }
  ctx.closePath();
}

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
  ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
  ctx.closePath();
}

interface CanvasConfettiProps {
  active: boolean;
  reducedMotion: boolean;
}

const CanvasConfetti: React.FC<CanvasConfettiProps> = ({ active, reducedMotion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const spawnedRef = useRef(false);

  const spawnBurst = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.52;
    const count = reducedMotion ? 0 : 140;
    const next: Particle[] = [];
    for (let i = 0; i < count; i++) {
      next.push(makeParticle(Date.now() + i, cx, cy));
    }
    particlesRef.current = next;
  }, [reducedMotion]);

  useEffect(() => {
    if (!active || reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill window
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Spawn initial burst after short delay
    const spawnTimer = setTimeout(() => {
      if (!spawnedRef.current) {
        spawnedRef.current = true;
        spawnBurst();
        // Second smaller wave
        setTimeout(spawnBurst, 500);
      }
    }, 320);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alive: Particle[] = [];

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.life++;
        p.opacity = Math.max(0, 1 - p.life / p.maxLife);

        if (p.opacity <= 0 || p.y > canvas.height + 60) continue;
        alive.push(p);

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        switch (p.shape) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'rect':
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;
          case 'star':
            drawStar(ctx, 0, 0, p.size / 2);
            ctx.fill();
            break;
          case 'triangle':
            drawTriangle(ctx, 0, 0, p.size / 2);
            ctx.fill();
            break;
        }
        ctx.restore();
      }
      particlesRef.current = alive;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(spawnTimer);
      window.removeEventListener('resize', resize);
      particlesRef.current = [];
      spawnedRef.current = false;
    };
  }, [active, reducedMotion, spawnBurst]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
      }}
      aria-hidden="true"
    />
  );
};

// ─── SVG Success Ring ─────────────────────────────────────────────────────────

const SuccessRing: React.FC<{ phase: number; reducedMotion: boolean }> = ({ phase, reducedMotion }) => {
  const circumference = 2 * Math.PI * 44;
  const drawPct = phase >= 1 ? 1 : 0;

  return (
    <div style={{ position: 'relative', width: 108, height: 108 }}>
      {/* Glow halo */}
      <div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(49,94,251,0.28) 0%, transparent 72%)',
          opacity: phase >= 1 ? 1 : 0,
          transition: reducedMotion ? 'none' : 'opacity 0.4s ease',
        }}
        aria-hidden="true"
      />

      <svg width={108} height={108} viewBox="0 0 108 108" aria-hidden="true">
        {/* Track */}
        <circle cx={54} cy={54} r={44} fill="none" stroke="rgba(49,94,251,0.12)" strokeWidth={5} />

        {/* Animated ring */}
        <circle
          cx={54} cy={54} r={44}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={reducedMotion ? 0 : circumference * (1 - drawPct)}
          transform="rotate(-90 54 54)"
          style={{
            transition: reducedMotion ? 'none' : `stroke-dashoffset ${phase >= 1 ? 0.55 : 0}s cubic-bezier(0.32,0,0.67,0)`,
          }}
        />

        {/* Gradient def */}
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={BRAND.blue} />
            <stop offset="50%"  stopColor={BRAND.purple} />
            <stop offset="100%" stopColor={BRAND.pink} />
          </linearGradient>
        </defs>

        {/* Checkmark (phase ≥1) */}
        <g
          transform="translate(54,54)"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: `translate(54px,54px) scale(${phase >= 1 ? 1 : 0.4})`,
            transition: reducedMotion ? 'none' : 'opacity 0.25s 0.45s ease, transform 0.35s 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <polyline
            points="-14,0 -4,11 15,-12"
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
};

// ─── Sparkle dots ─────────────────────────────────────────────────────────────

const Sparkles: React.FC<{ phase: number; reducedMotion: boolean }> = ({ phase, reducedMotion }) => {
  if (reducedMotion || phase < 2) return null;

  const sparks = [
    { angle: 0,   r: 68, delay: 0 },
    { angle: 60,  r: 72, delay: 0.06 },
    { angle: 120, r: 65, delay: 0.12 },
    { angle: 180, r: 70, delay: 0.04 },
    { angle: 240, r: 68, delay: 0.10 },
    { angle: 300, r: 74, delay: 0.08 },
  ];

  return (
    <div
      style={{ position: 'absolute', width: 108, height: 108, inset: 0, margin: 'auto' }}
      aria-hidden="true"
    >
      {sparks.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const cx = 54 + Math.cos(rad) * s.r;
        const cy = 54 + Math.sin(rad) * s.r;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx - 3,
              top: cy - 3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: PALETTE[i % PALETTE.length],
              animation: `mmSparkle 0.7s ${s.delay}s ease-out forwards`,
            }}
          />
        );
      })}
    </div>
  );
};

// ─── Micro-task check (Scenario A) ────────────────────────────────────────────

export const MicroCheck: React.FC<{ show: boolean }> = ({ show }) => {
  const reduced = useReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.92)',
        transition: reduced ? 'opacity 0.15s' : 'opacity 0.25s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(49,94,251,0.18)',
          borderRadius: 14,
          boxShadow: '0 4px 24px rgba(49,94,251,0.14), 0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #315EFB, #7857E8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <polyline points="2,7 5.5,11 12,3" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#17233C', letterSpacing: '-0.01em' }}>
          Task complete
        </span>
      </div>
    </div>
  );
};

// ─── Reduced-motion hook ──────────────────────────────────────────────────────

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

// ─── Full Celebration Overlay ─────────────────────────────────────────────────

const CelebrationOverlay: React.FC<Props> = ({
  show,
  scenario,
  stats,
  userName,
  onDismiss,
  animKey = 0,
}) => {
  const reducedMotion = useReducedMotion();

  // Phase: 0=hidden, 1=ring+check, 2=achievement, 3=stats, 4=sparkle
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);

  // Reset and drive phase timeline when show toggles
  useEffect(() => {
    if (!show) {
      // Fade out
      setPhase(0);
      const t = setTimeout(() => setVisible(false), 350);
      return () => clearTimeout(t);
    }

    setVisible(true);
    setPhase(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reducedMotion) {
      // Skip straight to final state
      setPhase(4);
    } else {
      timers.push(setTimeout(() => setPhase(1), 60));    // ring
      timers.push(setTimeout(() => setPhase(2), 600));   // achievement text
      timers.push(setTimeout(() => setPhase(3), 900));   // stats
      timers.push(setTimeout(() => setPhase(4), 1300));  // sparkle burst
    }
    return () => timers.forEach(clearTimeout);
  }, [show, animKey, reducedMotion]);

  // Keyboard dismiss
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, onDismiss]);

  if (!visible && !show) return null;

  // ─── Scenario-specific content ───────────────────────────────────────────

  const heading = (() => {
    switch (scenario) {
      case 'first_ever_task':  return 'First step taken! 🌱';
      case 'streak_milestone': return `${stats.streakMilestone}-Day Streak!`;
      case 'major_goal':       return 'Goal Achieved!';
      default:                 return 'Amazing work!';
    }
  })();

  const subtext = (() => {
    switch (scenario) {
      case 'first_ever_task':
        return 'Every great journey begins with a single task. Keep going!';
      case 'streak_milestone':
        return `You've been consistent for ${stats.streakMilestone} days. That's discipline in action.`;
      case 'major_goal':
        return stats.goalTitle
          ? `You've completed "${stats.goalTitle}". Incredible achievement.`
          : "You've completed a major milestone. Well done!";
      default:
        return 'You completed everything planned for today.';
    }
  })();

  const overlayOpacity = phase >= 1 || reducedMotion ? 1 : 0;

  return (
    <>
      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes mmFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mmSparkle {
          0%   { opacity: 0; transform: scale(0); }
          40%  { opacity: 1; transform: scale(1.6); }
          100% { opacity: 0; transform: scale(0.6) translateY(-8px); }
        }
        @keyframes mmPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(49,94,251,0.25); }
          50%       { box-shadow: 0 0 0 14px rgba(49,94,251,0); }
        }
        @keyframes mmFlame {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          33%       { transform: scaleY(1.08) scaleX(0.96); }
          66%       { transform: scaleY(0.95) scaleX(1.04); }
        }
        @keyframes mmCountUp {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Canvas confetti layer — full-screen, pointer-events: none */}
      <CanvasConfetti
        active={show && (scenario === 'all_tasks_complete' || scenario === 'major_goal')}
        reducedMotion={reducedMotion}
      />

      {/* Backdrop */}
      <div
        onClick={onDismiss}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: overlayOpacity,
          transition: reducedMotion ? 'none' : 'opacity 0.35s ease',
          pointerEvents: show ? 'auto' : 'none',
        }}
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          pointerEvents: show ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 440,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 28,
            border: '1px solid rgba(49,94,251,0.12)',
            boxShadow:
              '0 32px 80px rgba(49,94,251,0.14), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            padding: '36px 32px 28px',
            textAlign: 'center',
            opacity: overlayOpacity,
            transform:
              phase >= 1 || reducedMotion
                ? 'translateY(0) scale(1)'
                : 'translateY(24px) scale(0.96)',
            transition: reducedMotion
              ? 'none'
              : 'opacity 0.35s ease, transform 0.45s cubic-bezier(0.34,1.2,0.64,1)',
          }}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            aria-label="Dismiss celebration"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: 10,
              border: 'none',
              background: 'rgba(100,116,139,0.10)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              fontSize: 18,
              lineHeight: 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.10)')}
          >
            ×
          </button>

          {/* Icon zone */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 24,
              position: 'relative',
            }}
          >
            {scenario === 'streak_milestone' ? (
              // Flame icon
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F97316, #EC4899)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 44,
                  animation: reducedMotion ? 'none' : 'mmFlame 1.4s ease-in-out infinite, mmPulse 2s ease-in-out infinite',
                  boxShadow: '0 8px 32px rgba(249,115,22,0.35)',
                }}
                role="img"
                aria-label="Flame streak"
              >
                🔥
              </div>
            ) : scenario === 'major_goal' ? (
              // Trophy icon
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F59E0B, #F97316)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 44,
                  boxShadow: '0 8px 32px rgba(245,158,11,0.35)',
                  animation: reducedMotion ? 'none' : 'mmPulse 2s ease-in-out infinite',
                }}
                role="img"
                aria-label="Trophy"
              >
                🏆
              </div>
            ) : scenario === 'first_ever_task' ? (
              // Seedling icon
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #315EFB, #7857E8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 44,
                  boxShadow: '0 8px 32px rgba(49,94,251,0.3)',
                  animation: reducedMotion ? 'none' : 'mmPulse 2s ease-in-out infinite',
                }}
                role="img"
                aria-label="First task milestone"
              >
                🌱
              </div>
            ) : (
              // Success ring + check
              <div style={{ position: 'relative' }}>
                <SuccessRing phase={phase} reducedMotion={reducedMotion} />
                <Sparkles phase={phase} reducedMotion={reducedMotion} />
              </div>
            )}
          </div>

          {/* Heading */}
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 26,
              fontWeight: 800,
              color: '#17233C',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              opacity: phase >= 2 || reducedMotion ? 1 : 0,
              transform: phase >= 2 || reducedMotion ? 'translateY(0)' : 'translateY(10px)',
              transition: reducedMotion ? 'none' : 'opacity 0.4s 0.05s ease, transform 0.4s 0.05s ease',
              animation: phase >= 2 && !reducedMotion ? 'none' : undefined,
            }}
          >
            {userName ? `${heading.replace('!', ',')} ${userName.split(' ')[0]}!` : heading}
          </h2>

          {/* Subtext */}
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 14.5,
              color: '#64748B',
              lineHeight: 1.6,
              opacity: phase >= 2 || reducedMotion ? 1 : 0,
              transform: phase >= 2 || reducedMotion ? 'translateY(0)' : 'translateY(10px)',
              transition: reducedMotion ? 'none' : 'opacity 0.4s 0.12s ease, transform 0.4s 0.12s ease',
            }}
          >
            {subtext}
          </p>

          {/* Stats row */}
          {(scenario === 'all_tasks_complete' || scenario === 'major_goal') && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginBottom: 28,
                opacity: phase >= 3 || reducedMotion ? 1 : 0,
                transform: phase >= 3 || reducedMotion ? 'translateY(0)' : 'translateY(8px)',
                transition: reducedMotion ? 'none' : 'opacity 0.35s 0.08s ease, transform 0.35s 0.08s ease',
              }}
              aria-label="Completion statistics"
            >
              <StatPill
                label="Completed"
                value={`${stats.completedCount}/${stats.totalCount}`}
                color={BRAND.blue}
                animate={phase >= 3 && !reducedMotion}
              />
              <StatPill
                label="Today"
                value={`${stats.completionPct}%`}
                color={BRAND.purple}
                animate={phase >= 3 && !reducedMotion}
              />
              {typeof stats.streakDays === 'number' && stats.streakDays > 0 && (
                <StatPill
                  label="Streak"
                  value={`${stats.streakDays}d`}
                  color={BRAND.orange}
                  animate={phase >= 3 && !reducedMotion}
                />
              )}
            </div>
          )}

          {/* Gradient progress bar */}
          {(scenario === 'all_tasks_complete') && (
            <div
              style={{
                marginBottom: 28,
                opacity: phase >= 3 || reducedMotion ? 1 : 0,
                transition: reducedMotion ? 'none' : 'opacity 0.3s 0.15s ease',
              }}
              aria-hidden="true"
            >
              <div
                style={{
                  height: 6,
                  background: '#F1F5F9',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: phase >= 3 || reducedMotion ? '100%' : '0%',
                    background: 'linear-gradient(90deg, #315EFB, #7857E8, #EC4899)',
                    borderRadius: 99,
                    transition: reducedMotion ? 'none' : 'width 0.7s 0.2s cubic-bezier(0.16,1,0.3,1)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 11,
                  color: '#94A3B8',
                  fontWeight: 500,
                }}
              >
                <span>Daily Progress</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* CTA button */}
          <button
            onClick={onDismiss}
            style={{
              width: '100%',
              padding: '13px 0',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #315EFB, #7857E8, #EC4899)',
              backgroundSize: '200% 100%',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              transition: 'opacity 0.15s, transform 0.15s',
              opacity: phase >= 2 || reducedMotion ? 1 : 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.015)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.99)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1.015)')}
          >
            Continue →
          </button>

          {/* Subtle brand caption */}
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 11,
              color: '#94A3B8',
              letterSpacing: '0.02em',
            }}
          >
            Press <kbd style={{ fontFamily: 'inherit', background: '#F1F5F9', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>Esc</kbd> to dismiss
          </p>
        </div>
      </div>
    </>
  );
};

// ─── Stat Pill ────────────────────────────────────────────────────────────────

const StatPill: React.FC<{
  label: string;
  value: string;
  color: string;
  animate: boolean;
}> = ({ label, value, color, animate }) => (
  <div
    style={{
      flex: 1,
      padding: '12px 8px',
      background: '#F8FAFC',
      borderRadius: 14,
      border: '1px solid #E2E8F0',
      textAlign: 'center',
      animation: animate ? 'mmCountUp 0.4s ease forwards' : 'none',
    }}
  >
    <div
      style={{
        fontSize: 22,
        fontWeight: 800,
        color,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        marginBottom: 4,
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </div>
  </div>
);

export default CelebrationOverlay;
