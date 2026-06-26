import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lumière — Gestão de Clínicas',
  description: 'Sistema de gestão para redes de clínicas de estética',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
