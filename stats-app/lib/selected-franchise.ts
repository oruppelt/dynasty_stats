'use client'

import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The franchise on History → Franchise, in the URL as ?franchise=<team name> (so the page can be shared).
// Works like lib/selected-trade.ts: `openFranchise` sets it and bumps `opened`, which the dashboard watches
// to switch to the view.

interface SelectedFranchiseState {
  franchise: string | null
  /** Bumped by every openFranchise call */
  opened: number
  openFranchise: (team: string) => void
  /** Picks a franchise on the page itself (no switch needed) */
  setFranchise: (team: string) => void
}

export const useSelectedFranchise = create<SelectedFranchiseState>()((set) => ({
  franchise: getUrlParam('franchise'),
  opened: 0,
  openFranchise: (franchise) => {
    setUrlParam('franchise', franchise)
    set(state => ({ franchise, opened: state.opened + 1 }))
  },
  setFranchise: (franchise) => {
    setUrlParam('franchise', franchise)
    set({ franchise })
  },
}))
