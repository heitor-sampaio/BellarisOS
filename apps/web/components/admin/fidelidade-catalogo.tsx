'use client'

import { useState, useTransition } from 'react'
import { Gift, Loader2, Pencil, Plus } from 'lucide-react'
import { catalogoDeRecompensas, salvarRecompensa } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { ROTULO_DO_TIPO, TIPOS_DE_RECOMPENSA, descricaoDoVoucher, type TipoDeRecompensa } from '@/lib/fidelidade/voucher'
import type { Recompensa } from '@/lib/fidelidade/leitura'

type Catalogo = Awaited<ReturnType<typeof catalogoDeRecompensas>>

/**
 * Configurações → Fidelidade → Catálogo de recompensas.
 *
 * A rede cadastra o que o cliente pode ganhar trocando pontos. Trocar é na
 * ficha do cliente (a equipe troca; o cliente só vê pelo portal). Editar uma
 * recompensa não muda os vouchers já emitidos — eles guardam o retrato de
 * quando foram trocados.
 */
export function FidelidadeCatalogo({ inicial, podeEditar }: { inicial: Catalogo; podeEditar: boolean }) {
  const [catalogo, setCatalogo] = useState(inicial)
  const [editando, setEditando] = useState<Recompensa | 'nova' | null>(null)

  async function recarregar() {
    setCatalogo(await catalogoDeRecompensas())
  }

  return (
    <section className="card" data-testid="catalogo-de-recompensas"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="titulo-catalogo">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 id="titulo-catalogo" style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            Catálogo de recompensas
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3, maxWidth: 520 }}>
            O que o cliente pode ganhar trocando pontos. A troca vira um voucher com validade, feita pela equipe na ficha do cliente.
          </p>
        </div>
        {podeEditar && editando === null && (
          <button type="button" className="btn-primary" onClick={() => setEditando('nova')}>
            <Plus size={14} /> Nova recompensa
          </button>
        )}
      </div>

      {editando !== null && (
        <FormularioDeRecompensa
          recompensa={editando === 'nova' ? null : editando}
          procedimentos={catalogo.procedimentos}
          produtos={catalogo.produtos}
          onCancelar={() => setEditando(null)}
          onSalvo={async () => { setEditando(null); await recarregar() }}
        />
      )}

      {catalogo.recompensas.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhuma recompensa cadastrada.</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {catalogo.recompensas.map(r => (
            <li key={r.id} data-testid="recompensa" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--hairline)',
              opacity: r.is_active ? 1 : 0.55,
            }}>
              <Gift size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                  {r.name}{!r.is_active && ' · inativa'}
                </p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  {ROTULO_DO_TIPO[r.type as TipoDeRecompensa] ?? r.type}
                  {(r.type === 'DESCONTO_VALOR' || r.type === 'DESCONTO_PERCENTUAL') && ` · ${descricaoDoVoucher(r)}`}
                  {` · vale ${r.validity_days} ${r.validity_days === 1 ? 'dia' : 'dias'}`}
                </p>
              </div>
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap' }}>
                {formatarPontos(r.points_cost)}
              </span>
              {podeEditar && (
                <button type="button" className="btn-ghost" onClick={() => setEditando(r)} aria-label={`Editar ${r.name}`}>
                  <Pencil size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FormularioDeRecompensa({ recompensa, procedimentos, produtos, onCancelar, onSalvo }: {
  recompensa:    Recompensa | null
  procedimentos: { id: string; name: string }[]
  produtos:      { id: string; name: string }[]
  onCancelar:    () => void
  onSalvo:       () => Promise<void>
}) {
  const [nome,      setNome]      = useState(recompensa?.name ?? '')
  const [tipo,      setTipo]      = useState<TipoDeRecompensa>((recompensa?.type as TipoDeRecompensa) ?? 'PROCEDIMENTO')
  const [custo,     setCusto]     = useState(recompensa ? String(recompensa.points_cost) : '')
  const [proc,      setProc]      = useState(recompensa?.procedure_id ?? '')
  const [prod,      setProd]      = useState(recompensa?.product_id ?? '')
  const [valor,     setValor]     = useState(recompensa?.discount_value != null ? String(recompensa.discount_value).replace('.', ',') : '')
  const [validade,  setValidade]  = useState(String(recompensa?.validity_days ?? 30))
  const [descricao, setDescricao] = useState(recompensa?.description ?? '')
  const [ativa,     setAtiva]     = useState(recompensa?.is_active ?? true)
  const [erro,      setErro]      = useState<string | null>(null)
  const [salvando,  iniciar]      = useTransition()

  function salvar() {
    setErro(null)
    iniciar(async () => {
      try {
        const res = await salvarRecompensa({
          id: recompensa?.id ?? null, name: nome, type: tipo, points_cost: custo,
          procedure_id: proc || null, product_id: prod || null,
          discount_value: valor ? valor.replace(/\./g, '').replace(',', '.') : null,
          validity_days: validade, description: descricao, is_active: ativa,
        })
        if (res.error) setErro(res.error)
        else await onSalvo()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível salvar a recompensa.'))
      }
    })
  }

  const rotulo = (texto: string) => (
    <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>{texto}</span>
  )

  return (
    <div data-testid="formulario-de-recompensa" style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: 14,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rotulo('Nome')}
          <input name="nome" className="field" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Limpeza de pele grátis" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rotulo('O que o cliente ganha')}
          <select name="tipo" className="filtro-select" value={tipo} onChange={e => setTipo(e.target.value as TipoDeRecompensa)}>
            {TIPOS_DE_RECOMPENSA.map(t => <option key={t} value={t}>{ROTULO_DO_TIPO[t]}</option>)}
          </select>
        </label>
        {tipo === 'PROCEDIMENTO' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rotulo('Procedimento')}
            <select name="procedimento" className="filtro-select" value={proc} onChange={e => setProc(e.target.value)}>
              <option value="">Escolha…</option>
              {procedimentos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {tipo === 'PRODUTO' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rotulo('Produto')}
            <select name="produto" className="filtro-select" value={prod} onChange={e => setProd(e.target.value)}>
              <option value="">Escolha…</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {(tipo === 'DESCONTO_VALOR' || tipo === 'DESCONTO_PERCENTUAL') && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rotulo(tipo === 'DESCONTO_VALOR' ? 'Desconto (R$)' : 'Desconto (%)')}
            <input name="valor" className="field" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rotulo('Custo (pontos)')}
          <input name="custo" className="field" type="number" min={1} step={1} inputMode="numeric" value={custo} onChange={e => setCusto(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rotulo('Validade do voucher (dias)')}
          <input name="validade" className="field" type="number" min={1} max={365} step={1} value={validade} onChange={e => setValidade(e.target.value)} />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rotulo('Descrição (opcional)')}
        <input name="descricao" className="field" value={descricao} onChange={e => setDescricao(e.target.value)} />
      </label>
      <button type="button" className={ativa ? 'filtro-toggle is-ativo' : 'filtro-toggle'} aria-pressed={ativa}
        onClick={() => setAtiva(v => !v)} style={{ alignSelf: 'flex-start' }}>
        {ativa ? 'Disponível para troca' : 'Fora do catálogo'}
      </button>
      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-row)', padding: '8px 12px',
        }}>
          {erro}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar recompensa'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  )
}
