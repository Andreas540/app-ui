// src/lib/theme.ts
// Theme management — reads/writes localStorage and keeps <html data-theme="..."> in sync.
// Import this module early so the theme is applied before the first paint.
//
// Usage:
//   import { useTheme } from '../lib/theme'
//   const { theme, setTheme } = useTheme()
//
// To mark a page as "fully themed", just keep using CSS variables.
// No special opt-in needed per page; the html attribute cascades everywhere.

import { useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'app-theme'
const DEFAULT_THEME: Theme = 'dark'

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return DEFAULT_THEME
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
}

// Apply immediately when this module is first imported — no FOUC
applyTheme(getTheme())

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme)

  function setTheme(t: Theme) {
    setThemeState(t)
    applyTheme(t)
  }

  return { theme, setTheme }
}
