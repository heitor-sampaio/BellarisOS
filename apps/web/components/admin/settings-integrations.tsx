'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, CheckCircle2, AlertCircle, Loader2, ChevronDown, ExternalLink, Megaphone,
} from 'lucide-react'
import {
  saveWhatsAppConfig, testWhatsAppConnection,
  saveAdsConfig, testAdsConnection,
  confirmMetaAdsSelection, disconnectMetaAds,
} from '@/actions/integrations'
import type { IntegrationConfig } from '@/actions/integrations'
import type { WhatsAppConfig } from '@/lib/whatsapp/types'

type ProviderType = WhatsAppConfig['provider']

function Field({
  label, name, value, onChange, type = 'text', placeholder, hint,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
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
        style={{ fontSize: 13 }}
      />
      {hint && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{hint}</p>}
    </div>
  )
}

function ConnectionStatus({ ok, detail }: { ok: boolean; detail?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 12px', borderRadius: 8,
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#3f9b6f33' : '#dc262633'}`,
      fontSize: 12.5, fontWeight: 600,
      color: ok ? '#3f9b6f' : '#dc2626',
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

// ─── Z-API config form ────────────────────────────────────────────────────────

function ZAPIForm({ initial }: { initial?: IntegrationConfig }) {
  const existing = (initial?.config ?? {}) as Record<string, string>
  const [instanceId, setInstanceId] = useState(existing.instanceId ?? '')
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
      const res = await saveWhatsAppConfig('zapi', { instanceId, token, baseUrl }, isActive)
      if (res.ok) setSaved(true)
    })
  }

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      // Save first, then test
      await saveWhatsAppConfig('zapi', { instanceId, token, baseUrl }, true)
      const res = await testWhatsAppConnection('zapi')
      setTestResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        label="Instance ID"
        name="instanceId"
        value={instanceId}
        onChange={setInstanceId}
        placeholder="Seu Instance ID do Z-API"
        hint="Encontrado no painel Z-API em Instâncias"
      />
      <Field
        label="Token"
        name="token"
        value={token}
        onChange={setToken}
        type="password"
        placeholder="Token da instância"
      />
      <Field
        label="URL base (opcional)"
        name="baseUrl"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://api.z-api.io (deixe em branco para usar o padrão)"
        hint="Preencha apenas se usar instância self-hosted"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <input
          id="zapi-active"
          type="checkbox"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="zapi-active" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
          Ativar integração Z-API
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Configuração salva.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleTest}
          disabled={!instanceId || !token || isTesting}
          className="btn-secondary"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
          Testar conexão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!instanceId || !token || isPending}
          className="btn-primary"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar
        </button>
      </div>

      <a
        href="https://developer.z-api.io/webhooks/on-message-received"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 12, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
      >
        <ExternalLink size={12} />
        Configure o webhook no Z-API para receber mensagens →
      </a>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: -8 }}>
        URL do webhook:{' '}
        <code style={{ background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
          {typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio.com'}/api/webhooks/zapi
        </code>
      </p>
    </div>
  )
}

// ─── WhatsApp Oficial form ────────────────────────────────────────────────────

function OfficialForm({ initial }: { initial?: IntegrationConfig }) {
  const existing = (initial?.config ?? {}) as Record<string, string>
  const [phoneNumberId, setPhoneNumberId] = useState(existing.phoneNumberId ?? '')
  const [accessToken,   setAccessToken]   = useState(existing.accessToken ?? '')
  const [verifyToken,   setVerifyToken]   = useState(existing.verifyToken ?? '')
  const [appSecret,     setAppSecret]     = useState(existing.appSecret ?? '')
  const [isActive,      setIsActive]      = useState(initial?.is_active ?? false)
  const [testResult,    setTestResult]    = useState<{ ok: boolean; detail?: string } | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [isTesting,     startTest]        = useTransition()
  const [saved,         setSaved]         = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const res = await saveWhatsAppConfig('official', { phoneNumberId, accessToken, verifyToken, appSecret }, isActive)
      if (res.ok) setSaved(true)
    })
  }

  function handleTest() {
    setTestResult(null)
    startTest(async () => {
      await saveWhatsAppConfig('official', { phoneNumberId, accessToken, verifyToken, appSecret }, true)
      const res = await testWhatsAppConnection('official')
      setTestResult(res)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <label htmlFor="official-active" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
          Ativar WhatsApp Oficial
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>
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

      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <p>URL do webhook para configurar no painel Meta:</p>
        <code style={{ background: 'var(--bg-app)', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>
          {typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio.com'}/api/webhooks/whatsapp
        </code>
        <p style={{ marginTop: 4 }}>Campos obrigatórios: <strong>messages</strong>, <strong>message_status_updates</strong></p>
      </div>
    </div>
  )
}

// ─── Meta Ads — OAuth Connect ─────────────────────────────────────────────────

function MetaAdsConnect({
  initial, metaStep, metaError,
}: {
  initial?:   IntegrationConfig
  metaStep?:  string
  metaError?: boolean
}) {
  const router = useRouter()
  const config      = (initial?.config ?? {}) as Record<string, unknown>
  const hasToken    = !!config.access_token
  const adAccounts  = (config.ad_accounts ?? []) as Array<{ id: string; name: string }>
  const pixels      = (config.pixels      ?? []) as Array<{ id: string; name: string }>

  const isActive     = !!initial?.is_active && !!config.adAccountId
  const isSelectStep = !isActive && hasToken && adAccounts.length > 0

  const [selectedAccount, setSelectedAccount] = useState(adAccounts[0]?.id ?? '')
  const [selectedPixel,   setSelectedPixel]   = useState(pixels[0]?.id ?? '')
  const [confirmError,    setConfirmError]     = useState<string | null>(null)
  const [isPending,       startTransition]     = useTransition()
  const [isDisconnecting, startDisconnect]     = useTransition()

  function handleConnect() {
    window.location.href = '/api/oauth/meta'
  }

  function handleConfirm() {
    if (!selectedAccount) return
    setConfirmError(null)
    startTransition(async () => {
      const res = await confirmMetaAdsSelection(selectedAccount, selectedPixel)
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 8,
          background: '#f0fdf4', border: '1px solid #3f9b6f33',
          fontSize: 13, fontWeight: 600, color: '#3f9b6f',
        }}>
          <CheckCircle2 size={15} />
          Conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          Conta: <strong>act_{config.adAccountId as string}</strong>
          {config.pixelId && <> · Pixel: <strong>{config.pixelId as string}</strong></>}
        </p>
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
          fontSize: 13, fontWeight: 600, color: '#1877F2',
        }}>
          <CheckCircle2 size={15} />
          Facebook conectado como <strong>{(config.meta_user_name as string) || 'Usuário Facebook'}</strong>
        </div>

        {adAccounts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              CONTA DE ANÚNCIOS
            </label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="field"
              style={{ fontSize: 13 }}
            >
              {adAccounts.map(a => (
                <option key={a.id} value={a.id}>act_{a.id} — {a.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Nenhuma conta de anúncios encontrada neste perfil. Certifique-se de ter acesso a uma conta no Meta Business Manager.
          </p>
        )}

        {pixels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              PIXEL (OPCIONAL)
            </label>
            <select
              value={selectedPixel}
              onChange={e => setSelectedPixel(e.target.value)}
              className="field"
              style={{ fontSize: 13 }}
            >
              <option value="">Sem pixel</option>
              {pixels.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
              ))}
            </select>
          </div>
        )}

        {confirmError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 12px', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #dc262633',
            fontSize: 12.5, fontWeight: 600, color: '#dc2626',
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
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 14px', borderRadius: 8,
          background: '#fef2f2', border: '1px solid #dc262633',
          fontSize: 13, fontWeight: 600, color: '#dc2626',
        }}>
          <AlertCircle size={15} />
          Falha ao conectar com o Facebook. Verifique as permissões do app e tente novamente.
        </div>
      )}

      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: '#1877F208', border: '1px solid #1877F220',
        fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        Conecte sua conta do Facebook para importar automaticamente suas contas de anúncios e pixels. Nenhuma configuração manual necessária.
      </div>

      <button
        type="button"
        onClick={handleConnect}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
          background: '#1877F2', border: 'none', color: '#fff',
          fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          alignSelf: 'flex-start', transition: 'opacity 120ms',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.026 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49H13.875V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
        Continuar com Facebook
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        Você será redirecionado para o Facebook para autorizar o acesso às suas contas de anúncios.
      </p>
    </div>
  )
}

