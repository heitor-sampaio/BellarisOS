'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { conectarWhatsAppPelaMeta } from '@/actions/integrations'
import type { ModoOficial } from '@/lib/whatsapp/modo-oficial'

/**
 * "Conectar pela Meta": o cadastro incorporado (Embedded Signup) numa janela da
 * Meta sobre o BellarisOS. A clínica entra com o Facebook, escolhe (ou cria) a
 * conta do WhatsApp e o número, e volta com a caixa pronta — sem colar token.
 *
 * A janela fala com esta tela por dois canais, e os dois são necessários:
 *  - o `FB.login` devolve o CÓDIGO de autorização (vale 30 s);
 *  - uma mensagem `WA_EMBEDDED_SIGNUP` (postMessage do facebook.com) traz a
 *    conta e o número escolhidos.
 * Chegam em ordem qualquer; quando os dois estão aqui, o servidor faz o resto
 * (`conectarWhatsAppPelaMeta` → `lib/whatsapp/cadastro-incorporado.ts`), e é
 * ele que confere que o número é mesmo daquela conta.
 *
 * O SDK da Meta carrega AQUI, e só aqui (2026-10-22): até então vinha no
 * layout raiz com `logPageView`, e toda página da clínica avisava a Meta da
 * visita — o login, o portal da cliente, o link público da ficha com o token
 * no endereço. Carrega ao montar o botão (o `FB.login` precisa ser chamado no
 * clique, sem esperar nada, ou o navegador barra a janela), e sem contar a
 * visita. O `appId` vem do servidor: no build do Railway não há env.
 */

interface Sessao { wabaId: string; phoneNumberId: string; businessId: string | null }

type Estado =
  | { fase: 'ocioso' }
  | { fase: 'na-meta' }
  | { fase: 'gravando' }
  | { fase: 'ok'; avisos: string[] }
  | { fase: 'erro'; texto: string }

declare global {
  interface Window {
    FB?: {
      login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, opcoes: Record<string, unknown>) => void
      init:  (opcoes: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

let carregando: Promise<void> | null = null

/** Põe o SDK da Meta na página uma vez (as próximas chamadas esperam a mesma carga). */
function carregarSdkDaMeta(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve()
  if (carregando) return carregando
  carregando = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, cookie: true, xfbml: true, version: 'v25.0' })
      resolve()
    }
    const s = document.createElement('script')
    s.id = 'facebook-jssdk'
    s.src = 'https://connect.facebook.net/en_US/sdk.js'
    s.async = true
    s.crossOrigin = 'anonymous'
    // Bloqueador de anúncios, rede caída: a próxima montagem tenta de novo.
    s.onerror = () => { carregando = null; s.remove(); reject(new Error('SDK da Meta')) }
    document.body.appendChild(s)
  })
  return carregando
}

const EVENTOS_DE_SUCESSO = new Set([
  'FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  'FINISH_OBO_MIGRATION', 'FINISH_GRANT_ONLY_API_ACCESS',
])

