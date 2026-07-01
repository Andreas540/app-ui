import { useEffect, useRef } from 'react'

const POOL_BLUE = '#12a3d6'
const DARK_BLUE = '#0e5f86'
const WHITE = '#ffffff'

const WORDS_RAW = ['Pool', '&', 'Spa', 'Service']
const BIG = 132
const REST = 100

interface Letter { ch: string; size: number; strokeW: string; d: string }
interface Word { letters: Letter[] }

function buildWords(): Word[] {
  let di = 0
  return WORDS_RAW.map(word => ({
    letters: word.split('').map((ch, i) => {
      const isInitial = i === 0 && /[A-Za-z]/.test(ch)
      const d = (1.05 + di * 0.07).toFixed(3)
      di++
      return { ch, size: isInitial ? BIG : REST, strokeW: isInitial ? '2.4px' : '2px', d }
    }),
  }))
}

function buildSparkles() {
  let seed = 7
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  return Array.from({ length: 18 }, () => ({
    x: Math.round(rnd() * 1160 + 20),
    y: Math.round(rnd() * 760 + 20),
    sz: Math.round(rnd() * 22 + 12),
    dur: Math.round(rnd() * 2600 + 2200),
    d: Math.round(rnd() * 3400),
  }))
}

const WORDS = buildWords()
const SPARKLES = buildSparkles()
// Last letter (Service 'e', di=14) delay = 2030ms, duration = 620ms → ends at 2650ms
const LAST_LETTER_END_MS = 2650

