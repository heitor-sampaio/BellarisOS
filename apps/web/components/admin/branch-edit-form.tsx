'use client'

import { useActionState, useState } from 'react'
import { updateBranch } from '@/actions/branches'
import { Save, Loader2 } from 'lucide-react'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
]

interface BranchData {
  id:                 string
  name:               string
  document:           string | null
  state_registration: string | null
  email:              string | null
  phone:              string | null
  address:            string | null
  city:               string | null
  state:              string | null
  zip_code:           string | null
}

interface Props {
  branch: BranchData
}

async function fetchCep(rawCep: string): Promise<{ address: string; city: string; uf: string } | null> {
  const digits = rawCep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    const address = [data.logradouro, data.bairro].filter(Boolean).join(' — ')
    return { address, city: data.localidade, uf: data.uf }
  } catch {
    return null
  }
}

export function BranchEditForm({ branch }: Props) {
  const boundAction = updateBranch.bind(null, branch.id)
  const [formState, action, pending] = useActionState(boundAction, undefined)

  const [address, setAddress] = useState(branch.address ?? '')
  const [city,    setCity]    = useState(branch.city    ?? '')
  const [uf,      setUf]      = useState(branch.state   ?? '')
  const [zipCode, setZipCode] = useState(branch.zip_code ?? '')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError,   setCepError]   = useState<string | null>(null)

  async function handleCepBlur() {
    const digits = zipCode.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    setCepError(null)
    const result = await fetchCep(zipCode)
    setCepLoading(false)
    if (!result) {
      setCepError('CEP não encontrado.')
      return
    }
    if (result.address) setAddress(result.address)
    setCity(result.city)
    setUf(result.uf)
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* -- Identificação -- */}
      <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="overline" style={{ marginBottom: 4 }}>Identificação</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline" htmlFor="be-name">Nome da unidade *</label>
          <input
            id="be-name" name="name" type="text" required className="field"
            defaultValue={branch.name}
            placeholder="Ex: BellarisOS Pinheiros"
          />
        </div>

        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-phone">Telefone</label>
            <input id="be-phone" name="phone" type="text" className="field"
              defaultValue={branch.phone ?? ''}
              placeholder="(11) 99999-9999" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-email">E-mail</label>
            <input id="be-email" name="email" type="email" className="field"
              defaultValue={branch.email ?? ''}
              placeholder="contato@bellaris.com" />
          </div>
        </div>
      </section>

      {/* -- Documentos fiscais -- */}
      <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="overline" style={{ marginBottom: 4 }}>Documentos fiscais</p>

        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-doc">CNPJ</label>
            <input id="be-doc" name="document" type="text" className="field"
              defaultValue={branch.document ?? ''}
              placeholder="00.000.000/0001-00" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-ie">Inscrição Estadual</label>
            <input id="be-ie" name="state_registration" type="text" className="field"
              defaultValue={branch.state_registration ?? ''}
              placeholder="000.000.000.000" />
          </div>
        </div>
      </section>

      {/* -- Endereço -- */}
      <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="overline" style={{ marginBottom: 4 }}>Endereço</p>

        {/* Inputs hidden — garantem que o FormData carrega os valores do estado React */}
        <input type="hidden" name="zip_code" value={zipCode} />
        <input type="hidden" name="address"  value={address} />
        <input type="hidden" name="city"     value={city} />
        <input type="hidden" name="state"    value={uf} />

        {/* CEP — busca primeiro */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-zip">
              CEP
              {cepLoading && (
                <Loader2 size={11} style={{ marginLeft: 6, display: 'inline', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
              )}
            </label>
            <input
              id="be-zip" type="text" className="field"
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
          <label className="overline" htmlFor="be-address">Logradouro</label>
          <input id="be-address" type="text" className="field"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Rua das Flores, 123 — Bairro" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-city">Cidade</label>
            <input id="be-city" type="text" className="field"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="São Paulo" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label className="overline" htmlFor="be-state">UF</label>
            <select id="be-state" className="field"
              value={uf}
              onChange={e => setUf(e.target.value)}
            >
              <option value="">—</option>
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Feedback + Submit */}
      {formState && 'error' in formState && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {formState.error}
        </p>
      )}

      {formState && 'success' in formState && formState.success && (
        <p style={{
          color: 'var(--success)', background: 'var(--success-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          Dados salvos com sucesso.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={pending} className="btn-primary" style={{ gap: 7 }}>
          <Save size={14} />
          {pending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}
