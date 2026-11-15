'use client'

import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The player on the Players → Player view, in the URL as ?player=<Fantrax id>
// (so a player link can be shared). Any player name on the site can open it:
// `openPlayer` sets the player and bumps `opened`, which the dashboard watches
// to switch to the view.

interface SelectedPlayerState {
  playerId: string | null
  /** Bumped by every openPlayer call */
  opened: number
  openPlayer: (playerId: string) => void
  /** Picks a player on the Player view itself (no switch needed) */
  setPlayer: (playerId: string | null) => void
}

export const useSelectedPlayer = create<SelectedPlayerState>()((set) => ({
  playerId: getUrlParam('player'),
  opened: 0,
  openPlayer: (playerId) => {
    setUrlParam('player', playerId)
    set(state => ({ playerId, opened: state.opened + 1 }))
  },
  setPlayer: (playerId) => {
    setUrlParam('player', playerId ?? '')
    set({ playerId })
  },
}))
