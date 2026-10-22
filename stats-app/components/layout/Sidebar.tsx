'use client'

import { useLayoutStore } from '@/lib/layout-store'
import { Button } from '@/components/ui/button'
import {
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useLayoutStore()

  return (
    <>
      {/* Overlay for mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 80 }}
        className={`
          fixed lg:relative top-16 left-0 bottom-0 z-50
          bg-card border-r border-border
          transition-all duration-300 ease-in-out
          ${!sidebarOpen && '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Toggle Button (Desktop only) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="absolute -right-4 top-4 h-8 w-8 rounded-full bg-card border shadow-md hidden lg:flex items-center justify-center"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <div className="flex flex-col h-full p-4">
          {/* Bottom Actions */}
          <div className="mt-auto space-y-2 pt-4 border-t">
            {sidebarOpen ? (
              <>
                <Button variant="ghost" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Help
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon" className="w-full" title="Settings">
                  <Settings className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-full" title="Help">
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  )
}
