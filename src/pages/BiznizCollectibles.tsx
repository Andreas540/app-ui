import { useEffect, useRef } from 'react'

// Ported from the standalone "Bizniz Optimizer" animated splash bundles
// (Aged Paper Blue/Green). Both source files use the "Aged paper" variant
// with a different accent color, so only `accent` is parameterized here —
// see FrontPageBiznizBlue.tsx / FrontPageBiznizGreen.tsx for the two
// registered front-page options.

const WORD = 'Collectibles'.split('')
const BIG_C_SIZE = 196
const REST_SIZE = 116
const INK = '#322a20'
const GLOW_A = '#faf3e1'
const GLOW_B = '#e2d2ad'

const STAR_PATH = 'M0,-1 L0.26,-0.30 L1,0 L0.26,0.30 L0,1 L-0.26,0.30 L-1,0 L-0.26,-0.30 Z'

interface Letter { ch: string; size: number; d: string; fill: string }

function buildLetters(accent: string): Letter[] {
  return WORD.map((ch, i) => ({
    ch,
    size: i === 0 ? BIG_C_SIZE : REST_SIZE,
    d: (1.05 + i * 0.10).toFixed(2),
    fill: i === 0 ? accent : INK,
  }))
}

export default function BiznizCollectibles({ accent, onContinue }: { accent: string; onContinue: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const letters = buildLetters(accent)

  function scheduleAutoContinue(rm: boolean) {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    // Last letter (index 11) ends at delay 2150ms + duration 640ms = 2790ms.
    // In reduced-motion mode all durations/delays collapse to ~1ms.
    const lastLetterEndMs = rm ? 1 : 2150 + 640
    timerRef.current = setTimeout(onContinue, lastLetterEndMs + 2000)
  }

  function animate() {
    const root = rootRef.current
    if (!root) return
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ms = (x: number) => (rm ? 1 : x)
    const dl = (x: number) => (rm ? 0 : x)

    root.querySelectorAll<HTMLElement>('.bzc-ink').forEach((el) => {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(22px) scale(1.16)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: ms(640), delay: dl(parseFloat(el.dataset.d || '0') * 1000), easing: 'cubic-bezier(.18,.72,.22,1)', fill: 'both' },
      )
    })

    const banner = root.querySelector<HTMLElement>('.bzc-banner')
    banner?.animate(
      [{ clipPath: 'inset(0 100% 0 -6%)' }, { clipPath: 'inset(0 -6% 0 -6%)' }],
      { duration: ms(1000), delay: dl(250), easing: 'cubic-bezier(.42,0,.08,1)', fill: 'both' },
    )

    const rule = root.querySelector<HTMLElement>('.bzc-rule')
    rule?.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: ms(850), delay: dl(180), easing: 'cubic-bezier(.42,0,.08,1)', fill: 'both' },
    )

    root.querySelectorAll<HTMLElement>('.bzc-star').forEach((el) => {
      el.animate(
        [
          { opacity: 0, transform: 'scale(0) rotate(-45deg)' },
          { opacity: 1, transform: 'scale(1) rotate(0)' },
        ],
        { duration: ms(550), delay: dl(parseFloat(el.dataset.sd || '0') * 1000), easing: 'cubic-bezier(.2,1.55,.4,1)', fill: 'both' },
      )
    })

    scheduleAutoContinue(rm)
  }

  function restart() {
    const root = rootRef.current
    if (!root) return
    root.getAnimations({ subtree: true }).forEach((a) => a.cancel())
    animate()
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const fit = () => {
      const k = Math.min(window.innerWidth / 1200, window.innerHeight / 800)
      root?.querySelector<HTMLElement>('.bzc-stage')?.style.setProperty('--k', String(k))
    }
    fit()
    window.addEventListener('resize', fit)
    const raf = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener('resize', fit)
      cancelAnimationFrame(raf)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={rootRef}
      onClick={restart}
      title="Tap to replay"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        background: `radial-gradient(circle at 50% 44%, ${GLOW_A}, ${GLOW_B})`,
      }}
    >
      <style>{`
        @font-face {
          font-family: 'Bodoni Moda';
          font-style: normal;
          font-weight: 400 700;
          font-display: swap;
          src: url('/fonts/bodoni-moda-latin-600.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        @font-face {
          font-family: 'Cinzel';
          font-style: normal;
          font-weight: 600;
          font-display: swap;
          src: url('/fonts/cinzel-latin-600.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
      `}</style>

      <div className="bzc-stage" style={{ position: 'relative', flex: 'none', width: 1200, height: 800, transformOrigin: 'center center', transform: 'scale(var(--k, 0.85))' }}>
        <svg viewBox="0 0 1200 800" style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 800, overflow: 'visible' }}>
          <g transform="translate(300 142) scale(11)">
            <path className="bzc-star" data-sd="0.05" d={STAR_PATH} fill={accent} style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: 'center' }} />
          </g>
          <g transform="translate(900 142) scale(11)">
            <path className="bzc-star" data-sd="0.18" d={STAR_PATH} fill={accent} style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: 'center' }} />
          </g>
        </svg>

        <div
          className="bzc-banner"
          style={{
            position: 'absolute', left: 600, top: 142, transform: 'translate(-50%,-50%)',
            fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 40, letterSpacing: 9,
            whiteSpace: 'nowrap', color: accent, clipPath: 'inset(0 100% 0 -6%)',
          }}
        >
          BIZNIZ OPTIMIZER
        </div>
        <div className="bzc-rule" style={{ position: 'absolute', left: 455, top: 180, width: 290, height: 2.6, borderRadius: 2, background: accent, transform: 'scaleX(0)', transformOrigin: 'center' }} />

        <div style={{ position: 'absolute', left: 0, top: 430, width: 1200, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', alignItems: 'baseline', fontFamily: "'Bodoni Moda', serif", fontWeight: 600, lineHeight: 1, letterSpacing: 1 }}>
          {letters.map((l, i) => (
            <span
              key={i}
              className="bzc-ink"
              data-d={l.d}
              style={{ display: 'inline-block', fontSize: l.size, color: l.fill, opacity: 0, willChange: 'opacity, transform' }}
            >
              {l.ch}
            </span>
          ))}
        </div>
      </div>

      <button
        className="primary"
        onClick={(e) => { e.stopPropagation(); onContinue() }}
        style={{ position: 'absolute', bottom: 40, height: 40, padding: '0 24px' }}
      >
        Continue to app
      </button>
    </div>
  )
}
