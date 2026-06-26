'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { updateTenantProfile, completeOnboarding } from '@/actions/setup'
import { createBranch } from '@/actions/branches'
import { fetchCep } from '@/lib/cep'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
]

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// ── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = ['Sua rede', 'Primeira unidade', 'Pronto!']

function Stepper({ current }: { current: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      marginBottom: 32,
    }}>
      {STEPS.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Bullet */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: done ? 'var(--success)' : active ? 'var(--brand)' : 'transparent',
                border: done || active ? 'none' : '2px solid var(--border)',
                color: done || active ? '#fff' : 'var(--text-faint)',
                fontSize: 'var(--text-xs-sz)',
                fontWeight: 'var(--weight-bold)',
                transition: 'all 200ms',
                flexShrink: 0,
              }}>
                {done ? <Check size={15} strokeWidth={2.5} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: active ? 'var(--weight-bold)' : 'var(--weight-medium)',
                color: active ? 'var(--text)' : done ? 'var(--success)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div style={{
                width: 56,
                height: 2,
                background: i < current ? 'var(--success)' : 'var(--border)',
                marginBottom: 22,
                transition: 'background 200ms',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1 — Dados da rede ────────────────────────────────────────────────────

function StepNetwork({
  initialName,
  onNext,
}: {
  initialName: string
  onNext: (savedName: string) => void
}) {
  const [name,     setName]     = useState(initialName)
  const [document, setDocument] = useState('')
  const [phone,    setPhone]    = useState('')
  const [website,  setWebsite]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateTenantProfile({ name, document, phone, website })
      if (result && 'error' in result) {
        setError(result.error)
      } else {
        onNext(name)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          Dados da sua rede
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Essas informações identificam sua rede no sistema.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="net-name">Nome da rede *</label>
        <input
          id="net-name"
          type="text"
          className="field"
          required
          placeholder="Ex: Lumière Estética"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="net-doc">CNPJ</label>
        <input
          id="net-doc"
          type="text"
          className="field"
          placeholder="00.000.000/0001-00"
          value={document}
          onChange={e => setDocument(e.target.value)}
        />
      </div>

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="net-phone">Telefone</label>
          <input
            id="net-phone"
            type="text"
            className="field"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="net-site">Site</label>
          <input
            id="net-site"
            type="url"
            className="field"
            placeholder="https://lumiere.com"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : 'Continuar →'}
        </button>
      </div>
    </form>
  )
}

// ── Step 2 — Primeira unidade ─────────────────────────────────────────────────

function StepBranch({ onNext }: { onNext: () => void }) {
  const [name,       setName]       = useState('')
  const [slug,       setSlug]       = useState('')
  const [slugTouched,setSlugTouched]= useState(false)
  const [phone,      setPhone]      = useState('')
  const [email,      setEmail]      = useState('')
  const [zipCode,    setZipCode]    = useState('')
  const [address,    setAddress]    = useState('')
  const [city,       setCity]       = useState('')
  const [uf,         setUf]         = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError,   setCepError]   = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [pending,    startTransition] = useTransition()

  useEffect(() => {
    if (!slugTouched) setSlug(toSlug(name))
  }, [name, slugTouched])

  async function handleCepBlur() {
    const digits = zipCode.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    setCepError(null)
    const result = await fetchCep(zipCode)
    setCepLoading(false)
    if (!result) { setCepError('CEP não encontrado.'); return }
    if (result.address) setAddress(result.address)
    setCity(result.city)
    setUf(result.uf)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('name',     name)
    formData.set('slug',     slug)
    formData.set('phone',    phone)
    formData.set('email',    email)
    formData.set('zip_code', zipCode)
    formData.set('address',  address)
    formData.set('city',     city)
    formData.set('state',    uf)

    startTransition(async () => {
      const result = await createBranch(undefined, formData)
      if (result && 'error' in result) {
        setError(result.error)
      } else {
        onNext()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          Primeira unidade
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Cadastre a primeira filial da sua rede. Você poderá adicionar mais depois.
        </p>
      </div>

      {/* Identificação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-name">Nome da unidade *</label>
        <input
          id="br-name"
          type="text"
          className="field"
          required
          placeholder="Ex: Lumière Pinheiros"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-slug">
          Slug (URL)
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: 4, textTransform: 'none' }}>
            — /{slug || 'nome-da-unidade'}
          </span>
        </label>
        <input
          id="br-slug"
          type="text"
          className="field"
          placeholder="nome-da-unidade"
          value={slug}
          onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
        />
      </div>

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-phone">Telefone</label>
          <input
            id="br-phone"
            type="text"
            className="field"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-email">E-mail</label>
          <input
            id="br-email"
            type="email"
            className="field"
            placeholder="contato@clinica.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
      </div>

      {/* Endereço */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-zip">
            CEP
            {cepLoading && (
              <Loader2 size={11} style={{ marginLeft: 6, display: 'inline', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
            )}
          </label>
          <input
            id="br-zip"
            type="text"
            className="field"
            value={zipCode}
            onChange={e => { setZipCode(e.target.value); setCepError(null) }}
            onBlur={handleCepBlur}
            placeholder="01310-000"
            maxLength={9}
          />
        </div>
        {cepError && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginBottom: 2 }}>
            {cepError}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline" htmlFor="br-address">Logradouro</label>
        <input
          id="br-address"
          type="text"
          className="field"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="Rua das Flores, 123 — Bairro"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-city">Cidade</label>
          <input
            id="br-city"
            type="text"
            className="field"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="São Paulo"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="br-state">UF</label>
          <select
            id="br-state"
            className="field"
            value={uf}
            onChange={e => setUf(e.target.value)}
          >
            <option value="">—</option>
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : 'Continuar →'}
        </button>
      </div>
    </form>
  )
}

// ── Step 3 — Concluído ────────────────────────────────────────────────────────

function StepDone({ tenantName }: { tenantName: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding()
      router.push('/admin/dashboard')
    })
  }

  return (
    <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
      {/* Check animado */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'var(--success-soft, #d1fae5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
        animation: 'popIn 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}>
        <Check size={32} style={{ color: 'var(--success)' }} strokeWidth={2.5} />
      </div>

      <h2 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        color: 'var(--text)',
        marginBottom: 8,
      }}>
        Tudo pronto!
      </h2>

      <p style={{
        fontSize: 'var(--text-sm-sz)',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        maxWidth: 340,
        margin: '0 auto 32px',
      }}>
        A rede <strong style={{ color: 'var(--text)' }}>{tenantName}</strong> está configurada. Você já pode começar a usar o painel completo.
      </p>

      <button
        onClick={handleFinish}
        disabled={pending}
        className="btn-primary"
        style={{ justifyContent: 'center', padding: '12px 28px', fontSize: 'var(--text-base-sz)' }}
      >
        {pending ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Abrindo painel…</> : 'Acessar o painel →'}
      </button>

      <style>{`
        @keyframes popIn {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Wizard root ───────────────────────────────────────────────────────────────

export function SetupWizard({ tenantName }: { tenantName: string }) {
  const [step, setStep] = useState(0)
  const [networkName, setNetworkName] = useState(tenantName)

  return (
    <div className="card" style={{ padding: '32px 28px' }}>
      <Stepper current={step} />

      {step === 0 && (
        <StepNetwork
          initialName={networkName}
          onNext={(savedName) => { setNetworkName(savedName); setStep(1) }}
        />
      )}
      {step === 1 && (
        <StepBranch onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <StepDone tenantName={networkName} />
      )}
    </div>
  )
}
