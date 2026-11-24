'use client'

import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The two teams on History → Rivalry, in the URL as ?rivals=<team>,<team> (so the page can be shared).
// Works like lib/selected-franchise.ts: `openRivalry` sets them and bumps `opened`, which the dashboard watches
// to switch to the view.

type Pair = [string, string]

const fromUrl = (): Pair | null => {
  const [a, b] = (getUrlParam('rivals') ?? '').split(',').map(s => s.trim())
  return a && b && a !== b ? [a, b] : null
}

interface SelectedRivalryState {
  pair: Pair | null
  /** Bumped by every openRivalry call */
  opened: number
  openRivalry: (a: string, b: string) => void
  /** Picks the teams on the page itself (no switch needed) */
  setPair: (a: string, b: string) => void
}

export const useSelectedRivalry = create<SelectedRivalryState>()((set) => ({
  pair: fromUrl(),
  opened: 0,
  openRivalry: (a, b) => {
    setUrlParam('rivals', `${a},${b}`)
    set(state => ({ pair: [a, b], opened: state.opened + 1 }))
  },
  setPair: (a, b) => {
    setUrlParam('rivals', `${a},${b}`)
    set({ pair: [a, b] })
  },
}))
