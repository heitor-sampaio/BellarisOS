'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, CheckCircle2, AlertCircle, Loader2, ChevronDown, ExternalLink, Megaphone,
  Instagram, Mail, AlertTriangle,
} from 'lucide-react'
import {
  saveWhatsAppConfig, testWhatsAppConnection,
  saveAdsConfig, testAdsConnection,
  confirmMetaAdsSelection, disconnectMetaAds, fetchMetaAdAccounts,
  confirmMetaPageSelection, disconnectMetaMessaging,
} from '@/actions/integrations'
import type { IntegrationConfig } from '@/actions/integrations'
import type { WhatsAppConfig } from '@/lib/whatsapp/types'
import { UazapiConnect } from '@/components/admin/uazapi-connect'
import { SegSelect } from '@/components/shared/seg-select'
import { MODOS_OFICIAIS, modoDaConfig, type ModoOficial } from '@/lib/whatsapp/modo-oficial'

/**
 * Origem do site, resolvida só depois de montar.
 *
 * `window.location.origin` não existe no servidor, e o fallback literal fazia
 * o texto renderizado divergir do hidratado — o React descartava a árvore da
 * tela de integrações inteira. Vazio no primeiro render, real logo depois.
 */
function useOrigem(): string {
  const [origem, setOrigem] = useState('')
  useEffect(() => { setOrigem(window.location.origin) }, [])
  return origem
}
type ProviderType = WhatsAppConfig['provider']

function Field({
  label, name, value, onChange, type = 'text', placeholder, hint,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="field"
        style={{ fontSize: 'var(--text-base-sz)' }}
      />
      {hint && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>{hint}</p>}
    </div>
  )
}

function ConnectionStatus({ ok, detail }: { ok: boolean; detail?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 12px', borderRadius: 8,
      background: ok ? 'var(--success-bg)' : 'var(--danger-soft)',
      border: `1px solid ${ok ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'color-mix(in srgb, var(--danger) 20%, transparent)'}`,
      fontSize: 'var(--text-sm-sz)', fontWeight: 600,
      color: ok ? 'var(--success)' : 'var(--danger)',
    }}>
      {ok
        ? <CheckCircle2 size={14} />
        : <AlertCircle size={14} />
      }
      {ok
        ? `Conectado${detail ? ` · ${detail}` : ''}`
        : `Falha de conexão${detail ? ` · ${detail}` : ''}`
      }
    </div>
  )
}

// --- uazapi: conta própria (formulário manual) --------------------------------------------------------

function UazapiForm({ initial }: { initial?: IntegrationConfig }) {
  const origem = useOrigem()
  const existing = (initial?.config ?? {}) as Record<string, string>
  const [token,      setToken]      = useState(existing.token ?? '')
  const [baseUrl,    setBaseUrl]    = useState(existing.baseUrl ?? '')
  const [isActive,   setIsActive]   = useState(initial?.is_active ?? false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string } | null>(null)
  const [isPending,  startTransition] = useTransition()
  const [isTesting,  startTest]       = useTransition()
  const [saved,      setSaved]        = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const res = await saveWhatsAppConfig('uazapi', { token, baseUrl }, isActive)
      if (res.ok) setSaved(true)
    })
  }

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      // Save first, then test
      await saveWhatsAppConfig('uazapi', { token, baseUrl }, true)
      const res = await testWhatsAppConnection('uazapi')
      setTestResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <Field
        label="Token"
        name="token"
        value={token}
        onChange={setToken}
        type="password"
        placeholder="Token da instância na uazapi"
      />
      <Field
        label="Servidor (URL base)"
        name="baseUrl"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://suaconta.uazapi.com"
        hint="O subdomínio da sua conta na uazapi. Sem ele, usa o servidor padrão da instalação."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <input
          id="uazapi-active"
          type="checkbox"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="uazapi-active" style={{ fontSize: 'var(--text-base-sz)', cursor: 'pointer', color: 'var(--text)' }}>
          Ativar integração uazapi
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Configuração salva.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleTest}
          disabled={!token || isTesting}
          className="btn-secondary"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
          Testar conexão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!token || isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>

      <a
        href="https://docs.uazapi.com/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
      >
        <ExternalLink size={12} />
        Documentação da uazapi →
      </a>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: -8 }}>
        URL do webhook:{' '}
        <code style={{ background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 4, fontSize: 'var(--text-2xs)' }}>
          {origem}/api/webhooks/uazapi
        </code>
      </p>
    </div>
  )
}

