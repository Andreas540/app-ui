// Registry of front pages that can be assigned to a business type in
// SuperAdmin's Business Type editor (config_defaults.frontPageKey).
// Add an entry here once a real front-page design exists for a vertical;
// the SuperAdmin dropdown and the post-login gate in App.tsx both read
// from this list, so no other wiring is needed.

import type { ComponentType } from 'react'
import FrontPagePlaceholder from '../pages/FrontPagePlaceholder'

export interface FrontPageDef {
  key: string
  label: string
}

export const FRONT_PAGES: FrontPageDef[] = [
  { key: 'placeholder', label: 'Placeholder (demo)' },
]

export const FRONT_PAGE_COMPONENTS: Record<string, ComponentType<{ onContinue: () => void }>> = {
  placeholder: FrontPagePlaceholder,
}
