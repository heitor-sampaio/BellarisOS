'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

/**
 * A fila do suporte se atualiza sozinha. `support_signals` é uma linha sem
 * dado, marcada por `chamado_abrir`/`chamado_responder`, que só a plataforma
 * lê (é o padrão de `crm_quadro_sinais`, §4): o Realtime avisa e a página
 * recarrega pelo servidor. De reserva, um refresh a cada minuto com a aba à
 * vista — no lugar da rota de contagem que o plano previa, que seria mais um
 * endpoint a defender para dizer o que o refresh já diz.
 */
export function SinalDaFila() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 60_000)
    return () => clearInterval(t)
  }, [router])
  return <RealtimeRefresher tables={['support_signals']} />
}