// ─── Google Ads form ──────────────────────────────────────────────────────────

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
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
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
        <label htmlFor="google-active" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
          Ativar integração Google Ads
        </label>
      </div>

      {testResult && <ConnectionStatus ok={testResult.ok} detail={testResult.detail} />}
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>
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
        style={{ fontSize: 12, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
      >
        <ExternalLink size={12} />
        Guia de configuração da Google Ads API →
      </a>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface SettingsIntegrationsProps {
  initialConfigs: IntegrationConfig[]
  metaStep?:      string
  metaError?:     boolean
}

type Section = 'whatsapp' | 'meta_ads' | 'google_ads' | null

export function SettingsIntegrations({ initialConfigs, metaStep, metaError }: SettingsIntegrationsProps) {
  const [section,    setSection]    = useState<Section>('whatsapp')
  const [wpProvider, setWpProvider] = useState<ProviderType>(() => {
    const existing = initialConfigs.find(c => c.provider === 'zapi' || c.provider === 'official')
    return (existing?.provider as ProviderType) ?? 'zapi'
  })

  const zapiConfig     = initialConfigs.find(c => c.provider === 'zapi')
  const officialConfig = initialConfigs.find(c => c.provider === 'official')
  const metaAdsConfig  = initialConfigs.find(c => c.provider === 'meta_ads')
  const googleAdsConfig = initialConfigs.find(c => c.provider === 'google_ads')

  const hasWhatsApp  = zapiConfig?.is_active || officialConfig?.is_active
  const hasMetaAds   = metaAdsConfig?.is_active
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
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, marginTop: 2 }}>{subtitle}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isActive && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: '#f0fdf4', color: '#3f9b6f', border: '1px solid #3f9b6f33',
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
      {/* ── Seção: Comunicação ────────────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Comunicação
      </p>

      <SectionCard
        id="whatsapp"
        icon={<Phone size={18} color="#25D366" />}
        iconBg="#25D36615" iconColor="#25D366"
        title="WhatsApp"
        subtitle={hasWhatsApp ? `Conectado via ${zapiConfig?.is_active ? 'Z-API' : 'WhatsApp Oficial'}` : 'Não configurado'}
        isActive={!!hasWhatsApp}
      >
        {/* Provider selector */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
            PROVEDOR
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['zapi', 'official'] as ProviderType[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setWpProvider(p)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: wpProvider === p ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                  background: wpProvider === p ? 'var(--brand-soft)' : 'var(--bg-app)',
                  fontWeight: 700, fontSize: 13,
                  color: wpProvider === p ? 'var(--brand)' : 'var(--text-muted)',
                  transition: 'all 120ms',
                }}
              >
                {p === 'zapi' ? 'Z-API' : 'WhatsApp Oficial'}
                <p style={{ fontSize: 10.5, fontWeight: 500, marginTop: 3, color: 'inherit', opacity: 0.75 }}>
                  {p === 'zapi' ? 'Via WhatsApp Web — mais fácil de configurar' : 'Meta Cloud API — requer aprovação da Meta'}
                </p>
              </button>
            ))}
          </div>
        </div>
        {wpProvider === 'zapi'
          ? <ZAPIForm     initial={zapiConfig} />
          : <OfficialForm initial={officialConfig} />
        }
      </SectionCard>

      {/* Placeholder: Instagram DM, Email */}
      {(['Instagram DM', 'E-mail (Resend)'] as const).map(name => (
        <div key={name} className="card" style={{ padding: '14px 20px', opacity: 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'var(--bg-app)', border: '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Phone size={18} color="var(--text-faint)" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, marginTop: 1 }}>Em breve</p>
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'var(--bg-app)', color: 'var(--text-faint)', border: '1px solid var(--border)',
            }}>
              Em breve
            </span>
          </div>
        </div>
      ))}

      {/* ── Seção: Marketing ──────────────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
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
        <MetaAdsConnect initial={metaAdsConfig} metaStep={metaStep} metaError={metaError} />
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