// --- WhatsApp Oficial form ----------------------------------------------------

/**
 * A escolha de como o número chega à API oficial.
 *
 * O texto é a parte que importa: quem lê é quem opera a clínica, e a decisão
 * tem uma consequência que não dá para desfazer sozinho — no modo Cloud API o
 * aplicativo do celular deixa de atender por aquele número. Por isso o
 * "atenção" de cada modo fica em destaque, e não escondido num link.
 */
function EscolhaDoModoOficial({ modo, onEscolher }: {
  modo: ModoOficial
  onEscolher: (m: ModoOficial) => void
}) {
  const escolhido = MODOS_OFICIAIS[modo]
  const ehMigracao = modo === 'cloud_api'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{
          fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
          letterSpacing: '0.04em', marginBottom: 4,
        }}>
          COMO CONECTAR O NÚMERO
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 10 }}>
          Os dois usam a API oficial da Meta. O que muda é o que acontece com o
          aplicativo que está no celular hoje.
        </p>
        <SegSelect
          options={Object.values(MODOS_OFICIAIS).map(m => ({ key: m.chave, label: m.rotulo }))}
          value={modo}
          onSelect={m => onEscolher(m as ModoOficial)}
          ariaLabel="Como conectar o número à API oficial"
        />
      </div>

      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
          {escolhido.resumo}
        </p>

        <ListaDoModo titulo="Como fica o atendimento" itens={escolhido.comoFica} />
        <ListaDoModo titulo="O que precisa ter antes" itens={escolhido.exige} />

        <p style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          fontSize: 'var(--text-sm-sz)', lineHeight: 'var(--leading-normal)',
          fontWeight: ehMigracao ? 600 : 400,
          color: ehMigracao ? 'var(--danger)' : 'var(--text-muted)',
          background: ehMigracao ? 'var(--danger-soft)' : 'transparent',
          border: ehMigracao ? '1px solid var(--danger-border)' : 'none',
          borderRadius: 8,
          padding: ehMigracao ? '9px 11px' : 0,
        }}>
          {ehMigracao && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{escolhido.atencao}</span>
        </p>
      </div>
    </div>
  )
}

function ListaDoModo({ titulo, itens }: { titulo: string; itens: readonly string[] }) {
  return (
    <div>
      <p className="overline" style={{ marginBottom: 5 }}>{titulo}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {itens.map(t => (
          <li key={t} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)',
            lineHeight: 'var(--leading-snug)',
          }}>
            <span aria-hidden style={{
              flexShrink: 0, width: 4, height: 4, borderRadius: '50%',
              background: 'var(--brand)', marginTop: 7,
            }} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OfficialForm({ initial }: { initial?: IntegrationConfig }) {
  const origem = useOrigem()
  const existing = (initial?.config ?? {}) as Record<string, string>
  const [phoneNumberId, setPhoneNumberId] = useState(existing.phoneNumberId ?? '')
  const [accessToken,   setAccessToken]   = useState(existing.accessToken ?? '')
  const [verifyToken,   setVerifyToken]   = useState(existing.verifyToken ?? '')
  const [appSecret,     setAppSecret]     = useState(existing.appSecret ?? '')
  const [wabaId,        setWabaId]        = useState(existing.wabaId ?? '')
  // Como o número chega à API: com o aplicativo continuando a funcionar
  // (coexistência) ou migrando de vez (Cloud API). Ver `lib/whatsapp/modo-oficial`.
  const [modo,          setModo]          = useState<ModoOficial>(modoDaConfig(existing))
  const [isActive,      setIsActive]      = useState(initial?.is_active ?? false)
  const [testResult,    setTestResult]    = useState<{ ok: boolean; detail?: string } | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [isTesting,     startTest]        = useTransition()
  const [saved,         setSaved]         = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const res = await saveWhatsAppConfig('official', { phoneNumberId, accessToken, verifyToken, appSecret, wabaId, modo }, isActive)
      if (res.ok) setSaved(true)
    })
  }

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      await saveWhatsAppConfig('official', { phoneNumberId, accessToken, verifyToken, appSecret, wabaId, modo }, true)
      const res = await testWhatsAppConnection('official')
      setTestResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* A escolha vem antes dos campos porque ela decide o que acontece com o
          aplicativo que está no celular da clínica hoje — e isso precisa ser
          sabido antes de alguém começar a colar credencial. */}
      <EscolhaDoModoOficial modo={modo} onEscolher={setModo} />

      <Field
        label="WhatsApp Business Account ID (WABA)"
        name="wabaId"
        value={wabaId}
        onChange={setWabaId}
        placeholder="Ex: 987654321098765"
        hint="Diferente do Phone Number ID. É por ele que os templates são criados e aprovados — sem ele a tela de Templates não envia nada à Meta."
      />
      <Field
        label="Phone Number ID"
        name="phoneNumberId"
        value={phoneNumberId}
        onChange={setPhoneNumberId}
        placeholder="Ex: 123456789012345"
        hint="Encontrado no painel Meta for Developers → WhatsApp → Getting Started"
      />
      <Field
        label="Access Token (System User)"
        name="accessToken"
        value={accessToken}
        onChange={setAccessToken}
        type="password"
        placeholder="EAAxxxxxxxxxxxxx"
      />
      <Field
        label="Verify Token (webhook)"
        name="verifyToken"
        value={verifyToken}
        onChange={setVerifyToken}
        placeholder="Uma string aleatória definida por você"
        hint="Use o mesmo valor que você colocar no campo Verify Token no painel da Meta"
      />
      <Field
        label="App Secret"
        name="appSecret"
        value={appSecret}
        onChange={setAppSecret}
        type="password"
        placeholder="App Secret do seu app na Meta"
        hint="Usado para validar a assinatura HMAC dos webhooks"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <input
          id="official-active"
          type="checkbox"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="official-active" style={{ fontSize: 'var(--text-base-sz)', cursor: 'pointer', color: 'var(--text)' }}>
          Ativar WhatsApp Oficial
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Configuração salva.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleTest}
          disabled={!phoneNumberId || !accessToken || isTesting}
          className="btn-secondary"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
          Testar conexão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!phoneNumberId || !accessToken || !verifyToken || !appSecret || isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>

      <div style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <p>URL do webhook para configurar no painel Meta:</p>
        <code style={{ background: 'var(--bg-app)', padding: '4px 8px', borderRadius: 4, fontSize: 'var(--text-2xs)' }}>
          {origem}/api/webhooks/whatsapp
        </code>
        <p style={{ marginTop: 4 }}>Campos obrigatórios: <strong>messages</strong>, <strong>message_status_updates</strong></p>
      </div>
    </div>
  )
}

