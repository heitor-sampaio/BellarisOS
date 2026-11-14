'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Download, Info } from 'lucide-react'
import { toast } from 'sonner'
import type { TaxasDoPeriodo } from '@/lib/metrics'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { rotuloDaBandeira } from '@/lib/financeiro/bandeiras'
import { baixarCsv } from '@/lib/financeiro/csv-dos-lancamentos'
import { csvDoFechamentoDoDia } from '@/actions/fechamento'
import { JanelaModal } from '@/components/shared/janela-modal'
import { useFuso } from '@/components/shared/fuso'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O que era do Fechamento do dia e passou ao Financeiro (CX6 do plano de
 * adaptação — a revisão do Heitor, 2026-11-13): no período e nas unidades do
 * Financeiro, a venda no cartão sem taxa cadastrada (saiu sem desconto da
 * operadora, F16-2) e as taxas da maquininha estimadas (só para conferência:
 * não saem do saldo). Os números vêm de lib/metrics (`getTaxasDoPeriodo`).
 */
export function AvisosDasTaxas({ dados }: { dados: TaxasDoPeriodo | null | undefined }) {
  if (!dados) return null
  const { taxas, vendasSemTaxa } = dados
  if (!vendasSemTaxa.length && taxas <= 0) return null
  const formas = vendasSemTaxa.map(x => {
    const b = rotuloDaBandeira(x.bandeira)
    return `${rotuloDaForma(x.metodo, x.vezes)}${b ? ` (${b})` : ''}: ${x.vendas} ${x.vendas === 1 ? 'venda' : 'vendas'}, ${brl(x.valor)}`
  }).join('; ')
  return (
    <div data-avisos-das-taxas style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {vendasSemTaxa.length > 0 && (
        <p data-aviso-sem-taxa role="status" style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, padding: '10px 14px',
          borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--surface)',
          fontSize: 'var(--text-sm-sz)', color: 'var(--text)',
        }}>
          <AlertTriangle size={15} aria-hidden style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <span>Sem taxa da maquininha cadastrada — saiu sem desconto da operadora: {formas}. Cadastre a taxa em Configurações → Comissões e taxas.</span>
        </p>
      )}
      {taxas > 0 && (
        <p data-taxas-estimadas style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          <Info size={13} aria-hidden style={{ flexShrink: 0 }} />
          Taxas da maquininha no período (estimadas): {brl(taxas)} — só para conferência; não saem do saldo.
        </p>
      )}
    </div>
  )
}

/**
 * A planilha do Fechamento do dia (CX6): o dia e, com mais de uma unidade, a
 * unidade. O servidor monta o CSV (`csvDoFechamentoDoDia`, a mesma conta que o
 * Fechamento exportava); o navegador baixa.
 */
export function CsvDoFechamentoDoDia({ unidades, unidadeInicial }: {
  unidades:        { id: string; name: string }[]
  /** A unidade já recortada na tela (o filtro do Financeiro), se houver. */
  unidadeInicial?: string | null
}) {
  const fuso = useFuso()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
  const [aberta, setAberta] = useState(false)
  const [dia, setDia] = useState(hoje)
  const [unidade, setUnidade] = useState(
    unidades.find(u => u.id === unidadeInicial)?.id ?? (unidades.length === 1 ? unidades[0]!.id : ''))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()

  function baixar(e: React.FormEvent) {
    e.preventDefault()
    if (!unidade) { setErro('Escolha a unidade.'); return }
    if (!dia) { setErro('Escolha o dia.'); return }
    setErro(null)
    start(async () => {
      const r = await csvDoFechamentoDoDia(unidade, dia)
      if ('error' in r) { setErro(r.error); return }
      baixarCsv(r.nome, r.csv)
      toast.success('CSV do fechamento baixado.')
      setAberta(false)
    })
  }

  if (unidades.length === 0) return null
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => {
        setUnidade(unidades.find(u => u.id === unidadeInicial)?.id ?? (unidades.length === 1 ? unidades[0]!.id : ''))
        setErro(null); setAberta(true)
      }}>
        <Download size={14} aria-hidden /> CSV do fechamento do dia
      </button>
      {aberta && (
        <JanelaModal rotulo="CSV do fechamento do dia" largura={420} travado={pendente} onFechar={() => setAberta(false)}>
          <form onSubmit={baixar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>CSV do fechamento do dia</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
                As formas de pagamento, o total, o dinheiro esperado, os estornos e quem recebeu — a planilha da contabilidade.
              </p>
            </div>
            <label className="field-label" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              Dia
              <input type="date" className="field" value={dia} max={hoje} onChange={e => setDia(e.target.value)} />
            </label>
            {unidades.length > 1 && (
              <label className="field-label" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                Unidade
                <select className="filtro-select" value={unidade} onChange={e => setUnidade(e.target.value)}>
                  <option value="">Selecione…</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            )}
            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-ghost" disabled={pendente} onClick={() => setAberta(false)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Montando…' : 'Baixar'}</button>
            </div>
          </form>
        </JanelaModal>
      )}
    </>
  )
}
