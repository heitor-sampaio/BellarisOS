'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SeloUnidadeDesativada } from '@/components/shared/selo-unidade-desativada'
import { useRouter } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { fecharComissoes, estornarFechamento } from '@/actions/comissoes'
import type { ResumoDoProfissional, LancamentoDoExtrato, Fechamento } from '@/lib/comissoes/leitura'
import { textoDaBase } from '@/lib/comissoes/base-efetiva'
import { origemDoLancamento as origemDe, tituloDoLancamento, regraDoLancamento, rotuloDaBaseDoLancamento as base, csvDoExtrato, ehDeVenda } from '@/lib/comissoes/extrato-texto'
import { useFuso } from '@/components/shared/fuso'

/**
 * Financeiro → Comissões (os dois portais). Por profissional e unidade: o que
 * foi lançado no período, o que está a pagar e o que foi pago; o extrato de
 * cada um; "fechar e pagar" (vira despesa paga no financeiro); o CSV do
 * extrato; e os últimos fechamentos. Quem só vê as próprias comissões vê a
 * própria linha, sem fechar.
 *
 * A comissão só fica a pagar com o pagamento INTEGRAL da cliente (H4,
 * 2026-11-01). Antes disso a linha aparece como "aguardando o pagamento
 * integral", com o previsto, fora do a pagar e do fechamento (A53: o extrato
 * não dizia que a comissão era sobre dinheiro que ainda não tinha entrado).
 */

const TIPO: Record<LancamentoDoExtrato['kind'], string> = { LIBERACAO: 'Liberação', AJUSTE: 'Ajuste', ESTORNO: 'Estorno', AGUARDANDO: 'Aguardando' }
const SITUACAO: Record<LancamentoDoExtrato['status'], string> = { OPEN: 'A pagar', PAID: 'Paga', AGUARDANDO: 'Aguardando o pagamento integral' }
const CHIP: Record<LancamentoDoExtrato['status'], string> = { OPEN: 'chip chip-muted', PAID: 'chip chip-success', AGUARDANDO: 'chip chip-warning' }
const METODOS = [
  { key: 'PIX', label: 'Pix' }, { key: 'CASH', label: 'Dinheiro' },
  { key: 'DEBIT_CARD', label: 'Débito' }, { key: 'CREDIT_CARD', label: 'Crédito' },
]

// O dia e a hora do lançamento no relógio da unidade (F62b). O período do
// fechamento (inicio/fim) é o da comissão, da rede: fica em Brasília de propósito.
const data = (iso: string | null, fuso = 'America/Sao_Paulo') => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso }) : '—'
const hora = (iso: string, fuso = 'America/Sao_Paulo') => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })

export interface PropsDaTela {
  titulo:        string
  basePath:      string
  voltarPara:    string
  periodos:      { chave: string; rotulo: string }[]
  periodoAtual:  string
  /** A32 da 10ª: o período escolhido ainda corre (o fechamento paga até agora). */
  periodoEmCurso?: boolean
  /** Portal da rede: o filtro de unidade. */
  /** `ativa: false` = a desativada com comissão a pagar (F72): o filtro a alcança, com o selo. */
  unidades?:     { id: string; name: string; ativa?: boolean }[]
  unidadeAtual?: string
  resumo:        ResumoDoProfissional[]
  totais:        { aPagar: number; liberado: number; pago: number; aguardando: number }
  extrato:       LancamentoDoExtrato[]
  fechamentos:   Fechamento[]
  podeFechar:    boolean
  soAsProprias:  boolean
  /**
   * FI6: a tela é a aba Comissões do Financeiro — o cabeçalho com as abas vem
   * de cima, o título vira subtítulo e o "← Financeiro" some (as abas levam).
   */
  dentroDasAbas?: boolean
}