// --- Meta Ads — OAuth Connect -------------------------------------------------

function MetaAdsConnect({
  initial, metaStep, metaError, metaErrorReason,
}: {
  initial?:          IntegrationConfig
  metaStep?:         string
  metaError?:        boolean
  metaErrorReason?:  string
}) {
  const router = useRouter()
  const config      = (initial?.config ?? {}) as Record<string, unknown>
  const hasToken    = !!config.access_token
  const adAccounts  = (config.ad_accounts ?? []) as Array<{ id: string; name: string }>
  const pixels      = (config.pixels      ?? []) as Array<{ id: string; name: string }>

  const isActive     = !!initial?.is_active && !!config.adAccountId
  const isSelectStep = !isActive && hasToken && adAccounts.length > 0

  const [selectedAccount, setSelectedAccount] = useState((config.adAccountId as string) || '')
  const [selectedPixel,   setSelectedPixel]   = useState((config.pixelId as string)    || '')
  const [confirmError,    setConfirmError]     = useState<string | null>(null)
  const [isPending,       startTransition]     = useTransition()
  const [isDisconnecting, startDisconnect]     = useTransition()
  const [isChanging,      setIsChanging]       = useState(false)
  const [liveAccounts,    setLiveAccounts]     = useState<Array<{ id: string; name: string }>>([])
  const [livePixels,      setLivePixels]       = useState<Array<{ id: string; name: string }>>([])
  const [isFetching,      setIsFetching]       = useState(false)
  const [fetchError,      setFetchError]       = useState<string | null>(null)

  function handleConnect() {
    window.location.href = '/api/oauth/meta'
  }

  async function handleOpenChange() {
    setIsChanging(true)
    setFetchError(null)
    setIsFetching(true)
    const res = await fetchMetaAdAccounts()
    setIsFetching(false)
    if (!res.ok) {
      setFetchError(res.error ?? 'Erro ao buscar contas')
      return
    }
    setLiveAccounts(res.adAccounts ?? [])
    setLivePixels(res.pixels ?? [])
    const currentAccountId = config.adAccountId as string | undefined
    setSelectedAccount(currentAccountId || res.adAccounts?.[0]?.id || '')
    setSelectedPixel((config.pixelId as string) || res.pixels?.[0]?.id || '')
  }

  function handleConfirm() {
    if (!selectedAccount) return
    setConfirmError(null)
    const accountName = liveAccounts.find(a => a.id === selectedAccount)?.name ?? adAccounts.find(a => a.id === selectedAccount)?.name
    const pixName     = livePixels.find(p => p.id === selectedPixel)?.name    ?? pixels.find(p => p.id === selectedPixel)?.name
    startTransition(async () => {
      const res = await confirmMetaAdsSelection(selectedAccount, selectedPixel, accountName, pixName)
      if (res.ok) {
        router.refresh()
      } else {
        setConfirmError(res.error ?? 'Erro ao salvar')
      }
    })
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      await disconnectMetaAds()
      router.refresh()
    })
  }

  // Estado 3 — Conectado e ativo
  if (isActive) {
    if (isChanging) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 14px', borderRadius: 8,
            background: '#1877F210', border: '1px solid #1877F230',
            fontSize: 'var(--text-base-sz)', fontWeight: 600, color: '#1877F2',
          }}>
            <CheckCircle2 size={15} />
            Conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
          </div>

          {isFetching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="animate-spin" />
              Buscando contas de anúncios...
            </div>
          ) : fetchError ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
            }}>
              <AlertCircle size={14} /> {fetchError}
            </div>
          ) : (
            <>
              {liveAccounts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    CONTA DE ANÚNCIOS
                  </label>
                  <select
                    value={selectedAccount}
                    onChange={e => setSelectedAccount(e.target.value)}
                    className="field"
                    style={{ fontSize: 'var(--text-base-sz)' }}
                  >
                    {liveAccounts.map(a => (
                      <option key={a.id} value={a.id}>act_{a.id} — {a.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  Nenhuma conta de anúncios encontrada. Certifique-se de ter acesso a uma conta no Meta Business Manager.
                </p>
              )}

              {livePixels.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    PIXEL (OPCIONAL)
                  </label>
                  <select
                    value={selectedPixel}
                    onChange={e => setSelectedPixel(e.target.value)}
                    className="field"
                    style={{ fontSize: 'var(--text-base-sz)' }}
                  >
                    <option value="">Sem pixel</option>
                    {livePixels.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>
              )}

              {confirmError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
                  fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
                }}>
                  <AlertCircle size={14} /> {confirmError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedAccount || isPending}
                  className="btn-primary"
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Salvar alteração
                </button>
                <button
                  type="button"
                  onClick={() => { setIsChanging(false); setConfirmError(null) }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
          fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--success)',
        }}>
          <CheckCircle2 size={15} />
          Conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
        </div>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0 }}>
          Conta: <strong>{(config.adAccountName as string) || `act_${config.adAccountId as string}`}</strong>
          {!!config.pixelId && <> · Pixel: <strong>{(config.pixelName as string) || (config.pixelId as string)}</strong></>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleOpenChange}
            className="btn-secondary"
            style={{ alignSelf: 'flex-start' }}
          >
            Alterar conta
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="btn-secondary"
            style={{ alignSelf: 'flex-start' }}
          >
            {isDisconnecting && <Loader2 size={14} className="animate-spin" />}
            Desconectar
          </button>
        </div>
      </div>
    )
  }

  // Estado 2 — OAuth feito, aguardando seleção de conta
  if (isSelectStep) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 8,
          background: '#1877F210', border: '1px solid #1877F230',
          fontSize: 'var(--text-base-sz)', fontWeight: 600, color: '#1877F2',
        }}>
          <CheckCircle2 size={15} />
          Facebook conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
        </div>

        {adAccounts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              CONTA DE ANÚNCIOS
            </label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="field"
              style={{ fontSize: 'var(--text-base-sz)' }}
            >
              {adAccounts.map(a => (
                <option key={a.id} value={a.id}>act_{a.id} — {a.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Nenhuma conta de anúncios encontrada neste perfil. Certifique-se de ter acesso a uma conta no Meta Business Manager.
          </p>
        )}

        {pixels.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Deixou de ser "opcional": sem pixel a API de Conversões não tem
                para onde mandar, e agendamento e venda nunca voltam para a
                campanha. Com um só na conta, ele já vem escolhido. */}
            <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              PIXEL
            </label>
            <select
              value={selectedPixel}
              onChange={e => setSelectedPixel(e.target.value)}
              className="field"
              style={{ fontSize: 'var(--text-base-sz)' }}
            >
              <option value="">Sem pixel</option>
              {pixels.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
              ))}
            </select>
            {!selectedPixel && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                Sem pixel, os relatórios de campanha funcionam, mas agendamentos
                e vendas não voltam para a Meta.
              </p>
            )}
          </div>
        ) : (
          // Silêncio aqui era o pior caso: conectava, parecia certo, e a
          // atribuição simplesmente não acontecia.
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>
            Nenhum pixel encontrado neste perfil nem nas contas de anúncios.
            Os relatórios de campanha vão funcionar, mas agendamentos e vendas
            não voltam para a Meta — crie um pixel no Gerenciador de Eventos e
            clique em atualizar.
          </p>
        )}

        {confirmError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
            fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
          }}>
            <AlertCircle size={14} /> {confirmError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedAccount || isPending}
            className="btn-primary"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Confirmar integração
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="btn-secondary"
          >
            Desconectar
          </button>
        </div>
      </div>
    )
  }

  // Estado 1 — Não conectado
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {metaError && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
          fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--danger)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertCircle size={15} />
            Falha ao conectar com o Facebook. Verifique as permissões do app e tente novamente.
          </div>
          {metaErrorReason && (
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 400, opacity: 0.8, paddingLeft: 22 }}>
              Motivo: {metaErrorReason}
            </span>
          )}
        </div>
      )}

      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: '#1877F208', border: '1px solid #1877F220',
        fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        Conecte sua conta do Facebook para importar automaticamente suas contas de anúncios e pixels. Nenhuma configuração manual necessária.
      </div>

      <button
        type="button"
        onClick={handleConnect}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
          background: '#1877F2', border: 'none', color: 'var(--surface)',
          fontWeight: 700, fontSize: 'var(--text-base-sz)', fontFamily: 'inherit',
          alignSelf: 'flex-start', transition: 'opacity 120ms',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.026 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49H13.875V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
        Continuar com Facebook
      </button>

      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
        Você será redirecionado para o Facebook para autorizar o acesso às suas contas de anúncios.
      </p>
    </div>
  )
}

