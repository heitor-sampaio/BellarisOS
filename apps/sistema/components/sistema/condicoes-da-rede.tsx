'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { definirCondicao } from '@/actions/sistema'
import { SegSelect } from '@estetica-os/nucleo/components/shared/seg-select'
import { brutoDosItens, descreverCondicao, valorComCondicao, type Condicao, type Condicoes, type ItemDaAssinatura } from '@estetica-os/nucleo/lib/planos/condicoes'
import type { AdicionaisContratados } from '@estetica-os/nucleo/lib/planos/adicionais'
import { centavosDe, campoDeReais, reaisDe } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * CORTESIA e DESCONTO na assinatura da rede, no sistema (2026-10-07,
 * decisões do Heitor): por item — o plano, as conexões de WhatsApp, o
 * Copilot —, em percentual, em reais, ou de graça, com fim opcional. A clínica
 * vê a condição na aba Assinatura. A rede toda de cortesia fica ativa, sem
 * cobrança.
 */
const ROTULO: Record<ItemDaAssinatura, string> = { plano: 'Plano', whatsapp: 'Conexões de WhatsApp', copilot: 'Copilot avulso' }
type Tipo = 'normal' | 'percentual' | 'valor' | 'cortesia'
const OPCOES: { key: Tipo; label: string }[] = [
  { key: 'normal', label: 'Preço normal' },
  { key: 'percentual', label: 'Desconto em %' },
  { key: 'valor', label: 'Desconto em R$' },
  { key: 'cortesia', label: 'Cortesia' },
]

export function CondicoesDaRede({ tenantId, valorCentavos, adicionais, condicoes }: {
  tenantId: string
  valorCentavos: number
  adicionais: AdicionaisContratados
  condicoes: Condicoes
}) {
  const brutos = brutoDosItens(valorCentavos, adicionais)
  const itens = (Object.keys(ROTULO) as ItemDaAssinatura[]).filter(i => brutos[i] != null)
  return (
    <div className="suporte-pilha">
      {itens.map(i => (
        <LinhaDaCondicao key={`${i}-${JSON.stringify(condicoes[i] ?? null)}`} tenantId={tenantId} item={i} bruto={brutos[i]!} atual={condicoes[i] ?? null} />
      ))}
    </div>
  )
}

function LinhaDaCondicao({ tenantId, item, bruto, atual }: {
  tenantId: string; item: ItemDaAssinatura; bruto: number; atual: Condicao | null
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<Tipo>(atual?.tipo ?? 'normal')
  const [percentual, setPercentual] = useState(atual?.tipo === 'percentual' ? String(atual.percentual) : '')
  const [desconto, setDesconto] = useState(atual?.tipo === 'valor' ? campoDeReais(atual.centavos) : '')
  const [ate, setAte] = useState(atual?.ate ?? '')
  const [pendente, iniciar] = useTransition()

  /** A condição montada da tela, ou o motivo de não fechar. */
  function montar(): { condicao: Condicao | null } | { erro: string } {
    if (tipo === 'normal') return { condicao: null }
    const comAte = ate ? { ate } : {}
    if (tipo === 'cortesia') return { condicao: { tipo, ...comAte } }
    if (tipo === 'percentual') {
      const p = Number(percentual)
      if (!Number.isInteger(p) || p < 1 || p > 100) return { erro: 'Desconto de 1% a 100%.' }
      return { condicao: { tipo, percentual: p, ...comAte } }
    }
    const c = centavosDe(desconto)
    if (c == null || c < 1) return { erro: 'Desconto em reais inválido.' }
    return { condicao: { tipo, centavos: c, ...comAte } }
  }

  const montada = montar()
  const fica = 'condicao' in montada ? valorComCondicao(bruto, montada.condicao ?? undefined) : null

  function salvar() {
    if ('erro' in montada) { toast.error(montada.erro); return }
    iniciar(async () => {
      const r = await definirCondicao(tenantId, { item, condicao: montada.condicao })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Condição salva.')
      router.refresh()
    })
  }

  return (
    <fieldset className="sistema-adicional" aria-label={`Condição: ${ROTULO[item]}`}>
      <legend className="field-label">{ROTULO[item]}</legend>
      <p className="suporte-texto-fraco">
        Preço cheio: {reaisDe(bruto)} · agora: <strong>{atual ? descreverCondicao(atual) : 'preço normal'}</strong>
      </p>
      <SegSelect options={OPCOES} value={tipo} onSelect={k => setTipo(k as Tipo)} ariaLabel={`Condição de ${ROTULO[item]}`} />
      <div className="sistema-acoes">
        {tipo === 'percentual' && (
          <label className="suporte-campo"><span className="suporte-texto-fraco">Percentual</span>
            <input className="field" inputMode="numeric" value={percentual} onChange={e => setPercentual(e.target.value)} placeholder="20" data-largura="quantidade" />
          </label>
        )}
        {tipo === 'valor' && (
          <label className="suporte-campo"><span className="suporte-texto-fraco">Desconto (R$)</span>
            <input className="field" inputMode="decimal" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" data-largura="preco" />
          </label>
        )}
        {tipo !== 'normal' && (
          <label className="suporte-campo"><span className="suporte-texto-fraco">Até (opcional)</span>
            <input className="field" type="date" value={ate} onChange={e => setAte(e.target.value)} data-largura="preco" />
          </label>
        )}
        <button type="button" className="btn-secondary" disabled={pendente} onClick={salvar}>{pendente ? 'Salvando…' : 'Salvar'}</button>
        {fica != null && <span className="suporte-texto-fraco">Fica: {reaisDe(fica)} por mês</span>}
      </div>
    </fieldset>
  )
}
