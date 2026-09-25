'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  QrCode, CheckCircle2, AlertCircle, Loader2, RefreshCw, Smartphone, Unplug, ShieldCheck,
} from 'lucide-react'
import {
  getEstadoConexaoUazapi, criarConexaoUazapi, getQrCodeUazapi, getCodigoPareamentoUazapi,
  desconectarUazapi, removerConexaoUazapi, repararConexaoUazapi,
  type EstadoConexaoUazapi,
} from '@/actions/uazapi-connection'

/**
 * Conectar o WhatsApp sem sair do BellarisOS.
 *
 * A instância nasce na nossa conta da uazapi; a clínica só escaneia o QR.
 */

/**
 * O WhatsApp invalida o QR a cada ~20 segundos.
 *
 * O polling consulta `/instance/status`, que é barato — só quando não há código
 * lá é que a action chama `/instance/connect`, que é escrita e leva de 5 a 9
 * segundos. Parar depois de alguns minutos evita girar para sempre.
 */
const INTERVALO_QR  = 15_000
const MAX_TENTATIVAS = 12   // ~3 minutos

function Aviso({ tom, children }: { tom: 'erro' | 'ok' | 'espera'; children: React.ReactNode }) {
  const cores = {
    erro:   { bg: 'var(--danger-soft)', color: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 20%, transparent)' },
    ok:     { bg: 'var(--success-bg)', color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 20%, transparent)' },
    espera: { bg: 'var(--warning-soft)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--cat-5) 20%, transparent)' },
  }[tom]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '9px 12px', borderRadius: 8,
      background: cores.bg, border: `1px solid ${cores.border}`,
      fontSize: 'var(--text-sm-sz)', color: cores.color, fontWeight: 600, lineHeight: 1.5,
    }}>
      {tom === 'ok'
        ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertCircle  size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

export function UazapiConnect() {
  const router = useRouter()
  const [estado,     setEstado]     = useState<EstadoConexaoUazapi | null>(null)
  const [qr,         setQr]         = useState<string | null>(null)
  const [erro,       setErro]       = useState<string | null>(null)
  const [pausado,    setPausado]    = useState(false)
  const [codigo,     setCodigo]     = useState<string | null>(null)
  const [telefone,   setTelefone]   = useState('')
  const [modoCodigo, setModoCodigo] = useState(false)
  const [isPending,  startTransition] = useTransition()
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tentativasRef = useRef(0)

  // QUAL caixa esta tela opera. Vem do estado porque é o servidor que resolve
  // "a conexão gerenciada desta rede" — e, quando houver mais de uma, é ele que
  // se recusa a adivinhar. Todas as ações abaixo mandam este id, e o servidor
  // confere que ele é mesmo desta rede: são endpoints públicos.
  const caixaId = estado?.numeroId ?? null

  const carregarEstado = useCallback(async () => {
    try { setEstado(await getEstadoConexaoUazapi()) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao consultar a conexão') }
  }, [])

  useEffect(() => { carregarEstado() }, [carregarEstado])

  // ⚠️ `tentativas` NÃO entra nas dependências.
  //
  // Com ela na lista, cada volta do polling remontava o efeito: o incremento
  // mudava a dependência, o cleanup matava o `setTimeout` recém-agendado e a
  // busca seguinte saía na hora, sem esperar os 15 segundos. Em vez de um QR a
  // cada 15s, virava uma rajada de chamadas — algumas delas no `/instance/connect`,
  // que é escrita e reinicia o pareamento. O contador vive num ref justamente
  // para poder crescer sem reiniciar o laço.
  useEffect(() => {
    if (!estado?.gerenciada || estado.conectada || pausado || modoCodigo) return

    let vivo = true
    async function buscar() {
      if (!vivo) return
      if (tentativasRef.current >= MAX_TENTATIVAS) { setPausado(true); return }

      const res = await getQrCodeUazapi(caixaId!)
      if (!vivo) return
      if (!res.ok) { setErro(res.error ?? 'Falha ao obter o QR code'); setPausado(true); return }
      if (res.conectada) { setQr(null); await carregarEstado(); router.refresh(); return }
      if (res.qr) setQr(res.qr)

      tentativasRef.current += 1
      timerRef.current = setTimeout(buscar, INTERVALO_QR)
    }
    buscar()

    return () => {
      vivo = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [estado?.gerenciada, estado?.conectada, caixaId, pausado, modoCodigo, carregarEstado, router])

  function recomecarQr() {
    tentativasRef.current = 0
    setErro(null); setQr(null); setPausado(false); setModoCodigo(false)
  }

  function comAcao(fn: () => Promise<{ ok: boolean; error?: string }>, depois?: () => void) {
    setErro(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setErro(res.error ?? 'Não foi possível concluir'); return }
      depois?.()
      await carregarEstado()
      router.refresh()
    })
  }

  function pedirCodigo() {
    setErro(null); setCodigo(null)
    startTransition(async () => {
      const res = await getCodigoPareamentoUazapi(caixaId!, telefone)
      if (!res.ok) { setErro(res.error ?? 'Falha ao gerar o código'); return }
      setCodigo(res.code ?? null)
    })
  }

  function remover() {
    if (!confirm(
      'Remover a conexão? A instância é apagada na uazapi de forma permanente e '
      + 'imediata. Para voltar, será preciso parear de novo.',
    )) return
    comAcao(() => removerConexaoUazapi(caixaId!), () => setQr(null))
  }

  if (!estado) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
        <Loader2 size={14} className="animate-spin" /> Carregando…
      </div>
    )
  }

  if (!estado.disponivel) {
    return (
      <Aviso tom="espera">
        A conexão automática não está habilitada nesta instalação. Faltam
        <code> UAZAPI_BASE_URL </code> e <code>UAZAPI_ADMIN_TOKEN</code> no ambiente.
      </Aviso>
    )
  }

  // -- Ainda não existe instância para esta rede ------------------------------
  if (!estado.gerenciada) {
    const perto = estado.teto > 0 && estado.usadas >= estado.teto - 5
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
          Conecte o WhatsApp da clínica escaneando um QR code, como no WhatsApp Web.
          Não é preciso contratar nada à parte — a conexão já faz parte do plano.
        </p>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', lineHeight: 1.55, margin: 0 }}>
          Use um número dedicado ao atendimento. O WhatsApp permite um aparelho por
          número, e conectar aqui desconecta outras sessões do WhatsApp Web.
        </p>

        {perto && (
          <Aviso tom="espera">
            {estado.usadas} de {estado.teto} conexões em uso nesta instalação.
          </Aviso>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <button type="button" onClick={() => comAcao(criarConexaoUazapi, recomecarQr)}
          disabled={isPending} className="btn-primary"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7 }}>
          <QrCode size={15} /> {isPending ? 'Criando…' : 'Conectar WhatsApp'}
        </button>
      </div>
    )
  }

  // -- Conectado --------------------------------------------------------------
  if (estado.conectada) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tom="ok">
          Conectado{estado.phone ? <> · <strong>{estado.phone}</strong></> : null}
          {estado.name ? ` (${estado.name})` : ''}
        </Aviso>

        {/* O IP de saída é o que separa uma clínica da outra quando uma é
            banida — melhor dizer qual está valendo do que presumir. */}
        {estado.proxyModo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)',
          }}>
            <ShieldCheck size={13} />
            {estado.proxyModo === 'internal'
              ? <>Saída por IP gerenciado pela uazapi{estado.proxyPais ? ` (${estado.proxyPais.toUpperCase()})` : ''}</>
              : <>Saída por IP próprio ({estado.proxyModo})</>}
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={carregarEstado} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Atualizar
          </button>
          <button type="button" onClick={() => comAcao(() => repararConexaoUazapi(caixaId!))}
            disabled={isPending} className="btn-ghost"
            title="Reaplica webhook, ritmo e proxy — use se as mensagens pararem de chegar">
            Reparar conexão
          </button>
          <button type="button" onClick={() => comAcao(() => desconectarUazapi(caixaId!), recomecarQr)}
            disabled={isPending} className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Unplug size={14} /> Desconectar número
          </button>
          <button type="button" onClick={remover} disabled={isPending} className="btn-ghost"
            style={{ marginLeft: 'auto', color: 'var(--danger)' }}>
            Remover conexão
          </button>
        </div>
      </div>
    )
  }

  // -- Aguardando pareamento --------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {estado.erro && <Aviso tom="erro">{estado.erro}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {modoCodigo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
            No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar
            com número de telefone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="5511999999999"
              className="field"
              style={{ fontSize: 'var(--text-base-sz)', flex: 1 }}
            />
            <button type="button" onClick={pedirCodigo} disabled={isPending} className="btn-primary">
              {isPending ? 'Gerando…' : 'Gerar código'}
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
              <p style={{ margin: '4px 0 0', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                Digite no celular. O código expira em alguns minutos.
              </p>
            </div>
          )}
          <button type="button" onClick={() => { setModoCodigo(false); recomecarQr() }}
            className="btn-ghost" style={{ alignSelf: 'flex-start' }}>
            Usar QR code
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{
            width: 220, height: 220, flexShrink: 0, borderRadius: 'var(--radius-field-token)',
            border: '1px solid var(--border)', background: 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {pausado ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                  O código expirou.
                </p>
                <button type="button" onClick={recomecarQr} className="btn-primary"
                  style={{ marginTop: 10, height: 32, fontSize: 'var(--text-sm-sz)' }}>
                  Gerar novo
                </button>
              </div>
            ) : qr ? (
              <img src={qr} alt="QR code para conectar o WhatsApp"
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <Loader2 size={20} className="animate-spin" color="var(--text-faint)" />
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: '8px 0 0' }}>
                  Preparando o código…
                </p>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p className="overline" style={{ color: 'var(--text-muted)', margin: 0 }}>
                Como conectar
              </p>
              <ol style={{
                margin: '8px 0 0', paddingLeft: 18, fontSize: 'var(--text-sm-sz)',
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
              style={{ alignSelf: 'flex-start', color: 'var(--danger)', fontSize: 'var(--text-sm-sz)' }}>
              Cancelar conexão
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