// --- Google Ads form ----------------------------------------------------------

function GoogleAdsForm({ initial }: { initial?: IntegrationConfig }) {
  const existing = (initial?.config ?? {}) as Record<string, string>
  const [customerId,     setCustomerId]     = useState(existing.customerId ?? '')
  const [developerToken, setDeveloperToken] = useState(existing.developerToken ?? '')
  const [clientId,       setClientId]       = useState(existing.clientId ?? '')
  const [clientSecret,   setClientSecret]   = useState(existing.clientSecret ?? '')
  const [refreshToken,   setRefreshToken]   = useState(existing.refreshToken ?? '')
  const [isActive,       setIsActive]       = useState(initial?.is_active ?? false)
  const [testResult,     setTestResult]     = useState<{ ok: boolean; detail?: string } | null>(null)
  const [isPending,      startTransition]   = useTransition()
  const [isTesting,      startTest]         = useTransition()
  const [saved,          setSaved]          = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const res = await saveAdsConfig('google_ads', {
        customerId, developerToken, clientId, clientSecret, refreshToken,
      }, isActive)
      if (res.ok) setSaved(true)
    })
  }

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      await saveAdsConfig('google_ads', {
        customerId, developerToken, clientId, clientSecret, refreshToken,
      }, true)
      const res = await testAdsConnection('google_ads')
      setTestResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: '#34A85308', border: '1px solid #34A85330',
        fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong>Atenção:</strong> A Google Ads API requer um Developer Token com aprovação manual da Google (processo pode levar dias).
        Além disso, é necessário configurar um projeto OAuth2 no Google Cloud Console.
      </div>
      <Field
        label="Customer ID"
        name="customerId"
        value={customerId}
        onChange={setCustomerId}
        placeholder="Ex: 123-456-7890 ou 1234567890"
        hint="Número de 10 dígitos encontrado no canto superior da sua conta Google Ads"
      />
      <Field
        label="Developer Token"
        name="developerToken"
        value={developerToken}
        onChange={setDeveloperToken}
        type="password"
        placeholder="Seu Developer Token"
        hint="Solicitado em Google Ads API → Centro de API → Developer token"
      />
      <Field
        label="Client ID (OAuth2)"
        name="clientId"
        value={clientId}
        onChange={setClientId}
        placeholder="xxxxxxxxxx.apps.googleusercontent.com"
        hint="Criado no Google Cloud Console → Credenciais → ID do cliente OAuth2"
      />
      <Field
        label="Client Secret (OAuth2)"
        name="clientSecret"
        value={clientSecret}
        onChange={setClientSecret}
        type="password"
        placeholder="GOCSPX-xxxxxxxxxx"
      />
      <Field
        label="Refresh Token"
        name="refreshToken"
        value={refreshToken}
        onChange={setRefreshToken}
        type="password"
        placeholder="1//xxxxxxxxxxxxxxxxxxxxxxxxx"
        hint="Gerado pelo OAuth2 Playground ou sua aplicação após autorização do usuário"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <input
          id="google-active"
          type="checkbox"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="google-active" style={{ fontSize: 'var(--text-base-sz)', cursor: 'pointer', color: 'var(--text)' }}>
          Ativar integração Google Ads
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Configuração salva.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleTest}
          disabled={!customerId || !developerToken || !refreshToken || isTesting}
          className="btn-secondary"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : null}
          Testar conexão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!customerId || !developerToken || !clientId || !clientSecret || !refreshToken || isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>

      <a
        href="https://developers.google.com/google-ads/api/docs/get-started/make-first-call"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
      >
        <ExternalLink size={12} />
        Guia de configuração da Google Ads API →
      </a>
    </div>
  )
}

