/**
 * Layout Store - Zustand state management for dashboard layout
 *
 * Manages:
 * - Sidebar open/collapsed state
 * - View mode (tabs vs grid)
 * - Widget visibility toggles
 *
 * State persists to localStorage via Zustand persist middleware
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LayoutState {
  // Sidebar state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      // Sidebar starts open on desktop
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'nba-dashboard-layout', // localStorage key
      // Only persist the sidebar; drops stale fields (e.g. old lastUpdated) from storage
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    }
  )
)
