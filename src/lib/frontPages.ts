// Registry of front pages that can be assigned to a business type in
// SuperAdmin's Business Type editor (config_defaults.frontPageKey).
// Add an entry here once a real front-page design exists for a vertical;
// the SuperAdmin dropdown and the post-login gate in App.tsx both read
// from this list, so no other wiring is needed.

import type { ComponentType } from 'react'
import FrontPagePlaceholder from '../pages/FrontPagePlaceholder'
import FrontPageBiznizBlue from '../pages/FrontPageBiznizBlue'
import FrontPageBiznizGreen from '../pages/FrontPageBiznizGreen'
import FrontPagePoolSpa from '../pages/FrontPagePoolSpa'

export interface FrontPageDef {
  key: string
  label: string
}

export const FRONT_PAGES: FrontPageDef[] = [
  { key: 'placeholder', label: 'Placeholder (demo)' },
  { key: 'bizniz-blue', label: 'Bizniz Optimizer — Aged Paper Blue' },
  { key: 'bizniz-green', label: 'Bizniz Optimizer — Aged Paper Green' },
  { key: 'pool-spa', label: 'Bizniz Optimizer — Pool & Spa Service' },
]

export const FRONT_PAGE_COMPONENTS: Record<string, ComponentType<{ onContinue: () => void }>> = {
  placeholder: FrontPagePlaceholder,
  'bizniz-blue': FrontPageBiznizBlue,
  'bizniz-green': FrontPageBiznizGreen,
  'pool-spa': FrontPagePoolSpa,
}
