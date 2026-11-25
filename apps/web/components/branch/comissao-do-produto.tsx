'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { comissaoNoCadastroDoProduto } from '@/actions/comissoes'
import { recusaDoValorDaComissao, type ComissaoNoCadastroDoProduto, type TipoDeRegra } from '@/lib/comissoes/config'
import { parseDecimal, parseDinheiro, NUMERO_INVALIDO, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { Dica } from '@/components/shared/dica'

const pct = (n: number) => `${String(n).replace('.', ',')}%`
const textoDoValor = (tipo: TipoDeRegra | null, valor: number | null) => valor == null ? ''
  : tipo === 'FIXED_AMOUNT' ? valor.toFixed(2).replace('.', ',') : String(valor).replace('.', ',')

/**
 * A comissão de venda do produto, no CADASTRO dele (o Heitor, 03/11: "se cada
 * produto pode ter uma comissão diferente, o que faz sentido é que em cada
 * produto se possa registrar uma comissão diferente"). Configurações →
 * Comissões escolhe o modo e a regra geral; aqui, a regra DESTE produto.
 *
 * - Só aparece a quem muda comissão (o Financeiro em Gerenciar, da rede): o
 *   servidor diz (`comissaoNoCadastroDoProduto` nulo) e recusa o campo de quem
 *   não pode.
 * - Com "uma regra sobre o total", não há o que registrar no produto: a seção
 *   diz isso e o caminho para mudar, sem campo (decisão desta frente).
 * - "Por produto": % do vendido ou R$ por unidade; vazio = a regra geral. O
 *   campo `comissao` vai no formulário do produto (JSON), e `updateProduct` /
 *   `createProduct` o gravam junto.
 */
export function ComissaoDoProduto({ productId }: { productId: string | null }) {
  const [info, setInfo] = useState<ComissaoNoCadastroDoProduto | null | undefined>(undefined)
  const [tipo, setTipo] = useState<TipoDeRegra>('PERCENTAGE')
  const [valor, setValor] = useState('')

  useEffect(() => {
    let vivo = true
    comissaoNoCadastroDoProduto(productId).then(r => {
      if (!vivo) return
      setInfo(r)
      if (r) { setTipo(r.tipo ?? 'PERCENTAGE'); setValor(textoDoValor(r.tipo, r.valor)) }
    }).catch(() => { if (vivo) setInfo(null) })
    return () => { vivo = false }
  }, [productId])

  if (!info) return null

  const caixa = {
    display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--hairline)',
  } as const
  const rotulo = { fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' } as const
  const dica = { fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' } as const

  if (info.modo === 'TOTAL') {
    return (
      <div data-comissao-do-produto style={caixa}>
        <span style={rotulo}>Comissão na venda</span>
        <span style={dica}>
          A rede comissiona a venda de produto por uma regra sobre o total
          {info.geralPct != null ? ` (${pct(info.geralPct)} do vendido)` : ' (hoje, sem comissão)'}, a mesma para todo produto.
          {' '}Para cada produto ter a sua, escolha “Por produto” em{' '}
          <Link href="/admin/settings?tab=comissoes" style={{ color: 'var(--brand)', fontWeight: 700 }}>Configurações → Comissões e taxas</Link>.
        </span>
      </div>
    )
  }

  const texto = valor.trim()
  const lido = !texto ? null : tipo === 'FIXED_AMOUNT' ? parseDinheiro(texto) : parseDecimal(texto, 2)
  const invalido = lido != null && Number.isNaN(lido)
  // O impossível (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."):
  // acima de 100% e o R$ por unidade acima do limite do registro. O servidor recusa o mesmo.
  const recusa = lido == null || invalido ? null : recusaDoValorDaComissao(tipo, lido)
  const campo = invalido ? 'invalido' : JSON.stringify(lido == null ? { tipo: null, valor: null } : { tipo, valor: lido })
  const geral = info.geralPct != null ? `a regra geral (${pct(info.geralPct)})` : 'a regra geral (hoje, sem comissão)'

  return (
    <div data-comissao-do-produto style={caixa}>
      {/* O "como comissiona" mora na dica ao lado do rótulo (2026-11-16 — era uma linha embaixo do campo). */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={rotulo}>Comissão na venda deste produto</span>
        <Dica rotulo="Como comissiona a venda deste produto">
          {texto
            ? (tipo === 'FIXED_AMOUNT' ? 'Quem vendeu ganha esse valor por unidade vendida.' : 'Quem vendeu ganha esse percentual da parte do produto no vendido (com o desconto).')
            : `Vazio: vale ${geral}.`}
          {' '}Vale para as próximas vendas.
        </Dica>
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="field" aria-label="Tipo da comissão" value={tipo} style={{ width: 'auto' }}
          onChange={e => setTipo(e.target.value as TipoDeRegra)}>
          <option value="PERCENTAGE">% do vendido</option>
          <option value="FIXED_AMOUNT">R$ por unidade</option>
        </select>
        <input className="field" inputMode="decimal" aria-label="Valor da comissão" value={valor} style={{ width: 120 }}
          placeholder={tipo === 'FIXED_AMOUNT' ? '0,00' : 'Regra geral'}
          onChange={e => setValor(e.target.value)} />
      </div>
      <input type="hidden" name="comissao" value={campo} />
      {invalido && (
        <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 600 }}>
          {tipo === 'FIXED_AMOUNT' ? DINHEIRO_INVALIDO : NUMERO_INVALIDO}
        </span>
      )}
      {recusa && (
        <span role="alert" data-recusa-da-comissao style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 600 }}>{recusa}</span>
      )}
    </div>
  )
}
