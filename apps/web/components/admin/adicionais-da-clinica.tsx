'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import { contratarAdicional } from '@/actions/assinatura'
import { JanelaModal } from '@/components/shared/janela-modal'
import { reaisDe } from '@/lib/redes/valor'
import type { ChaveDeAdicional } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * Os ADICIONAIS do plano, do lado da clínica (Configurações → Assinatura,
 * 2026-10-07): a conexão de WhatsApp além do limite e o Copilot avulso, com o
 * preço do plano. Contratar e cancelar pedem confirmação, mostrando a
 * mensalidade de antes e a de depois. Quem não pode contratar (unidade fixa,
 * sem configurações, suporte) vê o que existe, sem os botões.
 */
export interface AdicionalNaTela {
  chave: ChaveDeAdicional
  rotulo: string
  maximo: number
  emBreve: boolean
  /** O preço da PRÓXIMA unidade: o contratado (retrato) ou o que o plano oferece. */
  precoCentavos: number | null
  quantidade: number
  /** Condição especial combinada com o BellarisOS (preço, cortesia, desconto): a clínica cancela, mas não aumenta. */
  especial: boolean
  /** A mensalidade com uma unidade a mais / a menos — já com as condições (o servidor calcula). */
  totalSeMais: number | null
  totalSeMenos: number | null
}

type Pedido = { chave: ChaveDeAdicional; quantidade: number; contratar: boolean }

const TITULO: Record<ChaveDeAdicional, [string, string]> = {
  whatsapp: ['Contratar conexão de WhatsApp', 'Cancelar conexão de WhatsApp'],
  copilot:  ['Contratar o Copilot', 'Cancelar o Copilot'],
}
const FEITO: Record<ChaveDeAdicional, [string, string]> = {
  whatsapp: ['Conexão de WhatsApp contratada.', 'Conexão de WhatsApp cancelada.'],
  copilot:  ['Copilot contratado.', 'Copilot cancelado.'],
}

