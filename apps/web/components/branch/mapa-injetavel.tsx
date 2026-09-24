'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Syringe, Save, Loader2, ChevronLeft, CheckCircle2,
  UserPlus, UserCheck, Pencil, Search, ExternalLink,
} from 'lucide-react'
import { InjectableMapField } from '@/components/branch/injectable-map-field'
import { injectableTotals, type InjectableMapValue } from '@/lib/anamnesis'
import {
  getPlanejamentoInjetavel, salvarPlanejamentoInjetavel, renomearPlanejamentoInjetavel,
  vincularClienteAoPlanejamento, registrarAplicacao,
  type AplicacaoInjetavel, type PlanejamentoInjetavel,
} from '@/actions/injectable-map'
import { buscarClientesParaPlano } from '@/actions/treatment-plans'
import { rotaCliente } from '@/lib/rotas'

/**
 * Um planejamento de injetáveis aberto.
 *
 * O desenho é o mapa vivo: reescreve-se à vontade. Registrar a aplicação
 * congela uma cópia no prontuário e só acontece dentro de um atendimento, com
 * cliente ligado — planejar não exige cliente, aplicar sim.
 */
export function MapaInjetavel({
  mapId, slug, appointmentId = null, produtos, podeEditar, onVoltar, onMudou,
}: {
  mapId:          string
  slug:           string
  /** Atendimento aberto — só aqui faz sentido registrar a aplicação. */
  appointmentId?: string | null
  /** Produtos oferecidos (os do estoque). */
  produtos:       string[]
  podeEditar:     boolean
  /** Quando existe, mostra o "voltar" para a lista de onde veio. */
  onVoltar?:      () => void
  /** Avisa a lista que nome, cliente ou pontos mudaram. */
  onMudou?:       () => void
}) {
  const pathname = usePathname()

  const [plano,      setPlano]      = useState<PlanejamentoInjetavel | null>(null)
  const [mapa,       setMapa]       = useState<InjectableMapValue | null>(null)
  const [vendo,      setVendo]      = useState<AplicacaoInjetavel | null>(null)
  const [salvando,   setSalvando]   = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [erro,       setErro]       = useState<string | null>(null)

  const [renomeando, setRenomeando] = useState(false)
  const [nomeNovo,   setNomeNovo]   = useState('')
  const [ligando,    setLigando]    = useState(false)

  const carregar = useCallback(async () => {
    const res = await getPlanejamentoInjetavel(mapId)
    if (res.error || !res.planejamento) { setErro(res.error ?? 'Planejamento não encontrado.'); return }
    setErro(null)
    setPlano(res.planejamento)
    setMapa(res.planejamento.mapa)
  }, [mapId])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar() {
    if (!mapa) return
    setErro(null); setMsg(null); setSalvando(true)
    const res = await salvarPlanejamentoInjetavel(mapId, mapa, slug)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setMsg('Planejamento salvo.')
    onMudou?.()
  }

  async function registrar() {
    if (!mapa) return
    setErro(null); setMsg(null); setSalvando(true)
    const res = await registrarAplicacao(mapId, appointmentId, mapa, null, slug)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setMsg('Aplicação registrada neste atendimento.')
    await carregar()
    onMudou?.()
  }

  async function renomear() {
    const nome = nomeNovo.trim()
    if (!nome) return
    const res = await renomearPlanejamentoInjetavel(mapId, nome)
    if (res.error) { setErro(res.error); return }
    setRenomeando(false)
    setPlano(p => (p ? { ...p, nome } : p))
    onMudou?.()
  }

  async function ligar(clientId: string, nomeCliente: string) {
    const res = await vincularClienteAoPlanejamento(mapId, clientId)
    if (res.error) { setErro(res.error); return }
    setLigando(false)
    setPlano(p => (p ? { ...p, clientId, clientName: nomeCliente } : p))
    await carregar()
    onMudou?.()
  }

  if (erro && !plano) {
    return <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>
  }
  if (!plano || !mapa) {
    return <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Carregando planejamento…</p>
  }

  // -- Uma aplicação antiga, em leitura ---------------------------------------
  if (vendo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setVendo(null)} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }}>
            <ChevronLeft size={14} /> Planejamento
          </button>
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
            Aplicação de {new Date(vendo.appliedAt).toLocaleDateString('pt-BR')}
            {vendo.profissional ? ` · ${vendo.profissional}` : ''}
          </span>
        </div>
        <InjectableMapField value={vendo.mapa} products={produtos} canEdit={false} onChange={() => {}} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {vendo.totais.map(t => (
            <span key={`${t.product}-${t.unit}`} style={{
              fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-chip-token)',
              background: 'var(--bg-app)', color: 'var(--text-muted)',
            }}>
              {t.product}: {t.applied || t.planned} {t.unit}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const totais = injectableTotals(mapa)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabeçalho: nome do planejamento e de quem ele é */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {onVoltar && (
          <button type="button" onClick={onVoltar} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }}>
            <ChevronLeft size={14} /> Voltar
          </button>
        )}

        {renomeando ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              className="field" autoFocus value={nomeNovo}
              onChange={e => setNomeNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void renomear(); if (e.key === 'Escape') setRenomeando(false) }}
              style={{ width: 240, padding: '5px 9px', fontSize: 'var(--text-base-sz)' }}
            />
            <button type="button" onClick={renomear} className="btn-primary" style={{ padding: '5px 12px', fontSize: 'var(--text-sm-sz)' }}>
              Salvar
            </button>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{plano.nome}</h3>
            {podeEditar && (
              <button type="button" className="btn-ghost" style={{ padding: '3px 5px' }}
                onClick={() => { setNomeNovo(plano.nome); setRenomeando(true) }}>
                <Pencil size={12} />
              </button>
            )}
          </span>
        )}

        <span style={{ flex: 1 }} />

        {plano.clientId ? (
          // O nome é a porta para a ficha: quem está com o mapa aberto e quer o
          // histórico da pessoa clica onde ela está escrita. O portal certo sai
          // do pathname — a ficha da rede é /admin. Dentro da própria ficha o
          // link apontaria para onde já se está: ali vira só o nome.
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)',
            fontWeight: 700, color: 'var(--brand)',
          }}>
            <UserCheck size={13} />
            {pathname.startsWith(rotaCliente(pathname, slug, plano.clientId)) ? (
              plano.clientName ?? 'Cliente'
            ) : (
              <Link
                href={rotaCliente(pathname, slug, plano.clientId)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: 'inherit', textDecoration: 'none',
                }}
              >
                {plano.clientName ?? 'Cliente'}
                <ExternalLink size={11} />
              </Link>
            )}
          </span>
        ) : podeEditar && (
          <button type="button" onClick={() => setLigando(v => !v)} className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm-sz)' }}>
            <UserPlus size={13} /> Ligar a um cliente
          </button>
        )}
      </div>

      {ligando && !plano.clientId && <BuscaDeCliente onEscolher={ligar} />}

      {!plano.clientId && (
        <p style={{
          fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 600,
          background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
        }}>
          Planejamento avulso. Dá para desenhar e salvar; registrar a aplicação
          exige um cliente, porque a aplicação vira prontuário.
        </p>
      )}

      <InjectableMapField
        value={mapa}
        products={produtos}
        canEdit={podeEditar}
        onChange={v => { setMapa(v); setMsg(null) }}
      />

      {totais.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {totais.map(t => (
            <span key={`${t.product}-${t.unit}`} style={{
              fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-chip-token)',
              background: 'var(--brand-soft)', color: 'var(--brand)',
            }}>
              {t.product}: {t.planned} {t.unit}
            </span>
          ))}
        </div>
      )}

      {podeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={salvar} disabled={salvando} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar planejamento
          </button>

          {/* Registrar aplicação só dentro de um atendimento: é dele que a
              cópia congelada passa a fazer parte. */}
          {appointmentId && plano.clientId && (
            <button type="button" onClick={registrar} disabled={salvando} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}>
              <Syringe size={14} /> Registrar aplicação
            </button>
          )}

          {msg && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 700 }}>
              <CheckCircle2 size={14} /> {msg}
            </span>
          )}
          {erro && (
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 700 }}>{erro}</span>
          )}
        </div>
      )}

      {/* Histórico — do CLIENTE, não deste planejamento: quem abre um mapa novo
          precisa ver o que já foi aplicado antes. */}
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Aplicações do cliente ({plano.aplicacoes.length})
        </p>
        {plano.aplicacoes.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            {plano.clientId
              ? 'Nenhuma aplicação registrada ainda. O que for registrado num atendimento fica guardado aqui, como foi.'
              : 'Sem cliente ligado, não há histórico para mostrar.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plano.aplicacoes.map(a => (
              <button key={a.id} type="button" onClick={() => setVendo(a)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                  {new Date(a.appliedAt).toLocaleDateString('pt-BR')}
                  {a.profissional ? ` · ${a.profissional}` : ''}
                </span>
                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  {a.totais.length > 0
                    ? a.totais.map(t => `${t.product} ${t.applied || t.planned} ${t.unit}`).join(' · ')
                    : `${a.mapa.points.length} ponto(s)`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Busca de cliente para ligar ao planejamento — a mesma do plano de tratamento. */
function BuscaDeCliente({ onEscolher }: { onEscolher: (id: string, nome: string) => void }) {
  const [termo,   setTermo]   = useState('')
  const [achados, setAchados] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    let vivo = true
    const t = setTimeout(async () => {
      if (termo.trim().length < 2) { setAchados([]); return }
      setBuscando(true)
      const res = await buscarClientesParaPlano(termo)
      if (vivo) { setAchados(res.clientes); setBuscando(false) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [termo])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
      background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)',
    }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-faint)', pointerEvents: 'none',
        }} />
        <input
          type="text" autoFocus className="field campo-busca" style={{ paddingLeft: 30, background: 'var(--surface)' }}
          placeholder="Buscar cliente por nome, telefone ou CPF…"
          value={termo}
          onChange={e => setTermo(e.target.value)}
        />
      </div>
      {buscando && <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Procurando…</span>}
      {achados.map(c => (
        <button key={c.id} type="button" onClick={() => onEscolher(c.id, c.name)}
          style={{
            textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface)',
          }}>
          <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
          {c.phone && <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginLeft: 8 }}>{c.phone}</span>}
        </button>
      ))}
    </div>
  )
}
