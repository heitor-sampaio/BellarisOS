'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@estetica-os/utils'
import { corrigirCustoDoLote } from '@/actions/stock'
import { JanelaModal } from '@/components/shared/janela-modal'
import { Dica } from '@/components/shared/dica'
import { avisoDoCustoDaEntrada } from '@/lib/estoque/custo-da-entrada'

/**
 * "Corrigir custo" do lote (A10 da 24ª simulação): o custo digitado errado na
 * entrada se corrige no próprio lote enquanto nada saiu dele. Só aparece
 * nesse caso (`custoEditavel`) e para quem tem o Estoque em Gerenciar; a
 * action confere de novo (a unidade ao alcance, e o banco, que nada saiu).
 */
export function CorrigirCustoDoLote({ loteId, rotulo, custoAtual, embalagem }: {
  loteId: string; rotulo: string; custoAtual: number | null; embalagem: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [custo, setCusto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const valor = custo.trim() === '' ? null : Number(custo)
  const aviso = avisoDoCustoDaEntrada(valor, { custo: null, venda: null })

  function abrir(e: React.MouseEvent) {
    e.stopPropagation()
    setCusto(custoAtual != null ? String(custoAtual) : '')
    setErro(null)
    setAberto(true)
  }
  function salvar() {
    if (valor == null || !Number.isFinite(valor) || valor < 0) { setErro('Informe um custo de zero ou mais.'); return }
    iniciar(async () => {
      const r = await corrigirCustoDoLote(loteId, valor)
      if (r.error) { setErro(r.error); return }
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={abrir} className="btn-ghost" data-corrigir-custo
        style={{ fontSize: 'var(--text-2xs)', padding: '0 6px', color: 'var(--brand)', fontWeight: 700 }}>
        Corrigir custo
      </button>
      {aberto && (
        <span style={{ display: 'contents' }} onClick={e => e.stopPropagation()}>
          <JanelaModal rotulo={`Corrigir o custo · ${rotulo}`} largura={440} travado={pendente} onFechar={() => setAberto(false)} fechaNoFundo={false}>
            <div data-janela-corrigir-custo style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Corrigir o custo</h2>
                <Dica rotulo="Quando o custo se corrige aqui">
                  Enquanto nada saiu do lote, o custo da entrada se corrige nele: o valor em estoque, o insumo e a margem passam a usar o
                  novo, e a Auditoria guarda o antes e o depois. Depois da primeira saída, use o Ajuste com o motivo “Correção de cadastro”.
                </Dica>
              </div>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                {rotulo}{custoAtual != null ? ` · hoje ${formatBRL(custoAtual)}/${embalagem}` : ''}
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                Custo por {embalagem}
                <input className="field" type="number" step="0.01" min="0" inputMode="decimal" value={custo} autoFocus
                  onChange={e => setCusto(e.target.value)} placeholder="0,00" />
              </label>
              {aviso && (
                <p data-custo-fora-do-comum role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.45 }}>
                  {aviso}
                </p>
              )}
              {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setAberto(false)} disabled={pendente}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={salvar} disabled={pendente || valor == null}>
                  {pendente ? 'Salvando…' : 'Salvar custo'}
                </button>
              </div>
            </div>
          </JanelaModal>
        </span>
      )}
    </>
  )
}
