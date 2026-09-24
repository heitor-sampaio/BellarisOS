'use client'

import { useCallback, useEffect, useState } from 'react'
import { Syringe, Plus, Loader2 } from 'lucide-react'
import { MapaInjetavel } from '@/components/branch/mapa-injetavel'
import {
  listarPlanejamentosDoCliente, criarPlanejamentoInjetavel, type MapaNaLista,
} from '@/actions/injectable-map'

/**
 * Planejamentos de injetáveis do CLIENTE.
 *
 * Era um mapa só por cliente, que se reescrevia para sempre: não dava para
 * comparar o que foi planejado em março com o de junho. Agora são vários, com
 * nome, como o plano de tratamento — e o mesmo componente serve à aba do perfil
 * e ao atendimento; o que muda é `appointmentId`, que permite registrar a
 * aplicação.
 */
export function PlanejamentoInjetaveis({
  clientId, branchId, slug, appointmentId = null, produtos, podeEditar,
  abertoId, onAbrir,
}: {
  clientId:       string
  branchId:       string
  slug:           string
  appointmentId?: string | null
  produtos:       string[]
  podeEditar:     boolean
  /**
   * Qual planejamento está aberto, decidido de fora. Com `onAbrir` presente,
   * quem manda é o pai — é assim que a ficha do cliente guarda o aberto na URL
   * e devolve o voltar do aparelho.
   */
  abertoId?:      string | null
  onAbrir?:       (mapId: string | null) => void
}) {
  const [mapas,  setMapas]  = useState<MapaNaLista[] | null>(null)
  const [abertoLocal, setAbertoLocal] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [erro,   setErro]   = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const res = await listarPlanejamentosDoCliente(clientId)
    if (res.error) { setErro(res.error); return }
    setErro(null)
    setMapas(res.mapas)
  }, [clientId])

  useEffect(() => { void carregar() }, [carregar])

  const controlado = typeof onAbrir === 'function'
  const aberto     = controlado ? (abertoId ?? null) : abertoLocal

  /** Abrir/fechar passando por quem decide. */
  function pedirAbrir(mapId: string | null) {
    if (controlado) onAbrir!(mapId)
    else setAbertoLocal(mapId)
  }

  async function novo() {
    setErro(null); setCriando(true)
    // O nome nasce com a data: nomear no ato atrasa quem está com a pessoa na
    // frente, e renomear leva um clique no cabeçalho depois.
    const nome = `Injetáveis — ${new Date().toLocaleDateString('pt-BR')}`
    const res = await criarPlanejamentoInjetavel({ nome, clientId, branchId: branchId || null })
    setCriando(false)
    if (res.error || !res.id) { setErro(res.error ?? 'Não foi possível criar.'); return }
    await carregar()
    pedirAbrir(res.id)
  }

  if (aberto) {
    return (
      <MapaInjetavel
        mapId={aberto}
        slug={slug}
        appointmentId={appointmentId}
        produtos={produtos}
        podeEditar={podeEditar}
        onVoltar={() => { pedirAbrir(null); void carregar() }}
        onMudou={carregar}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {erro && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>}

      {mapas === null ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando…</p>
      ) : mapas.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          Nenhum planejamento de injetáveis ainda.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mapas.map(m => (
            <button key={m.id} type="button" onClick={() => pedirAbrir(m.id)}
              className="card"
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
                }}>
                  <Syringe size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  {m.nome}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                  {m.pontos} {m.pontos === 1 ? 'ponto' : 'pontos'}
                  {m.produtos.length > 0 && ` · ${m.produtos.slice(0, 2).join(', ')}`}
                </span>
              </span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                {m.atualizadoEm ? new Date(m.atualizadoEm).toLocaleDateString('pt-BR') : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {podeEditar && (
        <div>
          <button type="button" onClick={novo} disabled={criando} className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Novo planejamento
          </button>
        </div>
      )}
    </div>
  )
}
