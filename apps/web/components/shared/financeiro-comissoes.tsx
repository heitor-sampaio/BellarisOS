'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { fecharComissoes, estornarFechamento } from '@/actions/comissoes'
import type { ResumoDoProfissional, LancamentoDoExtrato, Fechamento } from '@/lib/comissoes/leitura'

/**
 * Financeiro → Comissões (os dois portais). Por profissional e unidade: o que
 * foi lançado no período, o que está a pagar e o que foi pago; o extrato de
 * cada um; "fechar e pagar" (vira despesa paga no financeiro); o CSV do
 * extrato; e os últimos fechamentos. Quem só vê as próprias comissões vê a
 * própria linha, sem fechar.
 */

const TIPO: Record<LancamentoDoExtrato['kind'], string> = { LIBERACAO: 'Liberação', AJUSTE: 'Ajuste', ESTORNO: 'Estorno' }
const ORIGEM: Record<string, string> = { AVULSO: 'Atendimento', PLANO: 'Plano', PACOTE: 'Pacote' }
const METODOS = [
  { key: 'PIX', label: 'Pix' }, { key: 'CASH', label: 'Dinheiro' },
  { key: 'DEBIT_CARD', label: 'Débito' }, { key: 'CREDIT_CARD', label: 'Crédito' },
]

const data = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const regra = (l: LancamentoDoExtrato) => l.regraTipo == null ? '—'
  : l.regraTipo === 'PERCENTAGE' ? `${String(l.regraValor).replace('.', ',')}%` : `${formatBRL(l.regraValor ?? 0)} fixo`

export interface PropsDaTela {
  titulo:        string
  basePath:      string
  voltarPara:    string
  periodos:      { chave: string; rotulo: string }[]
  periodoAtual:  string
  /** Portal da rede: o filtro de unidade. */
  unidades?:     { id: string; name: string }[]
  unidadeAtual?: string
  resumo:        ResumoDoProfissional[]
  totais:        { aPagar: number; liberado: number; pago: number }
  extrato:       LancamentoDoExtrato[]
  fechamentos:   Fechamento[]
  podeFechar:    boolean
  soAsProprias:  boolean
  /** A rede libera no pagamento do cliente: a tela explica por que há atendimento sem comissão ainda. */
  modoPagamento: boolean
}

