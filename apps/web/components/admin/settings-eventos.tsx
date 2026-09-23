'use client'

import { useState, useTransition } from 'react'
import { Activity, ChevronDown, ChevronRight, CircleSlash, RefreshCw } from 'lucide-react'
import {
  listarEventosDeDominio, resumoDoCatalogo,
  type EventoNaLista, type LinhaDoCatalogo,
} from '@/actions/eventos'

/**
 * Painel de conferência da corrente de eventos.
 *
 * Existe por um motivo específico: **montar uma automação em cima de um
 * gatilho que nunca disparou é um erro que não avisa.** A automação fica
 * salva, ativa e silenciosa, e o sintoma de "o nome do evento está errado" é
 * idêntico ao de "ainda não aconteceu". Aqui a diferença fica na tela antes de
 * alguém depender dela.
 *
 * É uma tela de LEITURA. Nada aqui escreve na corrente — o emissor mora fora
 * de `actions/` justamente para não virar endpoint público.
 */

interface Props {
  linhasIniciais:   LinhaDoCatalogo[]
  eventosIniciais:  EventoNaLista[]
  fimInicial:       boolean
  desdeQuando:      string | null
  erro?:            string
}

const ORIGEM_ROTULO: Record<string, string> = {
  app:     'App',
  webhook: 'Webhook',
  cron:    'Cron',
  banco:   'Banco',
}

