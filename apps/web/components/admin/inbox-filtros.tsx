'use client'

import { useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { Conversation, InboxChannel, ConvStatus } from '@/actions/inbox'

/**
 * Filtros da caixa de entrada.
 *
 * O canal continua nas pastilhas de cima: é o corte mais frequente e ganha em
 * ficar sempre visível. O resto mora aqui, porque são filtros da OPORTUNIDADE
 * (dono, funil, etapa, tag) e não da conversa — quem atende procura "os leads
 * da Natascha na etapa Proposta", não "as conversas de WhatsApp".
 *
 * As opções são derivadas das conversas carregadas, não de catálogos completos.
 * Um menu com quarenta etapas das quais duas têm conversa é pior que um menu
 * com duas: oferecer um filtro que devolve lista vazia é desperdiçar o clique
 * de quem está atendendo.
 */

export interface FiltrosInbox {
  canal:      InboxChannel | 'all'
  status:     ConvStatus | 'todos'
  naoLidas:   boolean
  aguardando: boolean
  tags:       string[]
  donos:      string[]
  funil:      string
  etapa:      string
  unidade:    string
}

export const FILTROS_VAZIOS: FiltrosInbox = {
  canal: 'all', status: 'todos', naoLidas: false, aguardando: false,
  tags: [], donos: [], funil: 'todos', etapa: 'todas', unidade: 'todas',
}

/** Marcador de "sem dono" / "sem unidade": null não sobrevive num `value`. */
const SEM_DONO    = '__sem_dono__'
const SEM_UNIDADE = '__rede__'

export function contarFiltros(f: FiltrosInbox): number {
  return (
    (f.status !== 'todos' ? 1 : 0)
    + (f.naoLidas ? 1 : 0)
    + (f.aguardando ? 1 : 0)
    + f.tags.length
    + f.donos.length
    + (f.funil !== 'todos' ? 1 : 0)
    + (f.etapa !== 'todas' ? 1 : 0)
    + (f.unidade !== 'todas' ? 1 : 0)
  )
}

/**
 * A conversa passa pelos filtros?
 *
 * Tags e donos são listas: a conversa precisa de TODAS as tags marcadas (quem
 * marca duas está estreitando a busca) e de QUALQUER um dos donos (quem marca
 * dois quer ver os dois). São perguntas diferentes, e tratá-las igual deixaria
 * metade dos casos sem resposta.
 */
export function passaNosFiltros(c: Conversation, f: FiltrosInbox): boolean {
  if (f.canal !== 'all' && c.channel !== f.canal) return false
  if (f.status !== 'todos' && c.status !== f.status) return false
  if (f.naoLidas && c.unread_count === 0) return false
  if (f.aguardando && !c.awaiting_since) return false

  // `?? []`: a conversa que acaba de chegar pelo realtime ainda não tem os
  // dados do card, e um filtro não pode quebrar a lista inteira por isso.
  if (f.tags.length > 0 && !f.tags.every(t => (c.lead_tags ?? []).includes(t))) return false

  if (f.donos.length > 0) {
    const dono = c.owner_id ?? SEM_DONO
    if (!f.donos.includes(dono)) return false
  }

  if (f.funil !== 'todos' && c.funnel_id !== f.funil) return false
  if (f.etapa !== 'todas'  && c.stage_id  !== f.etapa) return false

  if (f.unidade !== 'todas') {
    const unidade = c.branch_id ?? SEM_UNIDADE
    if (unidade !== f.unidade) return false
  }

  return true
}

interface Opcoes {
  tags:     string[]
  donos:    { id: string; nome: string }[]
  funis:    { id: string; nome: string }[]
  etapas:   { id: string; nome: string; funil: string }[]
  unidades: { id: string; nome: string }[]
}

/** O que existe de fato nas conversas carregadas. */
function derivarOpcoes(conversas: Conversation[]): Opcoes {
  const tags     = new Set<string>()
  const donos    = new Map<string, string>()
  const funis    = new Map<string, string>()
  const etapas   = new Map<string, { nome: string; funil: string }>()
  const unidades = new Map<string, string>()

  for (const c of conversas) {
    for (const t of c.lead_tags ?? []) tags.add(t)
    if (c.owner_id) donos.set(c.owner_id, c.owner_name ?? 'Sem nome')
    else            donos.set(SEM_DONO, 'Sem dono')
    if (c.funnel_id && c.funnel_name) funis.set(c.funnel_id, c.funnel_name)
    if (c.stage_id && c.stage_name) {
      etapas.set(c.stage_id, { nome: c.stage_name, funil: c.funnel_id ?? '' })
    }
    if (c.branch_id) unidades.set(c.branch_id, c.branch_name ?? 'Unidade')
    else             unidades.set(SEM_UNIDADE, 'Rede (sem unidade)')
  }

  const ordenar = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR')

  return {
    tags:     [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    donos:    [...donos].map(([id, nome]) => ({ id, nome })).sort(ordenar),
    funis:    [...funis].map(([id, nome]) => ({ id, nome })).sort(ordenar),
    etapas:   [...etapas].map(([id, v]) => ({ id, nome: v.nome, funil: v.funil })).sort(ordenar),
    unidades: [...unidades].map(([id, nome]) => ({ id, nome })).sort(ordenar),
  }
}

const SITUACOES: { key: ConvStatus | 'todos'; label: string }[] = [
  { key: 'todos',   label: 'Todas' },
  { key: 'open',    label: 'Abertas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'closed',  label: 'Encerradas' },
]

function Pastilha({
  ativa, children, onClick,
}: { ativa: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
        cursor: 'pointer', transition: 'all 100ms',
        border:     ativa ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
        background: ativa ? 'var(--brand-soft)' : 'var(--bg-app)',
        color:      ativa ? 'var(--brand)' : 'var(--text-muted)',
      }}
    >
      {children}
    </button>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 6,
      }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

export function InboxFiltros({
  conversas, filtros, onChange,
}: {
  conversas: Conversation[]
  filtros:   FiltrosInbox
  onChange:  (f: FiltrosInbox) => void
}) {
  const [aberto, setAberto] = useState(false)
  const opcoes = useMemo(() => derivarOpcoes(conversas), [conversas])
  const ativos = contarFiltros(filtros)

  function alternar(campo: 'tags' | 'donos', valor: string) {
    const atual = filtros[campo]
    onChange({
      ...filtros,
      [campo]: atual.includes(valor) ? atual.filter(v => v !== valor) : [...atual, valor],
    })
  }

  // Etapa só faz sentido dentro de um funil: trocar de funil zera a etapa, senão
  // ficaria valendo um par impossível e a lista viria vazia sem explicação.
  const etapasVisiveis = filtros.funil === 'todos'
    ? opcoes.etapas
    : opcoes.etapas.filter(e => e.funil === filtros.funil)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        title="Filtrar conversas"
        style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0, position: 'relative',
          border: ativos > 0 ? '1px solid var(--brand)' : '1px solid var(--border)',
          background: ativos > 0 ? 'var(--brand-soft)' : 'var(--bg-app)',
          color: ativos > 0 ? 'var(--brand)' : 'var(--text-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <SlidersHorizontal size={15} />
        {ativos > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 16, height: 16, borderRadius: 99, padding: '0 4px',
            background: 'var(--brand)', color: '#fff',
            fontSize: 9.5, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {ativos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* Clique fora fecha. */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAberto(false)} />

          <div style={{
            position: 'absolute', top: 40, left: 0, zIndex: 41,
            width: 288, maxHeight: '64vh', overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 12,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <strong style={{ fontSize: 12.5, color: 'var(--text)' }}>Filtros</strong>
              <div style={{ display: 'flex', gap: 4 }}>
                {ativos > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...FILTROS_VAZIOS, canal: filtros.canal })}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, color: 'var(--brand)', padding: 0,
                    }}
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button" onClick={() => setAberto(false)}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--text-faint)', padding: 0, display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <Secao titulo="Situação">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {SITUACOES.map(s => (
                  <Pastilha
                    key={s.key}
                    ativa={filtros.status === s.key}
                    onClick={() => onChange({ ...filtros, status: s.key })}
                  >
                    {s.label}
                  </Pastilha>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                <Pastilha
                  ativa={filtros.naoLidas}
                  onClick={() => onChange({ ...filtros, naoLidas: !filtros.naoLidas })}
                >
                  Não lidas
                </Pastilha>
                <Pastilha
                  ativa={filtros.aguardando}
                  onClick={() => onChange({ ...filtros, aguardando: !filtros.aguardando })}
                >
                  Aguardando resposta
                </Pastilha>
              </div>
            </Secao>

            {opcoes.donos.length > 1 && (
              <Secao titulo="Dono da oportunidade">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {opcoes.donos.map(d => (
                    <Pastilha
                      key={d.id}
                      ativa={filtros.donos.includes(d.id)}
                      onClick={() => alternar('donos', d.id)}
                    >
                      {d.nome}
                    </Pastilha>
                  ))}
                </div>
              </Secao>
            )}

            {opcoes.funis.length > 0 && (
              <Secao titulo="Funil">
                <select
                  className="field"
                  value={filtros.funil}
                  onChange={e => onChange({ ...filtros, funil: e.target.value, etapa: 'todas' })}
                  style={{ fontSize: 12.5, padding: '7px 9px' }}
                >
                  <option value="todos">Todos os funis</option>
                  {opcoes.funis.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </Secao>
            )}

            {etapasVisiveis.length > 0 && (
              <Secao titulo="Etapa">
                <select
                  className="field"
                  value={filtros.etapa}
                  onChange={e => onChange({ ...filtros, etapa: e.target.value })}
                  style={{ fontSize: 12.5, padding: '7px 9px' }}
                >
                  <option value="todas">Todas as etapas</option>
                  {etapasVisiveis.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </Secao>
            )}

            {opcoes.tags.length > 0 && (
              <Secao titulo="Tags">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {opcoes.tags.map(t => (
                    <Pastilha
                      key={t}
                      ativa={filtros.tags.includes(t)}
                      onClick={() => alternar('tags', t)}
                    >
                      {t}
                    </Pastilha>
                  ))}
                </div>
              </Secao>
            )}

            {opcoes.unidades.length > 1 && (
              <Secao titulo="Unidade">
                <select
                  className="field"
                  value={filtros.unidade}
                  onChange={e => onChange({ ...filtros, unidade: e.target.value })}
                  style={{ fontSize: 12.5, padding: '7px 9px' }}
                >
                  <option value="todas">Todas as unidades</option>
                  {opcoes.unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </Secao>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Resumo do que está filtrando, com remoção direta.
 *
 * Filtro escondido atrás de um botão é filtro esquecido: a pessoa estranha a
 * lista curta e culpa o sistema. Os chips deixam a razão à vista.
 */
export function ChipsDeFiltro({
  conversas, filtros, onChange,
}: {
  conversas: Conversation[]
  filtros:   FiltrosInbox
  onChange:  (f: FiltrosInbox) => void
}) {
  const opcoes = useMemo(() => derivarOpcoes(conversas), [conversas])
  if (contarFiltros(filtros) === 0) return null

  const chips: { rotulo: string; limpar: () => void }[] = []

  if (filtros.status !== 'todos') {
    chips.push({
      rotulo: SITUACOES.find(s => s.key === filtros.status)?.label ?? 'Situação',
      limpar: () => onChange({ ...filtros, status: 'todos' }),
    })
  }
  if (filtros.naoLidas)   chips.push({ rotulo: 'Não lidas',   limpar: () => onChange({ ...filtros, naoLidas: false }) })
  if (filtros.aguardando) chips.push({ rotulo: 'Aguardando',  limpar: () => onChange({ ...filtros, aguardando: false }) })

  for (const id of filtros.donos) {
    chips.push({
      rotulo: opcoes.donos.find(d => d.id === id)?.nome ?? 'Dono',
      limpar: () => onChange({ ...filtros, donos: filtros.donos.filter(d => d !== id) }),
    })
  }
  if (filtros.funil !== 'todos') {
    chips.push({
      rotulo: opcoes.funis.find(f => f.id === filtros.funil)?.nome ?? 'Funil',
      limpar: () => onChange({ ...filtros, funil: 'todos', etapa: 'todas' }),
    })
  }
  if (filtros.etapa !== 'todas') {
    chips.push({
      rotulo: opcoes.etapas.find(e => e.id === filtros.etapa)?.nome ?? 'Etapa',
      limpar: () => onChange({ ...filtros, etapa: 'todas' }),
    })
  }
  for (const t of filtros.tags) {
    chips.push({
      rotulo: t,
      limpar: () => onChange({ ...filtros, tags: filtros.tags.filter(x => x !== t) }),
    })
  }
  if (filtros.unidade !== 'todas') {
    chips.push({
      rotulo: opcoes.unidades.find(u => u.id === filtros.unidade)?.nome ?? 'Unidade',
      limpar: () => onChange({ ...filtros, unidade: 'todas' }),
    })
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
      {chips.map((chip, i) => (
        <span
          key={`${chip.rotulo}-${i}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 700, padding: '2px 5px 2px 8px',
            borderRadius: 99, background: 'var(--brand-soft)', color: 'var(--brand)',
          }}
        >
          {chip.rotulo}
          <button
            type="button" onClick={chip.limpar} title="Remover filtro"
            style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: 0,
              color: 'inherit', display: 'flex', opacity: 0.75,
            }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  )
}