export function FinanceiroComissoes(p: PropsDaTela) {
  const router = useRouter()
  const [aberto, setAberto] = useState<string | null>(null)

  function navegar(periodo: string, unidade = p.unidadeAtual ?? '') {
    const q = new URLSearchParams({ periodo })
    if (unidade) q.set('unidade', unidade)
    router.push(`${p.basePath}?${q.toString()}`)
  }

  function exportarCsv() {
    const nome = new Map(p.resumo.map(r => [r.professionalId, r.professionalName]))
    const unidade = new Map(p.resumo.map(r => [r.branchId, r.branchName]))
    const campo = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const linhas = [
      ['Lançamento', 'Profissional', 'Unidade', 'Atendimento', 'Cliente', 'Procedimento', 'Origem', 'Base', 'Regra', 'Tipo', 'Motivo', 'Valor', 'Situação'],
      ...p.extrato.map(l => [
        data(l.releasedAt), nome.get(l.professionalId) ?? '', unidade.get(l.branchId) ?? '', data(l.scheduledAt),
        l.cliente ?? '', l.procedimento ?? '', l.origem ? ORIGEM[l.origem] ?? l.origem : '',
        l.preco == null ? '' : l.preco.toFixed(2).replace('.', ','), regra(l), TIPO[l.kind], l.motivo ?? '',
        l.amount.toFixed(2).replace('.', ','), l.status === 'PAID' ? 'Paga' : 'A pagar',
      ]),
    ]
    // BOM + ponto e vírgula: é o que o Excel em pt-BR abre certo.
    const csv = '﻿' + linhas.map(l => l.map(campo).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `comissoes-${p.periodoAtual}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kpi = (rotulo: string, valor: number, destaque = false) => (
    <div className={destaque ? 'card-brand' : 'card'} style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="overline" style={destaque ? { color: 'var(--on-brand)' } : undefined}>{rotulo}</span>
      <span style={{ fontSize: 'var(--text-kpi)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)' }}>
        {formatBRL(valor)}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link href={p.voltarPara} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>← Financeiro</Link>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', marginTop: 4 }}>
            {p.titulo}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="filtro-select" aria-label="Período" value={p.periodoAtual} onChange={e => navegar(e.target.value)}>
            {p.periodos.map(x => <option key={x.chave} value={x.chave}>{x.rotulo}</option>)}
          </select>
          {p.unidades && p.unidades.length > 1 && (
            <select className="filtro-select" aria-label="Unidade" value={p.unidadeAtual ?? ''} onChange={e => navegar(p.periodoAtual, e.target.value)}>
              <option value="">Todas as unidades</option>
              {p.unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button type="button" className="btn-secondary" onClick={exportarCsv} disabled={!p.extrato.length}>
            <Download size={15} aria-hidden /> Exportar CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} aria-label="Totais">
        {kpi('A pagar', p.totais.aPagar, true)}
        {kpi('Lançado no período', p.totais.liberado)}
        {kpi('Pago no período', p.totais.pago)}
      </div>
      {p.modoPagamento && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          A rede libera a comissão quando o cliente paga: atendimento ainda não pago não aparece aqui.
        </p>
      )}

      {p.resumo.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
          {p.soAsProprias ? 'Você não tem comissão neste período.' : 'Nenhuma comissão neste período.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.resumo.map(r => {
            const chave = `${r.professionalId}:${r.branchId}`
            const doProfissional = p.extrato.filter(l => l.professionalId === r.professionalId && l.branchId === r.branchId)
            return (
              <div key={chave} className="card" style={{ padding: 0 }} data-comissoes-de={r.professionalId}>
                <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{r.professionalName}</p>
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{r.branchName}</p>
                  </div>
                  {/* Os três números andam juntos: no celular descem inteiros
                      para baixo do nome, em vez de um subir e dois descerem. */}
                  <div style={{ display: 'flex', gap: 12, flex: '1 1 300px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <Numero rotulo="Lançado" valor={r.liberado} />
                    <Numero rotulo="Pago" valor={r.pago} />
                    <Numero rotulo="A pagar" valor={r.aPagar} forte />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button type="button" className="btn-ghost" aria-expanded={aberto === chave}
                      onClick={() => setAberto(aberto === chave ? null : chave)}>
                      Extrato <ChevronDown size={14} aria-hidden style={{ transform: aberto === chave ? 'rotate(180deg)' : undefined }} />
                    </button>
                  </div>
                </div>
                {p.podeFechar && r.aPagar > 0 && (
                  <Fechar profissional={r} periodo={p.periodoAtual} rotuloDoPeriodo={p.periodos.find(x => x.chave === p.periodoAtual)?.rotulo ?? ''} />
                )}
                {aberto === chave && <Extrato linhas={doProfissional} />}
              </div>
            )
          })}
        </div>
      )}

      {p.fechamentos.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Fechamentos">
          <p className="overline">Últimos fechamentos</p>
          {p.fechamentos.map(f => <LinhaDeFechamento key={f.id} f={f} podeEstornar={p.podeFechar} />)}
        </div>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, forte = false }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 84, maxWidth: 120, textAlign: 'right' }}>
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{rotulo}</p>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: forte ? 'var(--weight-extrabold)' : 'var(--weight-semibold)', color: forte ? 'var(--brand)' : 'var(--text)' }}>
        {formatBRL(valor)}
      </p>
    </div>
  )
}

function Fechar({ profissional, periodo, rotuloDoPeriodo }: { profissional: ResumoDoProfissional; periodo: string; rotuloDoPeriodo: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [metodo, setMetodo] = useState('PIX')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await fecharComissoes(profissional.professionalId, profissional.branchId, periodo, metodo)
      if (r.error) { setErro(r.error); return }
      setConfirmando(false)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!confirmando ? (
        <button type="button" className="btn-primary" style={{ alignSelf: 'flex-end' }} onClick={() => setConfirmando(true)}>
          Fechar e pagar
        </button>
      ) : (
        <div role="group" aria-label={`Fechar as comissões de ${profissional.professionalName}`}
          style={{ padding: 12, borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            Pagar <strong>{formatBRL(profissional.aPagar)}</strong> a {profissional.professionalName} ({profissional.branchName}),
            tudo o que está a pagar até o fim de {rotuloDoPeriodo}. Vira uma despesa paga no financeiro da unidade.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="filtro-select" aria-label="Forma de pagamento" value={metodo} onChange={e => setMetodo(e.target.value)}>
              {METODOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={confirmar} disabled={pendente}>{pendente ? 'Pagando…' : 'Confirmar pagamento'}</button>
          </div>
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
    </div>
  )
}

function Extrato({ linhas }: { linhas: LancamentoDoExtrato[] }) {
  if (!linhas.length) {
    return <p style={{ padding: '0 16px 14px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Sem lançamentos no período.</p>
  }
  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      {linhas.map(l => (
        <div key={l.id} data-lancamento={l.kind}
          style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              {l.procedimento ?? 'Procedimento'}{l.cliente ? ` · ${l.cliente}` : ''}
            </p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {data(l.releasedAt)} · {TIPO[l.kind]}{l.motivo ? ` — ${l.motivo}` : ''}
              {l.origem ? ` · ${ORIGEM[l.origem] ?? l.origem}` : ''}
              {l.preco != null ? ` · base ${formatBRL(l.preco)} · ${regra(l)}` : ''}
            </p>
          </div>
          <span className={l.status === 'PAID' ? 'chip chip-success' : 'chip chip-muted'}>{l.status === 'PAID' ? 'Paga' : 'A pagar'}</span>
          <strong style={{ minWidth: 90, textAlign: 'right', fontSize: 'var(--text-sm-sz)', color: l.amount < 0 ? 'var(--danger)' : 'var(--text)' }}>
            {formatBRL(l.amount)}
          </strong>
        </div>
      ))}
    </div>
  )
}

/** Um fechamento da lista; quem fecha também estorna (com motivo). */
function LinhaDeFechamento({ f, podeEstornar }: { f: Fechamento; podeEstornar: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function estornar() {
    setErro(null)
    iniciar(async () => {
      const r = await estornarFechamento(f.id, motivo)
      if (r.error) { setErro(r.error); return }
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <div data-fechamento={f.id} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)' }}>
        <span style={{ color: 'var(--text)' }}>{f.professionalName} · {f.branchName}</span>
        <span style={{ color: 'var(--text-muted)' }}>de {data(f.inicio)} a {data(f.fim)}, pago em {data(f.paidAt)}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {f.estornadoAt && <span className="chip chip-muted">Estornado</span>}
          <strong style={{ color: 'var(--text)', textDecoration: f.estornadoAt ? 'line-through' : undefined }}>{formatBRL(f.total)}</strong>
          {podeEstornar && !f.estornadoAt && !aberto && (
            <button type="button" className="btn-ghost" onClick={() => setAberto(true)}>Estornar</button>
          )}
        </span>
      </div>
      {f.estornadoAt && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Estornado em {data(f.estornadoAt)}{f.estornoMotivo ? ` — ${f.estornoMotivo}` : ''}. Os lançamentos voltaram para “a pagar”.
        </p>
      )}
      {aberto && (
        <div role="group" aria-label="Estornar o fechamento"
          style={{ padding: 12, borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            A despesa de {formatBRL(f.total)} é estornada no financeiro e os lançamentos voltam para “a pagar”.
          </p>
          <input className="field" aria-label="Motivo do estorno" placeholder="Motivo (obrigatório)" value={motivo}
            onChange={e => setMotivo(e.target.value)} maxLength={300} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => setAberto(false)} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={estornar} disabled={pendente || !motivo.trim()}>
              {pendente ? 'Estornando…' : 'Confirmar estorno'}
            </button>
          </div>
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
    </div>
  )
}
