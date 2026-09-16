'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  QrCode, CheckCircle2, AlertCircle, Loader2, RefreshCw, Smartphone, Unplug,
} from 'lucide-react'
import {
  getEstadoConexaoZapi, criarConexaoZapi, getQrCodeZapi, getCodigoPareamentoZapi,
  desconectarZapi, removerConexaoZapi, type EstadoConexaoZapi,
} from '@/actions/zapi-connection'

/**
 * Conectar o WhatsApp sem sair do BellarisOS.
 *
 * A instância é criada na nossa conta de integrador da Z-API; a clínica só
 * escaneia o QR. Quem já tem conta própria continua com o formulário manual,
 * na outra aba.
 */

/**
 * O WhatsApp invalida o QR a cada 20 segundos, então a tela precisa buscar de
 * novo. 15s dá margem; a própria Z-API recomenda parar depois de algumas
 * tentativas em vez de girar para sempre, porque cada chamada custa.
 */
const INTERVALO_QR = 15_000
const MAX_TENTATIVAS = 12   // ~3 minutos

function Aviso({ tom, children }: { tom: 'erro' | 'ok' | 'espera'; children: React.ReactNode }) {
  const cores = {
    erro:   { bg: '#fef2f2', color: '#dc2626', border: '#dc262633' },
    ok:     { bg: '#f0fdf4', color: '#3f9b6f', border: '#3f9b6f33' },
    espera: { bg: '#fffbeb', color: '#b45309', border: '#b4530933' },
  }[tom]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '9px 12px', borderRadius: 8,
      background: cores.bg, border: `1px solid ${cores.border}`,
      fontSize: 12.5, color: cores.color, fontWeight: 600, lineHeight: 1.5,
    }}>
      {tom === 'ok'
        ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertCircle  size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

export function ZapiConnect() {
  const router = useRouter()
  const [estado,   setEstado]   = useState<EstadoConexaoZapi | null>(null)
  const [qr,       setQr]       = useState<string | null>(null)
  const [erro,     setErro]     = useState<string | null>(null)
  const [tentativas, setTentativas] = useState(0)
  const [pausado,  setPausado]  = useState(false)
  const [codigo,   setCodigo]   = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [modoCodigo, setModoCodigo] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregarEstado = useCallback(async () => {
    try {
      setEstado(await getEstadoConexaoZapi())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao consultar a conexão')
    }
  }, [])

  useEffect(() => { carregarEstado() }, [carregarEstado])

  // Polling do QR enquanto ninguém pareou.
  useEffect(() => {
    if (!estado?.gerenciada || estado.conectada || pausado || modoCodigo) return
    if (tentativas >= MAX_TENTATIVAS) { setPausado(true); return }

    let vivo = true
    async function buscar() {
      const res = await getQrCodeZapi()
      if (!vivo) return
      if (!res.ok) { setErro(res.error ?? 'Falha ao obter o QR code'); setPausado(true); return }
      if (res.conectada) { setQr(null); await carregarEstado(); router.refresh(); return }
      setQr(res.qr ?? null)
      setTentativas(t => t + 1)
      timerRef.current = setTimeout(buscar, INTERVALO_QR)
    }
    buscar()

    return () => {
      vivo = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [estado?.gerenciada, estado?.conectada, pausado, modoCodigo, tentativas, carregarEstado, router])

  function recomeçarQr() {
    setErro(null); setQr(null); setTentativas(0); setPausado(false); setModoCodigo(false)
  }

  function conectar() {
    setErro(null)
    startTransition(async () => {
      const res = await criarConexaoZapi()
      if (!res.ok) { setErro(res.error ?? 'Falha ao criar a conexão'); return }
      recomeçarQr()
      await carregarEstado()
      router.refresh()
    })
  }

  function pedirCodigo() {
    setErro(null); setCodigo(null)
    startTransition(async () => {
      const res = await getCodigoPareamentoZapi(telefone)
      if (!res.ok) { setErro(res.error ?? 'Falha ao gerar o código'); return }
      setCodigo(res.code ?? null)
    })
  }

  function desconectar() {
    setErro(null)
    startTransition(async () => {
      const res = await desconectarZapi()
      if (!res.ok) { setErro(res.error ?? 'Falha ao desconectar'); return }
      recomeçarQr()
      await carregarEstado()
      router.refresh()
    })
  }

  function remover() {
    if (!confirm(
      'Remover a conexão? O número é desligado e a instância é cancelada na Z-API. '
      + 'Para voltar, será preciso parear de novo.',
    )) return
    setErro(null)
    startTransition(async () => {
      const res = await removerConexaoZapi()
      if (!res.ok) { setErro(res.error ?? 'Falha ao remover'); return }
      setQr(null)
      await carregarEstado()
      router.refresh()
    })
  }

  if (!estado) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <Loader2 size={14} className="animate-spin" /> Carregando…
      </div>
    )
  }

  if (!estado.disponivel) {
    return (
      <Aviso tom="espera">
        A conexão automática não está habilitada nesta instalação. Falta o token de
        integrador da Z-API no ambiente (<code>ZAPI_PARTNER_TOKEN</code>). Use a aba
        “Já tenho conta Z-API”.
      </Aviso>
    )
  }

  // -- Estado 1: ainda não existe instância para esta rede ---------------------
  if (!estado.gerenciada) {
    const perto = estado.usadas >= 20
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
          Conecte o WhatsApp da clínica escaneando um QR code, como no WhatsApp Web.
          Não é preciso contratar nada à parte — a conexão já faz parte do plano.
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.55, margin: 0 }}>
          Use um número dedicado ao atendimento. O WhatsApp permite um aparelho por
          número, e conectar aqui desconecta outras sessões do WhatsApp Web.
        </p>

        {perto && (
          <Aviso tom="espera">
            {estado.usadas} de {estado.teto} conexões deste token já em uso.
            Solicite um novo token de integrador à Z-API antes de chegar ao limite.
          </Aviso>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <button type="button" onClick={conectar} disabled={isPending} className="btn-primary"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7 }}>
          <QrCode size={15} /> {isPending ? 'Criando…' : 'Conectar WhatsApp'}
        </button>
      </div>
    )
  }

  // -- Estado 3: conectado ----------------------------------------------------
  if (estado.conectada) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tom="ok">
          Conectado{estado.phone ? <> · <strong>{estado.phone}</strong></> : null}
          {estado.name ? ` (${estado.name})` : ''}
        </Aviso>

        {estado.celularOffline && (
          <Aviso tom="espera">
            O celular está fora de alcance. A conexão existe, mas nada é enviado nem
            recebido até o aparelho voltar à internet.
          </Aviso>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={carregarEstado} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Atualizar
          </button>
          <button type="button" onClick={desconectar} disabled={isPending} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Unplug size={14} /> Desconectar número
          </button>
          <button type="button" onClick={remover} disabled={isPending} className="btn-ghost"
            style={{ marginLeft: 'auto', color: '#dc2626' }}>
            Remover conexão
          </button>
        </div>
      </div>
    )
  }

  // -- Estado 2: instância criada, aguardando pareamento ----------------------
  const venceEm = estado.trialDue ? new Date(estado.trialDue) : null
  const expirou = venceEm ? venceEm.getTime() < Date.now() : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {expirou ? (
        <Aviso tom="erro">
          O prazo para parear expirou e a Z-API removeu esta instância. Remova a
          conexão e crie outra.
        </Aviso>
      ) : venceEm && (
        <Aviso tom="espera">
          Pareie até {venceEm.toLocaleDateString('pt-BR')} às{' '}
          {venceEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} —
          depois disso a conexão é descartada e é preciso criar outra.
        </Aviso>
      )}
      {estado.erro && <Aviso tom="erro">{estado.erro}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {modoCodigo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
            No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar
            com número de telefone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="5511999999999"
              className="field"
              style={{ fontSize: 13, flex: 1 }}
            />
            <button type="button" onClick={pedirCodigo} disabled={isPending} className="btn-primary">
              Gerar código
            </button>
          </div>
          {codigo && (
            <div style={{
              padding: '14px 18px', borderRadius: 10, textAlign: 'center',
              background: 'var(--brand-soft)', border: '1px solid var(--brand)',
            }}>
              <p style={{
                margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '0.18em',
                color: 'var(--brand)', fontVariantNumeric: 'tabular-nums',
              }}>
                {codigo}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Digite no celular. O código expira em alguns minutos.
              </p>
            </div>
          )}
          <button type="button" onClick={() => { setModoCodigo(false); recomeçarQr() }}
            className="btn-ghost" style={{ alignSelf: 'flex-start' }}>
            Usar QR code
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{
            width: 220, height: 220, flexShrink: 0, borderRadius: 12,
            border: '1px solid var(--border)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {pausado ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                  O código expirou.
                </p>
                <button type="button" onClick={recomeçarQr} className="btn-primary"
                  style={{ marginTop: 10, height: 32, fontSize: 12.5 }}>
                  Gerar novo
                </button>
              </div>
            ) : qr ? (
              <img src={qr} alt="QR code para conectar o WhatsApp"
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
            ) : (
              <Loader2 size={20} className="animate-spin" color="var(--text-faint)" />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p className="overline" style={{ color: 'var(--text-muted)', margin: 0 }}>
                Como conectar
              </p>
              <ol style={{
                margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5,
                color: 'var(--text-muted)', lineHeight: 1.7,
              }}>
                <li>Abra o WhatsApp no celular da clínica</li>
                <li>Toque em <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar aparelho</strong></li>
                <li>Aponte a câmera para este código</li>
              </ol>
            </div>

            <button type="button" onClick={() => { setModoCodigo(true); setCodigo(null) }}
              className="btn-ghost"
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Smartphone size={14} /> Conectar com o número
            </button>

            <button type="button" onClick={remover} disabled={isPending} className="btn-ghost"
              style={{ alignSelf: 'flex-start', color: '#dc2626', fontSize: 12 }}>
              Cancelar conexão
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
