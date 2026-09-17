'use client'

import { useCallback, useEffect, useState } from 'react'
import { Syringe, Save, Loader2, ChevronLeft, CheckCircle2 } from 'lucide-react'
import { InjectableMapField } from '@/components/branch/injectable-map-field'
import { emptyInjectableMap, injectableTotals, type InjectableMapValue } from '@/lib/anamnesis'
import {
  getMapaDoCliente, salvarMapaDoCliente, registrarAplicacao,
  type AplicacaoInjetavel,
} from '@/actions/injectable-map'

/**
 * Mapa de injetáveis do cliente: o planejamento vivo e as aplicações.
 *
 * O mapa era um campo dentro da ficha de um atendimento — recomeçava do zero a
 * cada vez. Aqui ele é do cliente: a profissional abre, ajusta e planeja; ao
 * registrar a aplicação, uma cópia congelada fica no atendimento. Planejar em
 * junho não reescreve o que foi aplicado em março.
 */
export function MapaInjetaveisCliente({
  clientId, slug, appointmentId = null, produtos, podeEditar,
}: {
  clientId:       string
  slug:           string
  /** Atendimento aberto — só aqui faz sentido registrar a aplicação. */
  appointmentId?: string | null
  /** Produtos oferecidos (mesma lista do campo de ficha). */
  produtos:       string[]
  podeEditar:     boolean
}) {
  const [mapa,       setMapa]       = useState<InjectableMapValue | null>(null)
  const [aplicacoes, setAplicacoes] = useState<AplicacaoInjetavel[]>([])
  const [vendo,      setVendo]      = useState<AplicacaoInjetavel | null>(null)
  const [salvando,   setSalvando]   = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [erro,       setErro]       = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const res = await getMapaDoCliente(clientId)
    if (res.error) { setErro(res.error); return }
    setMapa(res.mapa ?? emptyInjectableMap())
    setAplicacoes(res.aplicacoes ?? [])
  }, [clientId])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar() {
    if (!mapa) return
    setErro(null); setMsg(null); setSalvando(true)
    const res = await salvarMapaDoCliente(clientId, mapa, slug)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setMsg('Planejamento salvo.')
  }

  async function registrar() {
    if (!mapa) return
    setErro(null); setMsg(null); setSalvando(true)
    const res = await registrarAplicacao(clientId, appointmentId, mapa, null, slug)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setMsg('Aplicação registrada neste atendimento.')
    await carregar()
  }

  // -- Uma aplicação antiga, em leitura ---------------------------------------
  if (vendo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setVendo(null)} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '5px 10px' }}>
            <ChevronLeft size={14} /> Mapa
          </button>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
            Aplicação de {new Date(vendo.appliedAt).toLocaleDateString('pt-BR')}
            {vendo.profissional ? ` · ${vendo.profissional}` : ''}
          </span>
        </div>

        {/* Congelada: o campo entra sem permissão de edição. */}
        <InjectableMapField value={vendo.mapa} products={produtos} canEdit={false} onChange={() => {}} />
      </div>
    )
  }

  if (!mapa) return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando mapa…</p>

  const totais = injectableTotals(mapa)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {erro && (
        <p style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{erro}</p>
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
              fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
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
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar planejamento
          </button>

          {/* Registrar aplicação só dentro de um atendimento: é dele que a
              cópia congelada passa a fazer parte. */}
          {appointmentId && (
            <button type="button" onClick={registrar} disabled={salvando} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <Syringe size={14} /> Registrar aplicação
            </button>
          )}

          {msg && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#16a34a', fontWeight: 700 }}>
              <CheckCircle2 size={14} /> {msg}
            </span>
          )}
        </div>
      )}

      {/* Histórico */}
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Aplicações ({aplicacoes.length})
        </p>
        {aplicacoes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            Nenhuma aplicação registrada ainda. O que for registrado num atendimento fica guardado aqui, como foi.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aplicacoes.map(a => (
              <button key={a.id} type="button" onClick={() => setVendo(a)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  {new Date(a.appliedAt).toLocaleDateString('pt-BR')}
                  {a.profissional ? ` · ${a.profissional}` : ''}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
