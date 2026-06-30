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
// combination) while letting business-type config later lock the skin
// independently of the user's dark/light preference.
//
// Usage:
//   import { useTheme } from '../lib/theme'
//   const { mode, skin, setMode, setSkin, isDark } = useTheme()

import { useState } from 'react'
import { getTenantConfig } from './tenantConfig'

export type Mode = 'dark' | 'light'
export type Skin = 'default' | 'vintage'

const MODE_KEY = 'app-theme'
const SKIN_KEY = 'app-theme-skin'
const DEFAULT_MODE: Mode = 'dark'

export function getMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return DEFAULT_MODE
}

// Business types can lock tenants/users to a default skin (config_defaults.theme).
// Reads the same userData blob that getTenantConfig() relies on for its
// businessTypeConfig layer — see SuperAdmin's per-business-type Theme section.
function getSkinPolicy(): { defaultSkin: Skin; selectable: boolean } {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}')
    return getTenantConfig(userData.tenantId).theme
  } catch {
    return { defaultSkin: 'default', selectable: true }
  }
}

export function getSkin(): Skin {
  const policy = getSkinPolicy()
  if (!policy.selectable) return policy.defaultSkin
  try {
    const saved = localStorage.getItem(SKIN_KEY)
    if (saved === 'vintage' || saved === 'default') return saved
  } catch {}
  return policy.defaultSkin
}

function combinedTheme(mode: Mode, skin: Skin): string {
  return skin === 'vintage' ? `vintage-${mode}` : mode
}

export function applyTheme(mode: Mode, skin: Skin) {
  document.documentElement.setAttribute('data-theme', combinedTheme(mode, skin))
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {}
}

// Apply immediately when this module is first imported — no FOUC
applyTheme(getMode(), getSkin())

export function useTheme() {
  const [mode, setModeState] = useState<Mode>(getMode)
  const [skin, setSkinState] = useState<Skin>(getSkin)
  const skinSelectable = getSkinPolicy().selectable

  function setMode(m: Mode) {
    setModeState(m)
    applyTheme(m, skin)
  }

  function setSkin(s: Skin) {
    if (!skinSelectable) return
    setSkinState(s)
    try { localStorage.setItem(SKIN_KEY, s) } catch {}
    applyTheme(mode, s)
  }

  return { mode, skin, setMode, setSkin, isDark: mode === 'dark', skinSelectable }
}
