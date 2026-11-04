'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'

/**
 * O Copilot que o PLANO não inclui, explicado (A51 da 6ª simulação): no teste
 * grátis ("tudo, menos o Copilot", J-7) ele sumia calado. Quem administra a
 * clínica vê o mesmo botão flutuante, e ele abre só o aviso — por que não há
 * Copilot e onde se contrata (Configurações → Assinatura). Nenhuma conversa
 * nasce daqui: a rota segue recusando.
 */
export function CopilotForaDoPlano({ emTeste, assinaturaHref }: { emTeste: boolean; assinaturaHref: string }) {
  const [aberto, setAberto] = useState(false)
  const pathname = usePathname()
  // No inbox, o botão sobe (o "Enviar" mora embaixo, à direita) — como o Copilot.
  const subir = /\/inbox(\/|$)/.test(pathname)

  if (!aberto) {
    return (
      <button type="button" className="copilot-botao copilot-botao-fora" data-subir={subir ? 'sim' : 'nao'}
        onClick={() => setAberto(true)} aria-label="Copilot: fora do plano" aria-expanded="false" title="Copilot (fora do plano)">
        <Sparkles size={18} />
        <span className="copilot-botao-rotulo">Copilot</span>
      </button>
    )
  }

  return (
    <section className="copilot-painel copilot-painel-fora" role="dialog" aria-label="Copilot" aria-modal="false">
      <header className="copilot-cabecalho">
        <div className="copilot-titulo">
          <span className="copilot-icone"><Sparkles size={15} /></span>
          <div>
            <strong>Copilot</strong>
            <span>Sua secretária virtual</span>
          </div>
        </div>
        <button type="button" className="copilot-acao-topo" aria-label="Fechar o Copilot" onClick={() => setAberto(false)} title="Fechar">
          <X size={16} />
        </button>
      </header>
      <div className="copilot-corpo">
        <div className="copilot-vazio" data-copilot-fora-do-plano>
          <p><strong>{emTeste ? 'O Copilot não está no seu plano de teste.' : 'O Copilot não faz parte do plano da clínica.'}</strong></p>
          <p>
            {emTeste
              ? 'O teste grátis libera tudo, menos o Copilot: ele custa por uso. Ele entra com um plano que o inclua, ou como adicional.'
              : 'Ele entra com um plano que o inclua, ou como adicional, se o plano oferecer.'}
          </p>
          <p>
            Veja em <Link href={assinaturaHref} onClick={() => setAberto(false)}>Configurações → Assinatura</Link>.
          </p>
        </div>
      </div>
    </section>
  )
}
