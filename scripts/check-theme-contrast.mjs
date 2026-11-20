#!/usr/bin/env node
// scripts/check-theme-contrast.mjs
//
// Guards one invariant: anything painted with the brand colour must state its text
// colour as var(--brand-contrast).
//
// Why this exists. A button styled `background: active ? 'var(--primary)' : ...` with
// no `color` inherits --text, which is near-white in every dark theme. That looks
// correct in the four themes whose --brand-contrast IS white, and unreadable in the
// ones where the brand colour is light (jersey: eggshell button, white label). The bug
// is invisible in source, invisible in the default theme, and spreads by copy-paste:
// 35 sites had it before this check, including one added by someone reading a
// neighbouring broken site as the example.
//
// Read-only, local files only, no network. Runs in the build, so a new occurrence
// fails before it ships rather than being found by eye in one theme months later.
//
// Opt out on a genuine exception with a comment inside or just above the style object:
//     /* theme-contrast-exempt: <reason> */
// Use it for brand-coloured things that carry no text (dots, bars, swatches).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const CSS = join(SRC, 'styles.css')
const WCAG_AA = 4.5

const BRAND_BG = /background(?:Color)?:\s*[^,}]*\?\s*'var\(--(?:primary|brand-blue)\)'/
const EXEMPT = /theme-contrast-exempt/
const HARDCODED = /color:\s*[^,}?]*\?\s*'(?:#fff|#ffffff|#FFF|#FFFFFF|white)'/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** The {...} literal surrounding `pos`. */
function enclosingObject(txt, pos) {
  let depth = 0, i = pos
  for (; i >= 0; i--) {
    if (txt[i] === '}') depth++
    else if (txt[i] === '{') {
      if (depth === 0) break
      depth--
    }
  }
  const start = i
  depth = 0
  let j = start
  for (; j < txt.length; j++) {
    if (txt[j] === '{') depth++
    else if (txt[j] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return { body: txt.slice(start + 1, j), start, end: j }
}

const failures = []

// ---------------------------------------------------------------------------
// 1. Inline brand backgrounds must name their text colour
// ---------------------------------------------------------------------------
for (const file of walk(SRC)) {
  const txt = readFileSync(file, 'utf8')
  const rx = new RegExp(BRAND_BG.source, 'g')
  let m
  while ((m = rx.exec(txt)) !== null) {
    const { body, start } = enclosingObject(txt, m.index)
    const line = txt.slice(0, m.index).split('\n').length
    // the object itself, plus the few lines above it, so a comment can sit either place
    const preamble = txt.slice(Math.max(0, start - 200), start)
    if (EXEMPT.test(body) || EXEMPT.test(preamble)) continue

    const where = `${relative(ROOT, file)}:${line}`
    if (HARDCODED.test(body)) {
      failures.push(`${where}  active label is a hardcoded white, not var(--brand-contrast)`)
    } else if (!/color:/.test(body)) {
      failures.push(`${where}  brand background with no color: the label inherits --text`)
    } else if (!/var\(--brand-contrast\)/.test(body)) {
      failures.push(`${where}  brand background whose color: is not var(--brand-contrast)`)
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Every theme must define --brand-contrast, and we report how legible it is
// ---------------------------------------------------------------------------
const css = readFileSync(CSS, 'utf8')
const warnings = []

const relLum = (hex) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  if (full.length !== 6) return null
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
const ratio = (a, b) => {
  const la = relLum(a), lb = relLum(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

for (const block of css.matchAll(/(:root|html\[data-theme="[^"]+"\])\s*\{([^}]*)\}/g)) {
  const [, selector, body] = block
  const get = (name) => body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
  const primary = get('primary')
  const contrast = get('brand-contrast')
  if (!primary) continue
  if (!contrast) {
    failures.push(`src/styles.css  theme ${selector} sets --primary but no --brand-contrast`)
    continue
  }
  const r = ratio(primary, contrast)
  if (r !== null && r < WCAG_AA) {
    warnings.push(`${selector}  --primary ${primary} on --brand-contrast ${contrast} = ${r.toFixed(2)}:1 (AA wants ${WCAG_AA}:1)`)
  }
}

// ---------------------------------------------------------------------------
if (warnings.length) {
  console.log('theme contrast warnings (not failing the build):')
  for (const w of warnings) console.log(`  ${w}`)
  console.log('')
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} brand-coloured element(s) without var(--brand-contrast)\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nSet color to var(--brand-contrast) on the active state, or, if the element')
  console.error('carries no text, mark it /* theme-contrast-exempt: <reason> */.')
  process.exit(1)
}

console.log('OK: every brand-coloured element names var(--brand-contrast).')
