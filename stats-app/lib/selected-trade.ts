'use client'

import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The trade on the Players → Trade view, in the URL as ?trade=<Fantrax trade id> (so a trade can be shared
// by link). Works like lib/selected-player.ts: `openTrade` sets the trade and bumps `opened`, which the
// dashboard watches to switch to the view.

interface SelectedTradeState {
  tradeId: string | null
  /** Bumped by every openTrade call */
  opened: number
  openTrade: (tradeId: string) => void
  /** Picks a trade on the Trade view itself (no switch needed) */
  setTrade: (tradeId: string | null) => void
}

export const useSelectedTrade = create<SelectedTradeState>()((set) => ({
  tradeId: getUrlParam('trade'),
  opened: 0,
  openTrade: (tradeId) => {
    setUrlParam('trade', tradeId)
    set(state => ({ tradeId, opened: state.opened + 1 }))
  },
  setTrade: (tradeId) => {
    setUrlParam('trade', tradeId ?? '')
    set({ tradeId })
  },
}))
