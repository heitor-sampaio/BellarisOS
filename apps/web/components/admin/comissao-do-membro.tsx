'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Banknote, Percent, Plus, Trash2, X } from 'lucide-react'
import { parseDinheiro } from '@estetica-os/utils'
import { salvarRegrasDoProfissional } from '@/actions/comissoes'
import { rotuloDaRegra, type RegraDeComissao, type TipoDeRegra } from '@/lib/comissoes/config'
import { chipDaComissao } from '@/lib/comissoes/chip-do-membro'
import { resumoDaComissaoDoMembro } from '@/lib/equipe/textos-do-cadastro'
import { Dica } from '@/components/shared/dica'

/** O título do bloco com a dica ao lado (a explicação mora na dica — docs/regras/design.md). */
const linhaComDica = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const

/**
 * A comissão de um membro da equipe: o PADRÃO (percentual, valor fixo ou
 * nenhum) e as EXCEÇÕES por procedimento. Decisão do Heitor (2026-09-30): a
 * regra é do profissional; o procedimento só entra como exceção — salvo o que
 * tem comissão GERAL (2026-10-15, em Procedimentos), que fica fora daqui.
 *
 * O botão é o próprio chip com a regra padrão — a tabela da equipe mostra de
 * relance quem está sem comissão. Só aparece para quem tem `financial: MANAGE`
 * (a action confere de novo).
 */

type Tipo = TipoDeRegra | 'NENHUMA'
interface Linha { procedure_id: string; tipo: TipoDeRegra; valor: string }

const TIPOS = [
  { key: 'PERCENTAGE',   label: 'Percentual',   icone: Percent },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo',   icone: Banknote },
  { key: 'NENHUMA',      label: 'Sem comissão', icone: Ban },
] as const

export const paraTexto = (n: number) => String(n).replace('.', ',')
/** "1.250,50", "1.400" e "12.5" valem — a regra de todo campo de dinheiro (`parseDinheiro`, D3). */
export const paraNumero = (t: string) => parseDinheiro(t)

