'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { getUrlParam, setUrlParam } from './url'

// The viewer's team, kept in localStorage (remembered) and in the URL as
// ?team=... (so a link shared in the group chat opens on that team).

const STORAGE_KEY = 'selected-team'

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStorage(team: string) {
  try {
    if (team) localStorage.setItem(STORAGE_KEY, team)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode or blocked storage: the selection just isn't remembered
  }
}

function writeUrl(team: string) {
  setUrlParam('team', team)
}

interface SelectedTeamState {
  team: string
  /** False until the stored or linked team has been read */
  ready: boolean
  setTeam: (team: string) => void
}

export const useSelectedTeam = create<SelectedTeamState>()((set) => ({
  team: '',
  ready: false,
  setTeam: (team) => {
    set({ team })
    writeStorage(team)
    writeUrl(team)
  },
}))

/**
 * Reads the initial team once the team list is known: a ?team= link wins over
 * the stored team, and unknown names are ignored. A linked team is shown but
 * not stored, so opening someone else's link doesn't change your own team.
 */
export function useInitSelectedTeam(teams: string[] | undefined) {
  useEffect(() => {
    if (!teams || useSelectedTeam.getState().ready) return
    const linked = getUrlParam('team')
    const stored = readStorage()
    const team = [linked, stored].find((t): t is string => !!t && teams.includes(t)) ?? ''
    useSelectedTeam.setState({ team, ready: true })
    writeUrl(team)
  }, [teams])
}