const ATOR_ROTULO: Record<string, string> = {
  usuario: 'usuário',
  cliente: 'cliente',
  sistema: 'sistema',
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function dia(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Resumo de uma linha de evento em uma frase, sem abrir o payload. */
function resumir(dados: Record<string, unknown>): string {
  const pedacos: string[] = []
  for (const chave of ['clienteNome', 'nome', 'produtoNome', 'profissionalNome', 'provedor', 'rotulo']) {
    const v = dados[chave]
    if (typeof v === 'string' && v.trim()) { pedacos.push(v); break }
  }
  if (typeof dados.valor === 'number')  pedacos.push(`R$ ${dados.valor.toLocaleString('pt-BR')}`)
  if (typeof dados.status === 'string') pedacos.push(dados.status)
  if (Array.isArray(dados.alterou) && dados.alterou.length) {
    pedacos.push(`alterou: ${(dados.alterou as string[]).join(', ')}`)
  }
  return pedacos.join(' · ')
}

export function SettingsEventos({
  linhasIniciais, eventosIniciais, fimInicial, desdeQuando, erro,
}: Props) {
  const [eventos, setEventos]   = useState(eventosIniciais)
  const [fim, setFim]           = useState(fimInicial)
  const [linhas, setLinhas]     = useState(linhasIniciais)
  const [filtroNome, setNome]   = useState('')
  const [filtroOrigem, setOrig] = useState('')
  const [aberto, setAberto]     = useState<string | null>(null)
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [falha, setFalha]       = useState<string | null>(erro ?? null)
  const [carregando, iniciar]   = useTransition()

  const entidades = [...new Set(linhas.map(l => l.entidade))]
  const nuncaVisto = linhas.filter(l => l.vezes === 0)

  function recarregar(nome: string, origem: string) {
    iniciar(async () => {
      const r = await listarEventosDeDominio({
        nome:   nome   || undefined,
        origem: origem || undefined,
      })
      if (r.error) { setFalha(r.error); return }
      setFalha(null)
      setEventos(r.eventos)
      setFim(r.fim)
    })
  }

  function maisAntigos() {
    const ultimo = eventos[eventos.length - 1]
    if (!ultimo) return
    iniciar(async () => {
      const r = await listarEventosDeDominio({
        nome:    filtroNome   || undefined,
        origem:  filtroOrigem || undefined,
        antesDe: ultimo.ocorridoEm,
      })
      if (r.error) { setFalha(r.error); return }
      setEventos(atual => [...atual, ...r.eventos])
      setFim(r.fim)
    })
  }

  function atualizarResumo() {
    iniciar(async () => {
      const r = await resumoDoCatalogo()
      if (!r.error) setLinhas(r.linhas)
      recarregar(filtroNome, filtroOrigem)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Eventos do sistema
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Tudo que acontece na rede vira um fato aqui, e é daqui que as automações
          vão puxar os gatilhos. A corrente guarda <strong>30 dias</strong>
          {desdeQuando ? ` — o registro mais antigo é de ${dia(desdeQuando)}.` : '.'}
        </p>
      </div>

      {falha && (
        <div className="card" style={{ borderColor: '#fda29b', background: '#fee4e2' }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: '#b42318', fontWeight: 'var(--weight-semibold)' }}>
            Não foi possível ler a corrente: {falha}
          </p>
        </div>
      )}

      {/* -- Catálogo: o que já ocorreu e o que nunca ocorreu ------------------ */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <span className="overline">Catálogo</span>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 3 }}>
              {linhas.length} eventos declarados · {nuncaVisto.length} ainda não ocorreram nesta rede
            </p>
          </div>
          <button
            type="button" className="btn-ghost" onClick={atualizarResumo} disabled={carregando}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* Um evento sem ocorrência NÃO é defeito: pode só não ter acontecido
            ainda (`pagamento.estornado` numa clínica que nunca estornou). A
            tela mostra o fato e deixa a conclusão para quem monta a automação.

            Por padrão só os que JÁ ocorreram ficam à vista. São 42 no total e
            a maioria fica muda numa rede nova: no celular, os 34 apagados
            empurravam a corrente inteira para fora da primeira tela — e é a
            corrente que se veio ver. Quem procura um que nunca disparou abre a
            lista, que é o gesto de quem já sabe o que procura. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(mostrarTodos ? linhas : linhas.filter(l => l.vezes > 0)).map(l => (
            <button
              key={l.nome}
              type="button"
              onClick={() => { const n = filtroNome === l.nome ? '' : l.nome; setNome(n); recarregar(n, filtroOrigem) }}
              className={l.vezes === 0 ? 'chip chip-muted' : filtroNome === l.nome ? 'chip chip-brand' : 'chip chip-success'}
              style={{ cursor: 'pointer', border: 'none', opacity: l.vezes === 0 ? 0.75 : 1 }}
              title={l.vezes === 0 ? 'Nunca ocorreu nesta rede' : `Último em ${dia(l.ultimoEm)}`}
            >
              {l.vezes === 0 ? <CircleSlash size={11} /> : <Activity size={11} />}
              {l.nome}
              {l.vezes > 0 && <span style={{ opacity: 0.7 }}>· {l.vezes}</span>}
            </button>
          ))}

          {nuncaVisto.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarTodos(v => !v)}
              className="chip chip-muted"
              style={{ cursor: 'pointer', color: 'var(--brand)', borderColor: 'var(--brand-soft)' }}
            >
              {mostrarTodos
                ? 'Esconder os que nunca ocorreram'
                : `+ ${nuncaVisto.length} que nunca ocorreram`}
            </button>
          )}
        </div>

        {linhas.every(l => l.vezes === 0) && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 10 }}>
            Nenhum evento ocorreu ainda nesta rede.
          </p>
        )}
      </div>

      {/* -- Filtros ---------------------------------------------------------- */}
      <div className="filtros-bar" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select
          className="field" value={filtroNome}
          onChange={e => { setNome(e.target.value); recarregar(e.target.value, filtroOrigem) }}
          style={{ maxWidth: 260 }}
        >
          <option value="">Todos os eventos</option>
          {entidades.map(ent => (
            <optgroup key={ent} label={ent}>
              {linhas.filter(l => l.entidade === ent).map(l => (
                <option key={l.nome} value={l.nome}>{l.nome}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          className="field" value={filtroOrigem}
          onChange={e => { setOrig(e.target.value); recarregar(filtroNome, e.target.value) }}
          style={{ maxWidth: 170 }}
        >
          <option value="">Toda origem</option>
          {Object.entries(ORIGEM_ROTULO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </div>

      {/* -- A corrente ------------------------------------------------------- */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {eventos.length === 0 ? (
          <p style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            {filtroNome || filtroOrigem
              ? 'Nenhum evento com esses filtros.'
              : 'A corrente ainda está vazia.'}
          </p>
        ) : (
          <div>
            {eventos.map(ev => {
              const expandido = aberto === ev.id
              return (
                <div key={ev.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <button
                    type="button"
                    onClick={() => setAberto(expandido ? null : ev.id)}
                    style={{
                      width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '12px 16px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {expandido
                      ? <ChevronDown size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-muted)' }} />
                      : <ChevronRight size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-muted)' }} />}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                          {ev.nome}
                        </span>
                        <span className="chip chip-muted">{ORIGEM_ROTULO[ev.origem] ?? ev.origem}</span>
                      </div>
                      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 3 }}>
                        {quando(ev.ocorridoEm)} · {ev.atorNome ?? ATOR_ROTULO[ev.atorTipo] ?? ev.atorTipo}
                        {resumir(ev.dados) && ` · ${resumir(ev.dados)}`}
                      </p>
                    </div>
                  </button>

                  {expandido && (
                    <pre style={{
                      margin: 0, padding: '0 16px 14px 40px',
                      fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-soft)',
                      overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {JSON.stringify({ entidade: ev.entidade, entidadeId: ev.entidadeId, dados: ev.dados }, null, 2)}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!fim && (
          <button
            type="button" onClick={maisAntigos} disabled={carregando}
            style={{
              width: '100%', padding: '12px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 'var(--text-xs-sz)',
              fontWeight: 'var(--weight-bold)', color: 'var(--brand)',
            }}
          >
            {carregando ? 'Carregando…' : 'Carregar mais antigos'}
          </button>
        )}
      </div>
    </div>
  )
}
