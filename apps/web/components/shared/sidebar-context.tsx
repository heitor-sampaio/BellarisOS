'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface SidebarCtx {
  isOpen: boolean
  toggle: () => void
  close:  () => void
}

const SidebarContext = createContext<SidebarCtx>({
  isOpen: false,
  toggle: () => {},
  close:  () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const close  = useCallback(() => setIsOpen(false), [])
  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
