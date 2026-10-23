'use client'

import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The season on screen, kept in the URL as ?season=... (not remembered: the
// site opens on the default season, the current one). null = the default.
// The URL is read when the page loads in the browser; the static export's
// server render has no URL, but it only shows the loading state anyway.

interface SelectedSeasonState {
  season: string | null
  /** `defaultSeason` keeps the default out of the URL */
  setSeason: (season: string, defaultSeason: string) => void
}

export const useSelectedSeason = create<SelectedSeasonState>()((set) => ({
  season: getUrlParam('season'),
  setSeason: (season, defaultSeason) => {
    set({ season })
    setUrlParam('season', season === defaultSeason ? '' : season)
    // A period link belongs to the season it was made in
    setUrlParam('period', '')
  },
}))
