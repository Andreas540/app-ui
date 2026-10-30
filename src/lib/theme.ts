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
// A skin may support fewer modes than the policy allows (miami and jersey ship dark-only)
// — see skinSupportedModes(). That narrowing is per-skin on purpose: restricting
// selectableModes globally would hide light mode for every other skin too.
//
// Stored preferences are scoped to the logged-in tenant (or user, for
// tenant-less accounts like SuperAdmin) — see getScope(). Without this, one
// browser switching between different tenants/business types would leak one
// tenant's manually-chosen theme into another's session. Logged-out (no
// userData) has no scope at all, so the login screen always shows the
// platform default, ignoring any previously stored value.
//
// Usage:
//   import { useTheme } from '../lib/theme'
//   const { mode, skin, setMode, setSkin, isDark, modeSelectable, skinSelectable } = useTheme()

import { useState } from 'react'
import { getTenantConfig } from './tenantConfig'

export type Mode = 'dark' | 'light'

export const ALL_SKINS = ['default', 'vintage', 'pool', 'miami', 'jersey'] as const
export type Skin = typeof ALL_SKINS[number]

export const SKIN_LABELS: Record<Skin, string> = {
  default: 'Default',
  vintage: 'Vintage',
  pool: 'Aqua',
  miami: 'Miami',
  jersey: 'Jersey',
}

const MODE_KEY_PREFIX = 'app-theme:'
const SKIN_KEY_PREFIX = 'app-theme-skin:'

interface ThemePolicy {
  defaultSkin: Skin
  defaultMode: Mode
  selectableSkins: Skin[]
  selectableModes: Mode[]
}

function getScope(): string | null {
  try {
    const raw = localStorage.getItem('userData')
    if (!raw) return null
    const userData = JSON.parse(raw)
    if (userData.tenantId) return `tenant:${userData.tenantId}`
    if (userData.id) return `user:${userData.id}`
    return null
  } catch {
    return null
  }
}

function getThemePolicy(): ThemePolicy {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}')
    const policy = { ...getTenantConfig(userData.tenantId).theme }
    const overrideSkin = userData.uiConfig?.theme?.overrideSkin as Skin | undefined
    const overrideMode = userData.uiConfig?.theme?.overrideMode as Mode | undefined
    if (overrideSkin) {
      policy.defaultSkin = overrideSkin
      if (!policy.selectableSkins.includes(overrideSkin)) {
        policy.selectableSkins = [...policy.selectableSkins, overrideSkin]
      }
      if (overrideMode) policy.defaultMode = overrideMode
      policy.selectableModes = ['dark', 'light']
    }
    return policy
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
  const supported = skinSupportedModes(getSkin())
  const allowed = policy.selectableModes.filter(m => supported.includes(m))
  const fallback = allowed.includes(policy.defaultMode) ? policy.defaultMode : (allowed[0] ?? 'dark')
  const scope = getScope()
  if (!scope) return fallback
  let stored: Mode | null = null
  try {
    const saved = localStorage.getItem(MODE_KEY_PREFIX + scope)
    if (saved === 'light' || saved === 'dark') stored = saved
  } catch {}
  return resolveValue(stored, fallback, allowed)
}

export function getSkin(): Skin {
  const policy = getThemePolicy()
  const scope = getScope()
  if (!scope) return policy.defaultSkin
  let stored: Skin | null = null
  try {
    const saved = localStorage.getItem(SKIN_KEY_PREFIX + scope)
    if (saved && (ALL_SKINS as readonly string[]).includes(saved)) stored = saved as Skin
  } catch {}
  return resolveValue(stored, policy.defaultSkin, policy.selectableSkins)
}

export function skinSupportedModes(s: Skin): Mode[] {
  if (s === 'miami' || s === 'jersey') return ['dark']
  return ['dark', 'light']
}

function combinedTheme(mode: Mode, skin: Skin): string {
  if (skin === 'default') return mode
  const supported = skinSupportedModes(skin)
  return `${skin}-${supported.includes(mode) ? mode : supported[0]}`
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
    const scope = getScope()
    if (scope) { try { localStorage.setItem(MODE_KEY_PREFIX + scope, m) } catch {} }
    applyTheme(m, skin)
  }

  function setSkin(s: Skin) {
    if (!skinSelectable) return
    setSkinState(s)
    const scope = getScope()
    if (scope) { try { localStorage.setItem(SKIN_KEY_PREFIX + scope, s) } catch {} }
    const supported = skinSupportedModes(s)
    const effectiveMode = supported.includes(mode) ? mode : supported[0]
    if (effectiveMode !== mode) {
      setModeState(effectiveMode)
      if (scope) { try { localStorage.setItem(MODE_KEY_PREFIX + scope, effectiveMode) } catch {} }
    }
    applyTheme(effectiveMode, s)
  }

  return {
    mode, skin, setMode, setSkin, isDark: mode === 'dark',
    modeSelectable, skinSelectable,
    selectableModes: policy.selectableModes, selectableSkins: policy.selectableSkins,
  }
}