// --- Meta Messaging (Instagram Direct + Messenger) ---------------------------

function MetaMessagingConnect({
  initial, metaStep, metaError, metaErrorReason,
}: {
  initial?:         IntegrationConfig
  metaStep?:        string
  metaError?:       boolean
  metaErrorReason?: string
}) {
  const router = useRouter()
  const config = (initial?.config ?? {}) as Record<string, unknown>

  const pages = (config.pages ?? []) as Array<{
    pageId: string; pageName: string; igUserId?: string | null; igUsername?: string | null
  }>
  const hasToken     = !!config.access_token
  const activePageId = (config.activePageId as string) || ''
  const isActive     = !!initial?.is_active && !!activePageId
  const activePage   = pages.find(p => p.pageId === activePageId)

  const [selected,   setSelected]   = useState(activePageId || pages[0]?.pageId || '')
  const [erro,       setErro]       = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()
  const [isDisconnecting, startDisconnect] = useTransition()
  const [trocando,   setTrocando]   = useState(false)

  function handleConnect() {
    window.location.href = '/api/oauth/meta?produto=mensagens'
  }

  function handleConfirm() {
    if (!selected) return
    setErro(null)
    startTransition(async () => {
      const res = await confirmMetaPageSelection(selected)
      if (res.ok) { setTrocando(false); router.refresh() }
      else setErro(res.error ?? 'Erro ao salvar')
    })
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      await disconnectMetaMessaging()
      router.refresh()
    })
  }

  const erroOAuth = metaError && (metaStep === 'select_page' || !isActive) ? metaErrorReason : null

  // Estado 1 — nunca conectou
  if (!hasToken) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          Conecte a página do Facebook da clínica para receber e responder Messenger e
          Instagram Direct dentro do Inbox. O Instagram precisa ser uma conta profissional
          ligada a essa página.
        </p>
        {erroOAuth && <ErroBox texto={erroOAuth} />}
        <button type="button" onClick={handleConnect} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
          Conectar com o Facebook
        </button>
      </div>
    )
  }

  // Estado 2 — conectado, falta escolher a página (ou trocando)
  if (!isActive || trocando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 8,
          background: '#1877F210', border: '1px solid #1877F230',
          fontSize: 'var(--text-base-sz)', fontWeight: 600, color: '#1877F2',
        }}>
          <CheckCircle2 size={15} />
          Conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
        </div>

        {erroOAuth && <ErroBox texto={erroOAuth} />}

        {pages.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0 }}>
            Nenhuma página encontrada nesta conta. Você precisa ser administrador de ao menos
            uma página do Facebook.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              PÁGINA
            </label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="field"
              style={{ fontSize: 'var(--text-base-sz)' }}
            >
              {pages.map(p => (
                <option key={p.pageId} value={p.pageId}>
                  {p.pageName}{p.igUsername ? ` · @${p.igUsername}` : ''}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
              {pages.find(p => p.pageId === selected)?.igUserId
                ? 'Messenger e Instagram Direct serão recebidos no Inbox.'
                : 'Sem conta profissional do Instagram ligada — só o Messenger será recebido.'}
            </p>
          </div>
        )}

        {erro && <ErroBox texto={erro} />}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || isPending}
            className="btn-primary"
          >
            {isPending ? 'Salvando…' : 'Usar esta página'}
          </button>
          {trocando && (
            <button type="button" onClick={() => setTrocando(false)} className="btn-ghost">
              Cancelar
            </button>
          )}
        </div>
      </div>
    )
  }

  // Estado 3 — ativo
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 14px', borderRadius: 8,
        background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
        fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--success)',
      }}>
        <CheckCircle2 size={15} />
        <span>
          <strong>{activePage?.pageName}</strong>
          {activePage?.igUsername ? ` · @${activePage.igUsername}` : ' · só Messenger'}
        </span>
      </div>

      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
        Nestes canais só é possível responder até 24 horas depois da última mensagem do
        contato — regra da Meta. Passado esse prazo o Inbox bloqueia o envio.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setTrocando(true)} className="btn-ghost">
          Trocar página
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="btn-ghost"
          style={{ color: 'var(--danger)' }}
        >
          {isDisconnecting ? 'Desconectando…' : 'Desconectar'}
        </button>
      </div>
    </div>
  )
}

