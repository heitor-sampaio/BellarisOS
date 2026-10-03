'use client'

import { useEffect, useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import type { SuporteNoContexto } from '@estetica-os/types'

/**
 * O aviso fixo de que esta tela é do SUPORTE entrando na conta de alguém:
 * quem, até quando, e o "Sair" (que devolve o atendente ao painel).
 *
 * Mora dentro da topbar, sem faixa nova: uma faixa mudaria `--topbar-h`, de que
 * as sobreposições do celular dependem. Não some apagando cookie — vem do
 * servidor (`ctx.suporte`), que acha a sessão pelo token.
 */
function minutosAte(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000))
}

export function BannerDoSuporte({ suporte }: { suporte: SuporteNoContexto }) {
  const [minutos, setMinutos] = useState<number | null>(null)
  useEffect(() => {
    const tique = () => setMinutos(minutosAte(suporte.expiraEm))
    const primeiro = setTimeout(tique, 0)
    const id = setInterval(tique, 30_000)
    return () => { clearTimeout(primeiro); clearInterval(id) }
  }, [suporte.expiraEm])

  return (
    <div className="banner-suporte" role="status" aria-label="Modo suporte">
      <LifeBuoy size={14} aria-hidden />
      <span className="banner-suporte-texto">
        <strong>Modo suporte</strong>
        <span className="hide-mobile"> · {suporte.atendenteNome} como {suporte.nomeDoMembro}</span>
        {minutos !== null && <span> · {minutos === 0 ? 'vencendo' : `${minutos} min`}</span>}
        {!suporte.incluiClinico && <span className="hide-mobile"> · sem prontuário</span>}
      </span>
      {/* Navegação COMPLETA de propósito: é um Route Handler que troca os cookies
          da sessão — o roteador do cliente não pode interceptar. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/auth/suporte-fim" className="banner-suporte-sair">Sair</a>
    </div>
  )
}
