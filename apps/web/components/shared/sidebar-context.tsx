'use client'

import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore } from 'react'

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

// O estado recolhido MORA no localStorage e é lido por `useSyncExternalStore`:
// falso no servidor e na hidratação (o servidor não tem localStorage), o valor
// guardado logo depois. Antes era copiado para um estado dentro de um efeito.
const ouvintesDoRecolhido = new Set<() => void>()

function assinarRecolhido(avisar: () => void): () => void {
  ouvintesDoRecolhido.add(avisar)
  return () => { ouvintesDoRecolhido.delete(avisar) }
}
const lerRecolhido         = () => localStorage.getItem(STORAGE_KEY) === '1'
const recolhidoNoServidor  = () => false

function gravarRecolhido(valor: boolean) {
  localStorage.setItem(STORAGE_KEY, valor ? '1' : '0')
  ouvintesDoRecolhido.forEach(avisar => avisar())
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const collapsed = useSyncExternalStore(assinarRecolhido, lerRecolhido, recolhidoNoServidor)

  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const close  = useCallback(() => setIsOpen(false), [])

  // Reflete no <html> (dirige --sidebar-w via CSS)
  useEffect(() => {
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed)
  }, [collapsed])

  const toggleCollapsed = useCallback(() => gravarRecolhido(!lerRecolhido()), [])

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