export function FinanceiroComissoes(p: PropsDaTela) {
  const router = useRouter()
  const fuso = useFuso()
  const [aberto, setAberto] = useState<string | null>(null)

  function navegar(periodo: string, unidade = p.unidadeAtual ?? '') {
    const q = new URLSearchParams({ periodo })
    if (unidade) q.set('unidade', unidade)
    router.push(`${p.basePath}?${q.toString()}`)
  }

  function exportarCsv() {
    const nome = new Map(p.resumo.map(r => [r.professionalId, r.professionalName]))
    const unidade = new Map(p.resumo.map(r => [r.branchId, r.branchName]))
    // D3 da 10ª, A17 e A44 da 11ª: o CSV mora em lib/comissoes/extrato-texto (a base efetiva,
    // a regra com a origem e o que não sai da base vazio).
    const csv = csvDoExtrato(p.extrato, nome, unidade, fuso)
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
        {p.dentroDasAbas ? (
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
            {p.titulo}
          </h2>
        ) : (
          <div>
            <Link href={p.voltarPara} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>← Financeiro</Link>
            <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', marginTop: 4 }}>
              {p.titulo}
            </h1>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="filtro-select" aria-label="Período" value={p.periodoAtual} onChange={e => navegar(e.target.value)}>
            {p.periodos.map(x => <option key={x.chave} value={x.chave}>{x.rotulo}</option>)}
          </select>
          {p.unidades?.find(u => u.id === p.unidadeAtual)?.ativa === false && <SeloUnidadeDesativada />}
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
      <p data-regra-da-comissao style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        A comissão fica a pagar quando a cliente paga tudo o que a gerou: o atendimento pago, ou a venda inteira do pacote, do plano ou do produto.
        Cartão de crédito em várias vezes conta como pago. O que a cliente ainda deve à clínica fica “aguardando o pagamento integral”
        {p.totais.aguardando > 0 ? ` (${formatBRL(p.totais.aguardando)} no total)` : ''}, fora do a pagar.
      </p>
      {/* A27 da 14ª: o fechamento é por profissional E unidade — quem atende em
          duas tem dois fechamentos, e a tela não dizia. */}
      {((p.unidades?.length ?? 0) > 1 || new Set(p.resumo.map(r => r.branchId)).size > 1) && (
        <p data-fechamento-por-unidade style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          O fechamento é por unidade: quem atende em mais de uma tem um fechamento em cada, e cada um vira uma despesa paga no financeiro daquela unidade.
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
                    {r.aguardando > 0 && (
                      <p data-aguardando style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                        {formatBRL(r.aguardando)} aguardando o pagamento integral
                      </p>
                    )}
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
                  <Fechar profissional={r} periodo={p.periodoAtual} rotuloDoPeriodo={p.periodos.find(x => x.chave === p.periodoAtual)?.rotulo ?? ''} emCurso={!!p.periodoEmCurso}
                    lancamentos={doProfissional.filter(l => l.status === 'OPEN' && l.kind !== 'AGUARDANDO')} />
                )}
                {aberto === chave && <Extrato linhas={doProfissional} nome={r.professionalName} />}
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

/**
 * "Fechar e pagar" (A21 da 10ª; decisão do Heitor, 2026-11-10: "concordo com
 * marcar e desmarcar"): os lançamentos a pagar da pessoa, TODOS MARCADOS, e o
 * "Pagar agora" se refaz ao desmarcar. O desmarcado continua a pagar e volta
 * marcado no próximo fechamento. Não há valor digitado: o lançamento é pago
 * inteiro ou fica. A soma é da TELA só para mostrar; quem paga é o banco
 * (`comissao_fechar_escolhidos`), pelos ids marcados.
 */
function Fechar({ profissional, periodo, rotuloDoPeriodo, emCurso, lancamentos }: {
  profissional: ResumoDoProfissional; periodo: string; rotuloDoPeriodo: string; emCurso: boolean
  /** Os lançamentos a pagar desta pessoa nesta unidade (os de antes do período inclusive). */
  lancamentos: LancamentoDoExtrato[]
}) {
  const fuso = useFuso()
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [metodo, setMetodo] = useState('PIX')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set())

  const marcados = lancamentos.filter(l => !desmarcados.has(l.id))
  const pagarAgora = Math.round(marcados.reduce((t, l) => t + l.amount * 100, 0)) / 100
  const ficam = lancamentos.length - marcados.length

  function alternar(id: string) {
    setDesmarcados(atual => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  function abrir() {
    setDesmarcados(new Set())
    setErro(null)
    setConfirmando(true)
  }

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await fecharComissoes(profissional.professionalId, profissional.branchId, periodo, metodo, marcados.map(l => l.id))
      if (r.error) { setErro(r.error); router.refresh(); return }
      setConfirmando(false)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!confirmando ? (
        <button type="button" className="btn-primary" style={{ alignSelf: 'flex-end' }} onClick={abrir}>
          Fechar e pagar
        </button>
      ) : (
        <div role="group" aria-label={`Fechar as comissões de ${profissional.professionalName}`}
          style={{ padding: 12, borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            Pagar a {profissional.professionalName} ({profissional.branchName}) os lançamentos marcados abaixo,
            {/* A32 da 10ª: no dia 10, "até o fim de nov/2026" prometia o mês inteiro, e o fechamento ia só até agora. */}
            {emCurso
              ? <> a pagar até agora. O período de {rotuloDoPeriodo} ainda está em curso: o que for lançado até o fim dele fica para o próximo fechamento.</>
              : <> a pagar até o fim de {rotuloDoPeriodo}.</>}
            {' '}Vira uma despesa paga no financeiro da unidade. Desmarque o que fica para depois: ele continua a pagar e volta marcado no próximo fechamento.
          </p>
          <ul data-lancamentos-do-fechamento style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--hairline)' }}>
            {lancamentos.map(l => (
              <li key={l.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!desmarcados.has(l.id)} onChange={() => alternar(l.id)} disabled={pendente}
                    aria-label={`${tituloDoLancamento(l)}${l.cliente ? ` · ${l.cliente}` : ''} · ${data(l.releasedAt, fuso)} · ${formatBRL(l.amount)}`} />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                      {tituloDoLancamento(l)}{l.cliente ? ` · ${l.cliente}` : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      {data(l.releasedAt, fuso)} · {TIPO[l.kind]}{l.motivo ? ` — ${l.motivo}` : ''}{l.origem ? ` · ${origemDe(l)}` : ''}
                    </span>
                  </span>
                  <strong style={{ fontSize: 'var(--text-sm-sz)', whiteSpace: 'nowrap', color: l.amount < 0 ? 'var(--danger)' : 'var(--text)' }}>
                    {formatBRL(l.amount)}
                  </strong>
                </label>
              </li>
            ))}
          </ul>
          <p data-pagar-agora style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>Pagar agora{ficam > 0 ? ` (${ficam === 1 ? '1 lançamento fica' : `${ficam} lançamentos ficam`} a pagar)` : ''}</span>
            <strong style={{ color: 'var(--brand)' }}>{formatBRL(pagarAgora)}</strong>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="filtro-select" aria-label="Forma de pagamento" value={metodo} onChange={e => setMetodo(e.target.value)}>
              {METODOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)} disabled={pendente}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={confirmar} disabled={pendente || marcados.length === 0 || pagarAgora <= 0}>
              {pendente ? 'Pagando…' : 'Confirmar pagamento'}
            </button>
          </div>
          {marcados.length === 0 && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Marque ao menos um lançamento para pagar.</p>
          )}
          {marcados.length > 0 && pagarAgora <= 0 && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Os marcados somam {formatBRL(pagarAgora)}: um estorno maior que o liberado fica para o próximo fechamento.
            </p>
          )}
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
    </div>
  )
}

function Extrato({ linhas, nome }: { linhas: LancamentoDoExtrato[]; nome: string }) {
  const fuso = useFuso()
  if (!linhas.length) {
    return <p style={{ padding: '0 16px 14px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Sem lançamentos no período.</p>
  }
  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      {linhas.map(l => (
        <div key={l.id} data-lancamento={l.kind}
          style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            {/* A43 da 11ª: a venda diz que é venda ("Venda do plano X"), não "Procedimento". */}
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              {tituloDoLancamento(l)}{l.cliente ? ` · ${l.cliente}` : ''}
            </p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {data(l.releasedAt, fuso)} · {l.kind === 'AGUARDANDO' ? (l.motivo ?? SITUACAO.AGUARDANDO) : `${TIPO[l.kind]}${l.motivo ? ` — ${l.motivo}` : ''}`}
              {l.origem && !ehDeVenda(l) ? ` · ${origemDe(l)}` : ''}
              {/* D3 da 10ª: a base EFETIVA (a que a conta usou) e o caminho do preço até ela; A17 da 11ª: de onde veio a regra. */}
              {l.preco != null ? ` · ${textoDaBase(base(l), l)} · ${regraDoLancamento(l, nome)}` : ''}
            </p>
          </div>
          {/* A21 da 10ª: com o pagamento parcial, cada lançamento diz se foi pago (e quando) ou se ficou a pagar. */}
          <span className={CHIP[l.status]}>{l.status === 'AGUARDANDO' ? 'Aguardando' : l.status === 'PAID' && l.pagoEm ? `Paga em ${data(l.pagoEm, fuso)}` : SITUACAO[l.status]}</span>
          {l.kind === 'AGUARDANDO' ? (
            <span style={{ minWidth: 90, textAlign: 'right', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              previsto {formatBRL(l.previsto ?? 0)}
            </span>
          ) : (
            <strong style={{ minWidth: 90, textAlign: 'right', fontSize: 'var(--text-sm-sz)', color: l.amount < 0 ? 'var(--danger)' : 'var(--text)' }}>
              {formatBRL(l.amount)}
            </strong>
          )}
        </div>
      ))}
    </div>
  )
}

/** Um fechamento da lista; quem fecha também estorna (com motivo). */
function LinhaDeFechamento({ f, podeEstornar }: { f: Fechamento; podeEstornar: boolean }) {
  const fuso = useFuso()
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
        {/* A32 da 10ª: "de 10/11 a 10/11" não dizia que era até a hora do pagamento. */}
        <span style={{ color: 'var(--text-muted)' }}>lançamentos de {data(f.inicio)} até {data(f.fim)}{f.fim ? ` às ${hora(f.fim)}` : ''}, pago em {data(f.paidAt, fuso)}</span>
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
          Estornado em {data(f.estornadoAt, fuso)}{f.estornoMotivo ? ` — ${f.estornoMotivo}` : ''}. Os lançamentos voltaram para “a pagar”.
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
