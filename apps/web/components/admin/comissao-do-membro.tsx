'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, X } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarRegrasDoProfissional } from '@/actions/comissoes'
import { rotuloDaRegra, type RegraDeComissao, type TipoDeRegra } from '@/lib/comissoes/config'

/**
 * A comissão de um membro da equipe: o PADRÃO (percentual, valor fixo ou
 * nenhum) e as EXCEÇÕES por procedimento. Decisão do Heitor (2026-09-30): a
 * regra é do profissional; o procedimento só entra como exceção.
 *
 * O botão é o próprio chip com a regra padrão — a tabela da equipe mostra de
 * relance quem está sem comissão. Só aparece para quem tem `financial: MANAGE`
 * (a action confere de novo).
 */

type Tipo = TipoDeRegra | 'NENHUMA'
interface Linha { procedure_id: string; tipo: TipoDeRegra; valor: string }

const TIPOS = [
  { key: 'PERCENTAGE',   label: 'Percentual' },
  { key: 'FIXED_AMOUNT', label: 'Valor fixo' },
  { key: 'NENHUMA',      label: 'Sem comissão' },
]

const paraTexto = (n: number) => String(n).replace('.', ',')
/** "1.250,50" e "12.5" valem: com vírgula, o ponto é de milhar; sem ela, é decimal. */
const paraNumero = (t: string) => {
  const s = t.trim()
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

export function ComissaoDoMembro({ membro, regras, procedimentos, atende }: {
  membro:        { id: string; nome: string }
  regras:        RegraDeComissao[]
  procedimentos: { id: string; name: string }[]
  /** Atende clientes: sem padrão, o chip avisa. */
  atende:        boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [abertura, setAbertura] = useState(0)
  const abrir = useCallback(() => { setAbertura(n => n + 1); dialogRef.current?.showModal() }, [])
  const fechar = useCallback(() => dialogRef.current?.close(), [])

  const padrao = regras.find(r => r.procedure_id === null) ?? null
  const excecoes = regras.filter(r => r.procedure_id !== null).length
  const semRegra = atende && !padrao

  return (
    <>
      <button type="button" onClick={abrir} title={`Comissão de ${membro.nome}`} aria-label={`Comissão de ${membro.nome}`}
        className={semRegra ? 'chip chip-warning' : 'chip chip-muted'} style={{ cursor: 'pointer' }}
        data-comissao={membro.id}>
        {padrao ? `Comissão ${rotuloDaRegra(padrao)}` : 'Sem comissão'}
        {excecoes > 0 && ` · ${excecoes} ${excecoes === 1 ? 'exceção' : 'exceções'}`}
      </button>

      <dialog ref={dialogRef} className="modal modal-flex" style={{ maxWidth: 560, textAlign: 'left' }}
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
            <Formulario key={abertura} membroId={membro.id} regras={regras} procedimentos={procedimentos} onFim={fechar} />
          </div>
        </div>
      </dialog>
    </>
  )
}

function Formulario({ membroId, regras, procedimentos, onFim }: {
  membroId:      string
  regras:        RegraDeComissao[]
  procedimentos: { id: string; name: string }[]
  onFim:         () => void
}) {
  const router = useRouter()
  const padrao = regras.find(r => r.procedure_id === null) ?? null
  const [tipo, setTipo] = useState<Tipo>(padrao?.tipo ?? 'NENHUMA')
  const [valor, setValor] = useState(padrao ? paraTexto(padrao.valor) : '')
  const [linhas, setLinhas] = useState<Linha[]>(() => regras.filter(r => r.procedure_id !== null)
    .map(r => ({ procedure_id: r.procedure_id!, tipo: r.tipo, valor: paraTexto(r.valor) })))
  const [erro, setErro] = useState<string | null>(null)
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
    iniciar(async () => {
      const r = await salvarRegrasDoProfissional(membroId, { padrao: regraPadrao, excecoes })
      if (r.error) { setErro(r.error); return }
      onFim()
      router.refresh()
    })
  }

  const ajuda = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="overline">Comissão padrão</p>
        <SegSelect ariaLabel="Tipo da comissão padrão" value={tipo} onSelect={k => setTipo(k as Tipo)} options={TIPOS} />
        {tipo !== 'NENHUMA' && (
          <CampoDeValor tipo={tipo} valor={valor} onChange={setValor} rotulo="Valor da comissão padrão" />
        )}
        <p style={ajuda}>
          {tipo === 'NENHUMA'
            ? 'Sem padrão, só os procedimentos com exceção abaixo geram comissão.'
            : tipo === 'PERCENTAGE'
              ? 'Sobre o valor de cada procedimento executado, conforme Configurações → Comissões.'
              : 'Um valor fixo por procedimento executado.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
        <p className="overline">Exceções por procedimento</p>
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

      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

function CampoDeValor({ tipo, valor, onChange, rotulo }: {
  tipo: TipoDeRegra; valor: string; onChange: (v: string) => void; rotulo: string
}) {
  const pct = tipo === 'PERCENTAGE'
  return (
    <div style={{ position: 'relative' }}>
      {!pct && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>R$</span>}
      <input className="field" inputMode="decimal" aria-label={rotulo} placeholder={pct ? '0' : '0,00'} value={valor}
        onChange={e => onChange(e.target.value)} style={{ paddingLeft: pct ? undefined : 36, paddingRight: pct ? 30 : undefined }} />
      {pct && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>%</span>}
    </div>
  )
}
