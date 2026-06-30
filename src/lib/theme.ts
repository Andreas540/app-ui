// src/lib/theme.ts
// Theme management — reads/writes localStorage and keeps <html data-theme="..."> in sync.
// Import this module early so the theme is applied before the first paint.
//
// Two independent axes: mode (dark/light) and skin (default/vintage).
// They combine into a single data-theme attribute value:
//   default + dark  -> "dark"
//   default + light -> "light"
//   vintage + dark   -> "vintage-dark"
//   vintage + light  -> "vintage-light"
// This keeps styles.css selectors simple (one [data-theme="..."] block per
// combination) while letting business-type config lock/restrict either axis
// independently — see SuperAdmin's per-business-type Theme section, which
// sets config_defaults.theme.{defaultSkin,defaultMode,selectableSkins,selectableModes}.
//
// Usage:
//   import { useTheme } from '../lib/theme'
//   const { mode, skin, setMode, setSkin, isDark, modeSelectable, skinSelectable } = useTheme()

import { useState } from 'react'
import { getTenantConfig } from './tenantConfig'

export type Mode = 'dark' | 'light'
export type Skin = 'default' | 'vintage'

const MODE_KEY = 'app-theme'
const SKIN_KEY = 'app-theme-skin'

interface ThemePolicy {
  defaultSkin: Skin
  defaultMode: Mode
  selectableSkins: Skin[]
  selectableModes: Mode[]
}

function getThemePolicy(): ThemePolicy {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}')
    return getTenantConfig(userData.tenantId).theme
  } catch {
    return { defaultSkin: 'default', defaultMode: 'dark', selectableSkins: ['default', 'vintage'], selectableModes: ['dark', 'light'] }
  }
}

function resolveValue<T extends string>(stored: T | null, def: T, selectable: T[]): T {
  if (selectable.length <= 1) return def
  if (stored && selectable.includes(stored)) return stored
  return def
}

export function getMode(): Mode {
  const policy = getThemePolicy()
  let stored: Mode | null = null
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'light' || saved === 'dark') stored = saved
  } catch {}
  return resolveValue(stored, policy.defaultMode, policy.selectableModes)
}

export function getSkin(): Skin {
  const policy = getThemePolicy()
  let stored: Skin | null = null
  try {
    const saved = localStorage.getItem(SKIN_KEY)
    if (saved === 'vintage' || saved === 'default') stored = saved
  } catch {}
  return resolveValue(stored, policy.defaultSkin, policy.selectableSkins)
}

function combinedTheme(mode: Mode, skin: Skin): string {
  return skin === 'vintage' ? `vintage-${mode}` : mode
}

export function applyTheme(mode: Mode, skin: Skin) {
  document.documentElement.setAttribute('data-theme', combinedTheme(mode, skin))
}

// Apply immediately when this module is first imported — no FOUC
applyTheme(getMode(), getSkin())

export function useTheme() {
  const [mode, setModeState] = useState<Mode>(getMode)
  const [skin, setSkinState] = useState<Skin>(getSkin)
  const policy = getThemePolicy()
  const modeSelectable = policy.selectableModes.length > 1
  const skinSelectable = policy.selectableSkins.length > 1

  function setMode(m: Mode) {
    if (!modeSelectable) return
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch {}
    applyTheme(m, skin)
  }

  function setSkin(s: Skin) {
    if (!skinSelectable) return
    setSkinState(s)
    try { localStorage.setItem(SKIN_KEY, s) } catch {}
    applyTheme(mode, s)
  }

  return {
    mode, skin, setMode, setSkin, isDark: mode === 'dark',
    modeSelectable, skinSelectable,
    selectableModes: policy.selectableModes, selectableSkins: policy.selectableSkins,
  }
}