export default function PoolAndSpa({ onContinue }: { onContinue: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fit() {
    const root = rootRef.current
    if (!root) return
    const k = Math.min(window.innerWidth / 1200, window.innerHeight / 800)
    root.querySelector<HTMLElement>('.psa-stage')?.style.setProperty('--k', String(k))
    const title = titleRef.current
    if (title) {
      title.style.transform = 'none'
      const w = title.offsetWidth
      title.style.transform = `scale(${Math.min(1, 1150 / (w || 1))})`
    }
  }

  function animate() {
    const root = rootRef.current
    if (!root) return
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ms = (x: number) => (rm ? 1 : x)
    const dl = (x: number) => (rm ? 0 : x)

    root.querySelectorAll<HTMLElement>('.psa-ink').forEach(el => {
      el.animate(
        [{ opacity: 0, transform: 'translateY(20px) scale(1.14)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: ms(620), delay: dl(parseFloat(el.dataset.d || '0') * 1000), easing: 'cubic-bezier(.18,.72,.22,1)', fill: 'both' },
      )
    })

    root.querySelector<HTMLElement>('.psa-banner')?.animate(
      [{ clipPath: 'inset(0 100% 0 -6%)' }, { clipPath: 'inset(0 -6% 0 -6%)' }],
      { duration: ms(1000), delay: dl(250), easing: 'cubic-bezier(.42,0,.08,1)', fill: 'both' },
    )
    root.querySelector<HTMLElement>('.psa-rule')?.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: ms(850), delay: dl(180), easing: 'cubic-bezier(.42,0,.08,1)', fill: 'both' },
    )

    if (!rm) {
      root.querySelector<HTMLElement>('.psa-caustic1')?.animate(
        [{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(40%,30%) scale(1.25)' }, { transform: 'translate(0,0) scale(1)' }],
        { duration: 14000, iterations: Infinity, easing: 'ease-in-out' },
      )
      root.querySelector<HTMLElement>('.psa-caustic2')?.animate(
        [{ transform: 'translate(0,0) scale(1.1)' }, { transform: 'translate(-35%,-25%) scale(1)' }, { transform: 'translate(0,0) scale(1.1)' }],
        { duration: 18000, iterations: Infinity, easing: 'ease-in-out' },
      )
    }

    root.querySelectorAll<HTMLElement>('.psa-sparkle').forEach(el => {
      const dur = parseFloat(el.dataset.dur || '2600')
      const delay = parseFloat(el.dataset.d || '0')
      el.animate(
        [
          { opacity: 0, transform: 'scale(0.2) rotate(0deg)' },
          { opacity: 0.95, transform: 'scale(1) rotate(35deg)' },
          { opacity: 0, transform: 'scale(0.2) rotate(70deg)' },
        ],
        { duration: rm ? 1 : dur, delay: rm ? 0 : delay, iterations: rm ? 1 : Infinity, easing: 'ease-in-out' },
      )
    })

    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onContinue, (rm ? 1 : LAST_LETTER_END_MS) + 2000)
  }

  function restart() {
    const root = rootRef.current
    if (!root) return
    root.getAnimations({ subtree: true }).forEach(a => a.cancel())
    animate()
  }

  useEffect(() => {
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
        backgroundColor: POOL_BLUE,
        backgroundImage: 'url(/img/pool-spa-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'Baloo 2';
          font-style: normal;
          font-weight: 700;
          font-display: swap;
          src: url('/fonts/baloo2-latin-700.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }
        .psa-banner { -webkit-text-stroke: 1.4px ${DARK_BLUE}; paint-order: stroke fill; }
        .psa-ink    { -webkit-text-stroke: var(--psa-sw, 2px) ${DARK_BLUE}; paint-order: stroke fill; }
      `}</style>

      <div className="psa-caustic1" style={{
        position: 'absolute', left: '-20%', top: '-20%', width: '70%', height: '70%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.32), rgba(255,255,255,0) 62%)',
        mixBlendMode: 'screen', filter: 'blur(8px)', pointerEvents: 'none',
      }} />
      <div className="psa-caustic2" style={{
        position: 'absolute', right: '-15%', bottom: '-15%', width: '80%', height: '80%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(210,245,255,0.28), rgba(255,255,255,0) 60%)',
        mixBlendMode: 'screen', filter: 'blur(10px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(8,70,110,0.12), rgba(8,70,110,0) 30%, rgba(8,70,110,0) 68%, rgba(8,70,110,0.18))',
      }} />

      <div className="psa-stage" style={{
        position: 'relative', flex: 'none', width: 1200, height: 800,
        transformOrigin: 'center center', transform: 'scale(var(--k, 0.85))',
      }}>
        {SPARKLES.map((s, i) => (
          <svg
            key={i}
            className="psa-sparkle"
            data-d={String(s.d)}
            data-dur={String(s.dur)}
            width={s.sz} height={s.sz}
            viewBox="0 0 24 24"
            style={{ position: 'absolute', left: s.x, top: s.y, opacity: 0, pointerEvents: 'none', willChange: 'opacity, transform' }}
          >
            <path d="M12 0 C13 8, 16 11, 24 12 C16 13, 13 16, 12 24 C11 16, 8 13, 0 12 C8 11, 11 8, 12 0 Z" fill={WHITE} />
          </svg>
        ))}

        <div
          className="psa-banner"
          style={{
            position: 'absolute', left: 600, top: 150, transform: 'translate(-50%, -50%)',
            fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, fontSize: 38, letterSpacing: 7,
            whiteSpace: 'nowrap', color: WHITE,
            textShadow: '0 2px 10px rgba(6,50,80,0.4)',
            clipPath: 'inset(0 100% 0 -6%)',
          }}
        >
          BIZNIZ OPTIMIZER
        </div>
        <div className="psa-rule" style={{
          position: 'absolute', left: 455, top: 188, width: 290, height: 2.6,
          borderRadius: 2, background: WHITE, boxShadow: '0 1px 5px rgba(6,50,80,0.45)',
          transform: 'scaleX(0)', transformOrigin: 'center',
        }} />

        <div style={{
          position: 'absolute', left: 0, top: 440, width: 1200,
          transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center',
        }}>
          <div ref={titleRef} style={{
            display: 'flex', alignItems: 'baseline', gap: 32,
            transformOrigin: 'center', fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, lineHeight: 1,
          }}>
            {WORDS.map((word, wi) => (
              <div key={wi} style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                {word.letters.map((l, li) => (
                  <span
                    key={li}
                    className="psa-ink"
                    data-d={l.d}
                    style={{
                      display: 'inline-block', fontSize: l.size, color: WHITE,
                      textShadow: '0 3px 14px rgba(6,50,80,0.42)',
                      opacity: 0, willChange: 'opacity, transform',
                      ['--psa-sw' as string]: l.strokeW,
                    }}
                  >
                    {l.ch}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        className="primary"
        onClick={e => { e.stopPropagation(); onContinue() }}
        style={{ position: 'absolute', bottom: 40, height: 40, padding: '0 24px' }}
      >
        Continue to app
      </button>
    </div>
  )
}