export function ConectarWhatsAppPelaMeta({ configId, appId, modo, rotulo = 'Conectar pela Meta', nomeDoNumero }: {
  /** O nome escolhido para o número (sem ele, o que já tinha ou o da conta na Meta). */
  nomeDoNumero?: string
  configId: string
  /** O app da Meta (`NEXT_PUBLIC_META_APP_ID`, lido no servidor). */
  appId:    string | null
  modo:     ModoOficial
  rotulo?:  string
}) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ fase: 'ocioso' })
  const sessao = useRef<Sessao | null>(null)
  const saida = useRef<string | null>(null)

  useEffect(() => { void carregarSdkDaMeta(appId ?? '').catch(() => {}) }, [appId])

  // A conta e o número escolhidos chegam por postMessage da janela da Meta.
  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      let host = ''
      try { host = new URL(ev.origin).hostname } catch { return }
      // Só o que vem da Meta: qualquer página aberta pode mandar postMessage.
      if (!/(^|\.)facebook\.com$/.test(host)) return
      let dados: { type?: string; event?: string; data?: Record<string, string> }
      try { dados = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data } catch { return }
      if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (dados.event && EVENTOS_DE_SUCESSO.has(dados.event) && dados.data?.waba_id) {
        sessao.current = {
          wabaId:        String(dados.data.waba_id),
          phoneNumberId: String(dados.data.phone_number_id ?? ''),
          businessId:    dados.data.business_id ? String(dados.data.business_id) : null,
        }
      } else if (dados.event === 'CANCEL') {
        saida.current = 'O cadastro foi fechado antes de terminar.'
      } else if (dados.event === 'ERROR') {
        saida.current = `A Meta recusou o cadastro: ${dados.data?.error_message ?? 'erro sem descrição'}.`
      }
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [])

  async function concluir(code: string) {
    // A mensagem com a conta costuma chegar antes do código, mas não há
    // garantia: espera um pouco por ela (o código vale 30 s).
    for (let i = 0; i < 25 && !sessao.current && !saida.current; i++) {
      await new Promise(r => setTimeout(r, 200))
    }
    const s = sessao.current
    if (!s?.phoneNumberId) {
      setEstado({ fase: 'erro', texto: saida.current ?? 'A Meta não disse qual número foi escolhido. Conecte de novo.' })
      return
    }
    setEstado({ fase: 'gravando' })
    const r = await conectarWhatsAppPelaMeta({ code, wabaId: s.wabaId, phoneNumberId: s.phoneNumberId, businessId: s.businessId, modo, rotulo: nomeDoNumero?.trim() || null })
    if (!r.ok) { setEstado({ fase: 'erro', texto: r.error }); return }
    setEstado({ fase: 'ok', avisos: r.avisos })
    router.refresh()
  }

  function abrir() {
    if (!window.FB) {
      setEstado({ fase: 'erro', texto: 'O acesso à Meta não carregou nesta página. Um bloqueador de anúncios pode estar impedindo — desative-o aqui e recarregue.' })
      return
    }
    sessao.current = null
    saida.current = null
    setEstado({ fase: 'na-meta' })
    // O callback do FB.login não pode ser `async` (o SDK recusa): ele só
    // entrega o código à função que espera.
    window.FB.login(resposta => {
      const code = resposta?.authResponse?.code
      if (code) void concluir(code)
      else setEstado({ fase: 'erro', texto: saida.current ?? 'O cadastro na Meta não foi concluído.' })
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      // Os mesmos extras do link hospedado que a Meta gera para esta
      // configuração. A versão (v4) é da configuração do `config_id`; repetir
      // aqui não muda nada nela e evita depender disso.
      extras: {
        setup: {},
        version: 'v4',
        sessionInfoVersion: '3',
        // Coexistência: o número continua no aplicativo do celular.
        ...(modo === 'coexistencia' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
      },
    })
  }

  const ocupado = estado.fase === 'na-meta' || estado.fase === 'gravando'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" className="btn-primary" onClick={abrir} disabled={ocupado} style={{ alignSelf: 'flex-start' }}>
        {ocupado && <Loader2 size={14} className="animate-spin" />}
        {estado.fase === 'na-meta' ? 'Continue na janela da Meta…'
          : estado.fase === 'gravando' ? 'Conectando o número…'
          : rotulo}
      </button>

      {estado.fase === 'ok' && (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 700 }}>
            <CheckCircle2 size={14} /> Número conectado.
            {modo === 'coexistencia' && ' As conversas do aplicativo vão aparecendo no inbox nos próximos minutos.'}
          </p>
          {estado.avisos.map(a => (
            <p key={a} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)' }}>{a}</p>
          ))}
        </div>
      )}
      {estado.fase === 'erro' && (
        <p role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {estado.texto}
        </p>
      )}
    </div>
  )
}
