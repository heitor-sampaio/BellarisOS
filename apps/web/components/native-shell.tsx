'use client'

import { useEffect } from 'react'

/**
 * Configura o shell nativo quando rodando dentro do app (Capacitor):
 * - marca <html class="capacitor"> para estilos condicionais (faixas rosé de safe-area);
 * - status bar com ícones brancos (Style.Dark = conteúdo claro);
 * - mantém edge-to-edge (WebView desenha atrás das barras → as faixas rosé aparecem).
 * No browser é no-op.
 */
export function NativeShell() {
  useEffect(() => {
    let cancelled = false
    import('@capacitor/core')
      .then(async ({ Capacitor }) => {
        if (cancelled || !Capacitor.isNativePlatform()) return
        document.documentElement.classList.add('capacitor')
        try {
          const { StatusBar, Style } = await import('@capacitor/status-bar')
          await StatusBar.setOverlaysWebView({ overlay: true })
          await StatusBar.setStyle({ style: Style.Dark })
        } catch { /* plugin ausente no build atual — no-op */ }
      })
      .catch(() => { /* fora do Capacitor */ })
    return () => { cancelled = true }
  }, [])

  return null
}
