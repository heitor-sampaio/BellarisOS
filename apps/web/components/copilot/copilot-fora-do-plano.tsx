'use client'

import { subidaDoBotaoDoCopilot } from '@/lib/copilot/subida-do-botao'
import { useFocoAcimaDoBotao } from '@/lib/copilot/abaixo-do-botao'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'
import { Dica } from '@/components/shared/dica'

/**
 * O Copilot que o PLANO não inclui, explicado (A51 da 6ª simulação): no teste
 * grátis ("tudo, menos o Copilot", J-7) ele sumia calado. Quem administra a
 * clínica vê o mesmo botão flutuante, e ele abre só o aviso — por que não há
 * Copilot e onde se contrata (Configurações → Assinatura). Nenhuma conversa
 * nasce daqui: a rota segue recusando.
 */
interface Caixa { top: number; bottom: number; left: number; right: number }

/**
 * A2 da 35ª simulação (design.md; decisão do Claude, 27/11): há uma AÇÃO embaixo
 * do botão? Confere uma grade de pontos da caixa dele (`ehAcao(x, y)` diz se no
 * ponto, atrás do botão, há um botão, link ou campo). Pura, para o teste.
 */
export function haAcaoEmbaixo(botao: Caixa, ehAcao: (x: number, y: number) => boolean): boolean {
  const xs = [0.1, 0.5, 0.9].map(f => botao.left + (botao.right - botao.left) * f)
  const ys = [0.15, 0.5, 0.85].map(f => botao.top + (botao.bottom - botao.top) * f)
  return xs.some(x => ys.some(y => ehAcao(x, y)))
}

/**
 * Quanto o botão sobe para sair de cima de uma ação: o primeiro degrau (a altura
 * dele e a folga) em que nada embaixo é ação; 0 sem ação embaixo. Sem lugar
 * livre até o meio da tela, fica onde está.
 */
export function desvioDoBotao(botao: Caixa, ehAcao: (x: number, y: number) => boolean): number {
  const degrau = (botao.bottom - botao.top) + 16
  for (let subida = 0; botao.top - subida > botao.bottom / 2; subida += degrau) {
    if (!haAcaoEmbaixo({ ...botao, top: botao.top - subida, bottom: botao.bottom - subida }, ehAcao)) return subida
  }
  return 0
}

const ACAO = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'

/** No ponto, atrás do botão (e do Copilot), há uma ação? */
function acaoAtrasDoBotao(botao: HTMLElement) {
  return (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (botao.contains(el)) continue
      if (el === document.body || el === document.documentElement) return false
      return !!el.closest(ACAO)
    }
    return false
  }
}

/**
 * Fora do plano o botão é um AVISO, não uma ação (A2 da 35ª): com uma ação
 * embaixo dele (o lápis do canto do cartão, no meio da página), ele sobe até um
 * lugar sem ação, e volta quando a página rola. Confere na rolagem, no tamanho
 * da janela e quando a página muda (um quadro por vez). A conta é do lugar dele
 * (sem a subida), para a volta não depender de onde ele está.
 */
function useSaiDaFrente(ligado: boolean) {
  const ref = useRef<HTMLButtonElement>(null)
  const [desvio, setDesvio] = useState(0)
  useEffect(() => {
    if (!ligado) return
    let quadro = 0
    const conferir = () => {
      quadro = 0
      const botao = ref.current
      if (!botao) return
      const r = botao.getBoundingClientRect()
      const subida = Number(botao.dataset.desvio ?? 0)
      setDesvio(desvioDoBotao({ top: r.top + subida, bottom: r.bottom + subida, left: r.left, right: r.right }, acaoAtrasDoBotao(botao)))
    }
    const pedir = () => { if (!quadro) quadro = requestAnimationFrame(conferir) }
    pedir()
    window.addEventListener('scroll', pedir, { passive: true, capture: true })
    window.addEventListener('resize', pedir)
    const mudou = new MutationObserver(pedir)
    mudou.observe(document.body, { childList: true, subtree: true })
    return () => {
      if (quadro) cancelAnimationFrame(quadro)
      window.removeEventListener('scroll', pedir, { capture: true })
      window.removeEventListener('resize', pedir)
      mudou.disconnect()
    }
  }, [ligado])
  return { ref, desvio }
}

export function CopilotForaDoPlano({ emTeste, assinaturaHref }: { emTeste: boolean; assinaturaHref: string }) {
  const [aberto, setAberto] = useState(false)
  const pathname = usePathname()
  // O botão sobe onde o Copilot sobe (o "Enviar" do inbox, a barra do atendimento no celular).
  const subir = subidaDoBotaoDoCopilot(pathname)
  // A16 da 23ª: o que ganha o foco atrás do botão sobe acima dele.
  useFocoAcimaDoBotao()
  const { ref, desvio } = useSaiDaFrente(!aberto)

  if (!aberto) {
    return (
      <button ref={ref} type="button" className="copilot-botao copilot-botao-fora" data-subir={subir}
        data-sai-da-frente={desvio ? '' : undefined} data-desvio={desvio}
        style={desvio ? { transform: `translateY(-${desvio}px)` } : undefined}
        onClick={() => setAberto(true)} aria-label="Copilot: fora do plano" aria-expanded="false" title="Copilot (fora do plano)">
        <Sparkles size={18} />
        <span className="copilot-botao-rotulo">Copilot</span>
        {/* A16 da 15ª (princípio 3): o "fora do plano" à vista, não só no title. */}
        <span className="copilot-botao-selo" aria-hidden="true">Fora do plano</span>
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
            <span>Pergunte ou peça, conversando</span>
          </div>
        </div>
        <button type="button" className="copilot-acao-topo" aria-label="Fechar o Copilot" onClick={() => setAberto(false)} title="Fechar">
          <X size={16} />
        </button>
      </header>
      <div className="copilot-corpo">
        <div className="copilot-vazio" data-copilot-fora-do-plano>
          {/* O estado e o caminho ficam à vista; o "por que" do teste, na dica (2026-11-16). */}
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <strong>{emTeste ? 'O Copilot não está no seu plano de teste.' : 'O Copilot não faz parte do plano da rede.'}</strong>
            {emTeste && <Dica rotulo="Por que fica fora do teste">O teste grátis libera tudo, menos o Copilot: ele custa por uso.</Dica>}
          </p>
          <p>
            {emTeste
              ? 'Ele entra com um plano que o inclua, ou como adicional.'
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