export function ComissaoDoMembro({ membro, regras, procedimentos, comGeral = [], atende, vendaPct = null, naoVeAsProprias = false }: {
  /** A3 da 13ª (F70): o cargo dela não tem o Financeiro — ela não vê as próprias comissões. */
  naoVeAsProprias?: boolean
  membro:        { id: string; nome: string }
  regras:        RegraDeComissao[]
  procedimentos: { id: string; name: string }[]
  /** Os procedimentos com comissão GERAL: valem para todas e vencem a regra dela (A11 da 10ª). */
  comGeral?:     { id: string; name: string; regra: Pick<RegraDeComissao, 'tipo' | 'valor'> }[]
  /** Atende clientes: sem padrão, o chip avisa. */
  atende:        boolean
  /** A17 da 11ª: a comissão de venda da pessoa (%); nulo é nenhuma. */
  vendaPct?: number | null
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [abertura, setAbertura] = useState(0)
  // A22 da 20ª (princípio 7): o formulário só existe com a janela aberta — fechado,
  // o resumo de cada linha ("Comissão: nenhuma por atendimento") se empilhava na Equipe.
  const [aberta, setAberta] = useState(false)
  const abrir = useCallback(() => { setAbertura(n => n + 1); setAberta(true); dialogRef.current?.showModal() }, [])
  const fechar = useCallback(() => dialogRef.current?.close(), [])

  const padrao = regras.find(r => r.procedure_id === null) ?? null
  const excecoes = regras.filter(r => r.procedure_id !== null).length
  const semRegra = atende && !padrao

  return (
    <>
      <button type="button" onClick={abrir} title={`Comissão de ${membro.nome}`} aria-label={`Comissão de ${membro.nome}`}
        className={semRegra ? 'chip chip-warning' : 'chip chip-muted'} style={{ cursor: 'pointer' }}
        data-comissao={membro.id}>
        {/* A22 da 19ª: o chip diz QUAL comissão falta — a de atendimento (quem atende) ou a de venda. */}
        {chipDaComissao({ padrao: padrao ? rotuloDaRegra(padrao) : null, excecoes, vendaPct, atende })}
      </button>

      <dialog ref={dialogRef} className="modal modal-flex" style={{ maxWidth: 560, textAlign: 'left' }}
        onClose={() => setAberta(false)}
        onClick={e => { if (e.target === dialogRef.current) fechar() }} aria-label={`Comissão de ${membro.nome}`}>
        <div className="modal-container">
          <div style={{
            flexShrink: 0, borderBottom: '1px solid var(--hairline)', padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Comissão</h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{membro.nome}</p>
            </div>
            <button type="button" className="btn-ghost" onClick={fechar} style={{ padding: 6 }} aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="modal-body" style={{ padding: '20px 24px 24px' }}>
            {naoVeAsProprias && (
              <p data-nao-ve-as-proprias style={{
                fontSize: 'var(--text-xs-sz)', color: 'var(--text)', background: 'var(--warning-soft)',
                border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-field)', padding: '8px 12px', marginBottom: 16,
              }}>
                {membro.nome} não vê as próprias comissões: o cargo não tem Financeiro “só os próprios”. Para ver, ajuste o cargo em Configurações → Cargos.
              </p>
            )}
            {aberta && <Formulario key={abertura} membroId={membro.id} regras={regras} procedimentos={procedimentos} comGeral={comGeral} onFim={fechar}
              vendaPct={vendaPct} atende={atende} />}
          </div>
        </div>
      </dialog>
    </>
  )
}

function Formulario({ membroId, regras, procedimentos, comGeral, onFim, vendaPct, atende }: {
  vendaPct:      number | null
  /** Atende clientes: sem isso, o resumo não fala em atendimento (A22 da 20ª). */
  atende:        boolean
  membroId:      string
  regras:        RegraDeComissao[]
  procedimentos: { id: string; name: string }[]
  comGeral:      { id: string; name: string; regra: Pick<RegraDeComissao, 'tipo' | 'valor'> }[]
  onFim:         () => void
}) {
  const router = useRouter()
  const padrao = regras.find(r => r.procedure_id === null) ?? null
  const [tipo, setTipo] = useState<Tipo>(padrao?.tipo ?? 'NENHUMA')
  const [valor, setValor] = useState(padrao ? paraTexto(padrao.valor) : '')
  const [linhas, setLinhas] = useState<Linha[]>(() => regras.filter(r => r.procedure_id !== null)
    .map(r => ({ procedure_id: r.procedure_id!, tipo: r.tipo, valor: paraTexto(r.valor) })))
  const [erro, setErro] = useState<string | null>(null)
  // A17 da 11ª: vazio por padrão — nenhuma comissão de venda da pessoa.
  const [venda, setVenda] = useState(vendaPct != null && vendaPct > 0 ? paraTexto(vendaPct) : '')
  const [salvando, iniciar] = useTransition()

  const nomeDe = new Map(procedimentos.map(p => [p.id, p.name]))
  const livres = procedimentos.filter(p => !linhas.some(l => l.procedure_id === p.id))

  function mudarLinha(i: number, parte: Partial<Linha>) {
    setLinhas(ls => ls.map((l, j) => j === i ? { ...l, ...parte } : l))
  }

  function salvar() {
    setErro(null)
    const lerValor = (t: TipoDeRegra, texto: string, onde: string): number | null => {
      const n = paraNumero(texto)
      if (!texto.trim() || !Number.isFinite(n) || n < 0) { setErro(`Informe o valor ${onde}.`); return null }
      if (t === 'PERCENTAGE' && n > 100) { setErro(`Percentual acima de 100% ${onde}.`); return null }
      return n
    }
    let regraPadrao: { tipo: TipoDeRegra; valor: number } | null = null
    if (tipo !== 'NENHUMA') {
      const v = lerValor(tipo, valor, 'da comissão padrão')
      if (v === null) return
      regraPadrao = { tipo, valor: v }
    }
    const excecoes: { procedure_id: string; tipo: TipoDeRegra; valor: number }[] = []
    for (const l of linhas) {
      const v = lerValor(l.tipo, l.valor, `de ${nomeDe.get(l.procedure_id) ?? 'uma exceção'}`)
      if (v === null) return
      excecoes.push({ procedure_id: l.procedure_id, tipo: l.tipo, valor: v })
    }
    let vendaPctLido: number | null = null
    if (venda.trim()) {
      const v = paraNumero(venda)
      if (!Number.isFinite(v) || v < 0) { setErro('Informe a comissão de venda em %, ou deixe vazio.'); return }
      if (v > 100) { setErro('Comissão de venda acima de 100%.'); return }
      vendaPctLido = v
    }
    iniciar(async () => {
      const r = await salvarRegrasDoProfissional(membroId, { padrao: regraPadrao, excecoes, vendaPct: vendaPctLido })
      if (r.error) { setErro(r.error); return }
      onFim()
      router.refresh()
    })
  }

  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* A explicação de cada tipo mora na dica (2026-11-16 — era um parágrafo embaixo). */}
        <p className="overline" style={linhaComDica}>
          <span id="tipo-da-comissao-padrao">Comissão padrão</span>
          <Dica rotulo="Sobre a comissão padrão">
            {tipo === 'NENHUMA'
              ? 'Sem padrão, só os procedimentos com exceção abaixo geram comissão.'
              : tipo === 'PERCENTAGE'
                ? 'Sobre o valor de cada procedimento executado, conforme Configurações → Comissões e taxas.'
                : 'Um valor fixo por procedimento executado.'}
          </Dica>
        </p>
        {/* A20 da 18ª (princípio 7): o tipo em blocos lado a lado, como as
            formas de pagamento — no celular o segmentado virava um botão
            suspenso, parecido com o campo da comissão de venda logo abaixo. */}
        <div role="radiogroup" aria-labelledby="tipo-da-comissao-padrao" className="formas-de-pagamento">
          {TIPOS.map(t => {
            const Icone = t.icone
            const marcado = tipo === t.key
            return (
              <button key={t.key} type="button" role="radio" aria-checked={marcado} data-tipo-da-comissao={t.key}
                className={marcado ? 'forma-de-pagamento is-marcada' : 'forma-de-pagamento'}
                onClick={() => setTipo(t.key)}>
                <Icone size={18} aria-hidden />
                {t.label}
              </button>
            )
          })}
        </div>
        {tipo !== 'NENHUMA' && (
          <CampoDeValor tipo={tipo} valor={valor} onChange={setValor} rotulo="Valor da comissão padrão" />
        )}
      </div>

      {/* A17 da 11ª (princípio 1): a comissão de VENDA da pessoa, ao lado da de execução — vazia por padrão. */}
      <div data-comissao-de-venda-da-pessoa style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
        <p className="overline" style={linhaComDica}>
          <span>Comissão de venda</span>
          <Dica rotulo="Sobre a comissão de venda" largura={320}>
            Sobre o vendido, quando ela está em “Quem vendeu”: pacote, plano, pré-pago e produto. A comissão de venda do próprio pacote
            ou produto vence esta; sem as duas, vale a da rede (Configurações → Comissões e taxas). O crédito interno vendido não tem comissão de venda.
          </Dica>
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 200 }}>
          <span className="field-label">Comissão de venda (%)</span>
          <div style={{ position: 'relative' }}>
            <input className="field" inputMode="decimal" aria-label="Comissão de venda (%)" placeholder="Vazio: nenhuma" value={venda}
              onChange={e => setVenda(e.target.value)} style={{ paddingRight: 30 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>
          </div>
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
        <p className="overline" style={linhaComDica}>
          <span>Exceções por procedimento</span>
          <Dica rotulo="Sobre as exceções por procedimento">
            Procedimento com comissão geral (a mesma para todos) não aceita exceção: vale para todas e vence a regra desta pessoa. Muda em Procedimentos.
          </Dica>
        </p>
        {linhas.length === 0 && <p style={ajuda}>Nenhuma. Todo procedimento usa a comissão padrão.</p>}
        {linhas.map((l, i) => (
          <div key={l.procedure_id} data-excecao={l.procedure_id}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nomeDe.get(l.procedure_id) ?? 'Procedimento inativo'}
            </p>
            <button type="button" className="btn-ghost" style={{ padding: 6, color: 'var(--text-muted)' }}
              onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))} aria-label={`Remover a exceção de ${nomeDe.get(l.procedure_id) ?? 'procedimento'}`}>
              <Trash2 size={15} />
            </button>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="filtro-select" value={l.tipo} aria-label="Tipo da exceção"
                onChange={e => mudarLinha(i, { tipo: e.target.value as TipoDeRegra })}>
                <option value="PERCENTAGE">Percentual</option>
                <option value="FIXED_AMOUNT">Valor fixo</option>
              </select>
              <div style={{ flex: 1, minWidth: 120 }}>
                <CampoDeValor tipo={l.tipo} valor={l.valor} onChange={v => mudarLinha(i, { valor: v })}
                  rotulo={`Valor da exceção de ${nomeDe.get(l.procedure_id) ?? 'procedimento'}`} />
              </div>
            </div>
          </div>
        ))}
        {/* A11 da 10ª: QUAIS procedimentos têm a geral — ela vence a regra desta profissional. */}
        {/* A lista é dado (fica à vista); o porquê, na dica do título. */}
        {comGeral.length > 0 && (
          <div data-gerais-que-vencem style={{ ...ajuda, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Com comissão geral (vence a regra acima):</span>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {comGeral.map(g => <li key={g.id}><strong style={{ color: 'var(--text)' }}>{g.name}</strong>: {rotuloDaRegra(g.regra)}</li>)}
            </ul>
          </div>
        )}
        {livres.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} aria-hidden />
            <select className="filtro-select" value="" aria-label="Adicionar exceção"
              onChange={e => {
                const id = e.target.value
                if (id) setLinhas(ls => [...ls, { procedure_id: id, tipo: tipo === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE', valor: '' }])
              }} style={{ flex: 1 }}>
              <option value="">Adicionar exceção para um procedimento…</option>
              {livres.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* A20 da 18ª (princípio 3): o que vai valer, dito antes de salvar. */}
      <p data-resumo-da-comissao role="status" style={{
        fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
        background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
      }}>
        {resumoDaComissaoDoMembro({ tipo, valor, venda, atende })}
        {linhas.length > 0 && ` ${linhas.length === 1 ? '1 exceção' : `${linhas.length} exceções`} por procedimento.`}
      </p>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

export function CampoDeValor({ tipo, valor, onChange, rotulo }: {
  tipo: TipoDeRegra; valor: string; onChange: (v: string) => void; rotulo: string
}) {
  const pct = tipo === 'PERCENTAGE'
  return (
    <div style={{ position: 'relative' }}>
      {!pct && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>R$</span>}
      {/* A24 da 19ª: o exemplo no lugar do 0 — o campo vazio parecia já preenchido com zero. */}
      <input className="field" inputMode="decimal" aria-label={rotulo} placeholder={pct ? 'Ex.: 10' : 'Ex.: 50,00'} value={valor}
        onChange={e => onChange(e.target.value)} style={{ paddingLeft: pct ? undefined : 36, paddingRight: pct ? 30 : undefined }} />
      {pct && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>}
    </div>
  )
}