function ErroBox({ texto }: { texto: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
      fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)',
    }}>
      <AlertCircle size={14} /> {texto}
    </div>
  )
}

// --- Main export -------------------------------------------------------------

interface SettingsIntegrationsProps {
  initialConfigs:   IntegrationConfig[]
  metaStep?:        string
  metaError?:       boolean
  metaErrorReason?: string
}

type Section = 'whatsapp' | 'meta_messaging' | 'meta_ads' | 'google_ads' | null

export function SettingsIntegrations({ initialConfigs, metaStep, metaError, metaErrorReason }: SettingsIntegrationsProps) {
  const [section,    setSection]    = useState<Section>(
    metaStep === 'select_page' ? 'meta_messaging' : 'whatsapp',
  )
  // Quem já configurou à mão cai direto na aba do formulário; quem não tem
  // nada vê primeiro o caminho fácil.
  const [uazapiModo, setUazapiModo] = useState<'gerenciada' | 'propria'>(() => {
    const uazapi = initialConfigs.find(c => c.provider === 'uazapi')
    if (!uazapi?.config) return 'gerenciada'
    return (uazapi.config as Record<string, unknown>).managed === true ? 'gerenciada' : 'propria'
  })
  const [wpProvider, setWpProvider] = useState<ProviderType>(() => {
    const existing = initialConfigs.find(c => c.provider === 'uazapi' || c.provider === 'official')
    return (existing?.provider as ProviderType) ?? 'uazapi'
  })

  const uazapiConfig     = initialConfigs.find(c => c.provider === 'uazapi')
  const officialConfig = initialConfigs.find(c => c.provider === 'official')
  const metaAdsConfig  = initialConfigs.find(c => c.provider === 'meta_ads')
  const metaMsgConfig  = initialConfigs.find(c => c.provider === 'meta_messaging')
  const googleAdsConfig = initialConfigs.find(c => c.provider === 'google_ads')

  const hasWhatsApp  = uazapiConfig?.is_active || officialConfig?.is_active
  const hasMetaAds   = metaAdsConfig?.is_active
  const hasMetaMsg   = metaMsgConfig?.is_active
  const hasGoogleAds = googleAdsConfig?.is_active

  function SectionCard({
    id, icon, iconBg, iconColor, title, subtitle, isActive, children,
  }: {
    id: Section; icon: React.ReactNode; iconBg: string; iconColor: string
    title: string; subtitle: string; isActive: boolean; children: React.ReactNode
  }) {
    const open = section === id
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setSection(open ? null : id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', border: 'none', cursor: 'pointer',
            background: 'transparent', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: iconBg, border: `1.5px solid ${iconColor}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {icon}
            </div>
            <div>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', margin: 0, marginTop: 2 }}>{subtitle}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isActive && (
              <span style={{
                fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
              }}>
                Ativo
              </span>
            )}
            <ChevronDown
              size={16} color="var(--text-faint)"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
          </div>
        </button>
        {open && (
          <div style={{ borderTop: '1px solid var(--hairline)', padding: '20px 24px' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      {/* -- Seção: Comunicação ---------------------------------------------- */}
      <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Comunicação
      </p>

      <SectionCard
        id="whatsapp"
        icon={<Phone size={18} color="#25D366" />}
        iconBg="#25D36615" iconColor="#25D366"
        title="WhatsApp"
        subtitle={hasWhatsApp ? `Conectado via ${uazapiConfig?.is_active ? 'uazapi' : 'WhatsApp Oficial'}` : 'Não configurado'}
        isActive={!!hasWhatsApp}
      >
        {/* Provider selector */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
            PROVEDOR
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['uazapi', 'official'] as ProviderType[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setWpProvider(p)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: wpProvider === p ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                  background: wpProvider === p ? 'var(--brand-soft)' : 'var(--bg-app)',
                  fontWeight: 700, fontSize: 'var(--text-base-sz)',
                  color: wpProvider === p ? 'var(--brand)' : 'var(--text-muted)',
                  transition: 'all 120ms',
                }}
              >
                {p === 'uazapi' ? 'uazapi' : 'WhatsApp Oficial'}
                <p style={{ fontSize: 'var(--text-overline)', fontWeight: 500, marginTop: 3, color: 'inherit', opacity: 0.75 }}>
                  {p === 'uazapi' ? 'Via WhatsApp Web — mais fácil de configurar' : 'Meta Cloud API — requer aprovação da Meta'}
                </p>
              </button>
            ))}
          </div>
        </div>
        {wpProvider === 'uazapi' ? (
          <>
            {/* Dois caminhos para o mesmo provedor: conectar por aqui (instância
                na nossa conta de integrador) ou usar uma conta própria. */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <SegSelect
                options={[
                  { key: 'gerenciada', label: 'Conectar por aqui' },
                  { key: 'propria',    label: 'Já tenho conta uazapi' },
                ]}
                value={uazapiModo}
                onSelect={m => setUazapiModo(m as 'gerenciada' | 'propria')}
                ariaLabel="Como conectar o WhatsApp"
              />
            </div>
            {uazapiModo === 'gerenciada'
              ? <UazapiConnect />
              : <UazapiForm initial={uazapiConfig} />}
          </>
        ) : (
          <OfficialForm initial={officialConfig} />
        )}
      </SectionCard>

      <SectionCard
        id="meta_messaging"
        icon={<Instagram size={18} color="#E1306C" />}
        iconBg="#E1306C15" iconColor="#E1306C"
        title="Instagram e Messenger"
        subtitle={
          hasMetaMsg
            ? `Conectado · ${String((metaMsgConfig?.config?.pages as Array<{ pageId: string; pageName: string }> | undefined)
                ?.find(p => p.pageId === metaMsgConfig?.config?.activePageId)?.pageName ?? 'Página')}`
            : 'Instagram Direct · Facebook Messenger'
        }
        isActive={!!hasMetaMsg}
      >
        <MetaMessagingConnect
          initial={metaMsgConfig}
          metaStep={metaStep}
          metaError={metaError}
          metaErrorReason={metaErrorReason}
        />
      </SectionCard>

      {/* E-mail ainda não tem provedor: fica como placeholder honesto. */}
      <div className="card" style={{ padding: '14px 20px', opacity: 0.55 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'var(--bg-app)', border: '1.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mail size={18} color="var(--text-faint)" />
            </div>
            <div>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>E-mail (Resend)</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', margin: 0, marginTop: 1 }}>Em breve</p>
            </div>
          </div>
          <span style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: 'var(--bg-app)', color: 'var(--text-faint)', border: '1px solid var(--border)',
          }}>
            Em breve
          </span>
        </div>
      </div>

      {/* -- Seção: Marketing ------------------------------------------------ */}
      <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
        Marketing
      </p>

      <SectionCard
        id="meta_ads"
        icon={<Megaphone size={18} color="#1877F2" />}
        iconBg="#1877F215" iconColor="#1877F2"
        title="Meta Ads"
        subtitle={hasMetaAds ? `Conectado · Conta act_${String(metaAdsConfig?.config?.adAccountId ?? '')}` : 'Facebook · Instagram'}
        isActive={!!hasMetaAds}
      >
        <MetaAdsConnect initial={metaAdsConfig} metaStep={metaStep} metaError={metaError} metaErrorReason={metaErrorReason} />
      </SectionCard>

      <SectionCard
        id="google_ads"
        icon={<Megaphone size={18} color="#34A853" />}
        iconBg="#34A85315" iconColor="#34A853"
        title="Google Ads"
        subtitle={hasGoogleAds ? `Conectado · Cliente ${String(googleAdsConfig?.config?.customerId ?? '')}` : 'Google Search · Display · YouTube'}
        isActive={!!hasGoogleAds}
      >
        <GoogleAdsForm initial={googleAdsConfig} />
      </SectionCard>
    </div>
  )
}
