'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface SidebarCtx {
  isOpen:          boolean   // off-canvas mobile
  toggle:          () => void
  close:           () => void
  collapsed:       boolean   // trilha de ícones (desktop)
  toggleCollapsed: () => void
}

const SidebarContext = createContext<SidebarCtx>({
  isOpen:          false,
  toggle:          () => {},
  close:           () => {},
  collapsed:       false,
  toggleCollapsed: () => {},
})

const STORAGE_KEY = 'sidebar-collapsed'

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen]       = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const close  = useCallback(() => setIsOpen(false), [])

  // Restaura o estado recolhido do localStorage na montagem
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  // Reflete no <html> (dirige --sidebar-w via CSS) + persiste
  useEffect(() => {
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed)
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const toggleCollapsed = useCallback(() => setCollapsed(v => !v), [])

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