export function AdicionaisDaClinica({ adicionais, totalCentavos, cobranca, semContratar }: {
  adicionais: AdicionalNaTela[]
  totalCentavos: number
  /** O estado da cobrança: ligada (há fatura a mudar), pausada pela cortesia (volta ao haver valor), ou nenhuma. */
  cobranca: 'sem_cobranca' | 'ativa' | 'cancelada' | 'cortesia'
  /** Por que esta pessoa não contrata (null = contrata): o recado certo para cada caso. */
  semContratar: string | null
}) {
  const podeContratar = semContratar === null
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const visiveis = adicionais.filter(a => a.precoCentavos != null || a.quantidade > 0)
  if (!visiveis.length) return null

  return (
    <section className="card adicionais-da-clinica" aria-label="Adicionais">
      <p className="overline">Adicionais</p>
      <p className="adicionais-da-clinica-ajuda">Contrate além do plano. O valor entra na mensalidade.</p>
      <ul className="adicionais-da-clinica-lista">
        {visiveis.map(a => (
          <li key={a.chave}>
            <span className="adicionais-da-clinica-icone" aria-hidden>
              {a.chave === 'whatsapp' ? <MessageCircle size={16} /> : <Sparkles size={16} />}
            </span>
            <div className="adicionais-da-clinica-texto">
              <p className="adicionais-da-clinica-nome">
                {a.chave === 'whatsapp' ? 'Conexões de WhatsApp adicionais' : a.rotulo}
                {a.emBreve && <span className="chip-em-breve">em breve</span>}
              </p>
              {a.precoCentavos != null && (
                <p className="adicionais-da-clinica-preco">
                  {reaisDe(a.precoCentavos)} {a.chave === 'whatsapp' ? 'por conexão, por mês' : 'por mês'}
                </p>
              )}
              <p className="adicionais-da-clinica-estado">
                {a.chave === 'whatsapp'
                  ? (a.quantidade === 0 ? 'Nenhuma contratada.' : a.quantidade === 1 ? '1 contratada.' : `${a.quantidade} contratadas.`)
                  : (a.quantidade > 0 ? (a.emBreve ? 'Contratado · em breve' : 'Contratado') : 'Não contratado.')}
                {a.especial && ' Condição especial: para aumentar, fale com o BellarisOS.'}
              </p>
            </div>
            {podeContratar && (
              <div className="adicionais-da-clinica-acoes">
                {a.quantidade > 0 && (
                  <button type="button" className="btn-ghost"
                    onClick={() => setPedido({ chave: a.chave, quantidade: a.quantidade - 1, contratar: false })}>
                    {a.chave === 'whatsapp' ? 'Cancelar uma conexão' : 'Cancelar o Copilot'}
                  </button>
                )}
                {a.quantidade < a.maximo && a.precoCentavos != null && !a.especial && (
                  <button type="button" className="btn-secondary"
                    onClick={() => setPedido({ chave: a.chave, quantidade: a.quantidade + 1, contratar: true })}>
                    {a.chave === 'whatsapp' ? 'Contratar mais uma conexão' : 'Contratar o Copilot'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {semContratar && <p className="adicionais-da-clinica-ajuda">{semContratar}</p>}
      {pedido && (
        <Confirmacao pedido={pedido} adicional={adicionais.find(a => a.chave === pedido.chave)!}
          totalCentavos={totalCentavos} cobranca={cobranca} onFechar={() => setPedido(null)} />
      )}
    </section>
  )
}

function Confirmacao({ pedido, adicional, totalCentavos, cobranca, onFechar }: {
  pedido: Pedido; adicional: AdicionalNaTela; totalCentavos: number; cobranca: 'sem_cobranca' | 'ativa' | 'cancelada' | 'cortesia'; onFechar: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const titulo = TITULO[pedido.chave][pedido.contratar ? 0 : 1]
  const depois = (pedido.contratar ? adicional.totalSeMais : adicional.totalSeMenos) ?? totalCentavos

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await contratarAdicional(pedido.chave, pedido.quantidade)
      if ('error' in r) { setErro(r.error); return }
      toast.success(FEITO[pedido.chave][pedido.contratar ? 0 : 1], r.aviso ? { description: r.aviso } : undefined)
      onFechar()
      router.refresh()
    })
  }

  return (
    <JanelaModal onFechar={onFechar} rotulo={titulo} largura={460} travado={pendente} papel="alertdialog">
      <div className="adicionais-da-clinica-janela">
        <div className="adicionais-da-clinica-janela-topo">
          <h2>{titulo}</h2>
          <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" disabled={pendente}><X size={15} /></button>
        </div>
        <p>
          A mensalidade passa de <strong>{reaisDe(totalCentavos)}</strong> para <strong>{reaisDe(depois)}</strong>.{' '}
          {cobranca === 'ativa'
            ? 'O valor novo vale para a fatura em aberto e as próximas.'
            : cobranca === 'cortesia' && depois > 0
              ? 'Hoje a assinatura é cortesia do BellarisOS: com isto, a cobrança volta, com a primeira fatura em 3 dias.'
              : 'O valor entra na mensalidade quando a cobrança começar.'}
        </p>
        {pedido.contratar && pedido.chave === 'copilot' && adicional.emBreve && (
          <p className="adicionais-da-clinica-ajuda">
            O Copilot ainda está em desenvolvimento, e a cobrança começa já, antes de ele entrar no ar.
          </p>
        )}
        {erro && <p className="adicionais-da-clinica-erro" role="alert">{erro}</p>}
        <div className="adicionais-da-clinica-janela-acoes">
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={pendente}>Voltar</button>
          <button type="button" className="btn-primary" onClick={confirmar} disabled={pendente}>
            {pendente ? 'Salvando…' : pedido.contratar ? 'Confirmar contratação' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
