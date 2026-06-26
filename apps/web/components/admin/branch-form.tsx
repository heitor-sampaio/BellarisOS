'use client'

import { useActionState, useState, useEffect } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
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

export function BranchForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [formState, action, pending] = useActionState(createBranch, undefined)

  // Endereço — controlado para permitir preenchimento via CEP
  const [zipCode,    setZipCode]    = useState('')
  const [address,    setAddress]    = useState('')
  const [city,       setCity]       = useState('')
  const [uf,         setUf]         = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError,   setCepError]   = useState<string | null>(null)

  useEffect(() => {
    if (!slugTouched) setSlug(toSlug(name))
  }, [name, slugTouched])

  if (formState?.success && open) {
    setOpen(false)
    setName(''); setSlug(''); setSlugTouched(false)
    setZipCode(''); setAddress(''); setCity(''); setUf('')
    setCepError(null)
  }

  function handleClose() {
    setOpen(false)
    setName(''); setSlug(''); setSlugTouched(false)
    setZipCode(''); setAddress(''); setCity(''); setUf('')
    setCepError(null)
  }

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
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Nova unidade
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(34,22,25,0.25)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, overflowY: 'auto',
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, position: 'relative', margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  Nova unidade
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  O slug define a URL de acesso da equipe da unidade.
                </p>
              </div>
              <button className="btn-ghost" onClick={handleClose} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ── Identificação ── */}
              <section>
                <p className="overline" style={{ marginBottom: 10 }}>Identificação</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor="br-name">Nome da unidade *</label>
                    <input
                      id="br-name" name="name" type="text" required className="field"
                      placeholder="Ex: Lumière Pinheiros"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor="br-slug">
                      Slug (URL)
                      <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: 4, textTransform: 'none' }}>
                        — lumiere.com/<strong>{slug || 'nome-da-unidade'}</strong>
                      </span>
                    </label>
                    <input
                      id="br-slug" name="slug" type="text" className="field"
                      placeholder="nome-da-unidade"
                      value={slug}
                      onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
                    />
                  </div>

                  <div className="form-2col">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label className="overline" htmlFor="br-phone">Telefone</label>
                      <input id="br-phone" name="phone" type="text" className="field" placeholder="(11) 99999-9999" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label className="overline" htmlFor="br-email">E-mail</label>
                      <input id="br-email" name="email" type="email" className="field" placeholder="contato@lumiere.com" />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Documentos fiscais ── */}
              <section>
                <p className="overline" style={{ marginBottom: 10 }}>Documentos fiscais</p>
                <div className="form-2col">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor="br-doc">CNPJ</label>
                    <input id="br-doc" name="document" type="text" className="field" placeholder="00.000.000/0001-00" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor="br-ie">Inscrição Estadual</label>
                    <input id="br-ie" name="state_registration" type="text" className="field" placeholder="000.000.000.000" />
                  </div>
                </div>
              </section>

              {/* ── Endereço ── */}
              <section>
                <p className="overline" style={{ marginBottom: 10 }}>Endereço</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Inputs hidden — garantem que o FormData carrega os valores do estado React */}
                  <input type="hidden" name="zip_code" value={zipCode} />
                  <input type="hidden" name="address"  value={address} />
                  <input type="hidden" name="city"     value={city} />
                  <input type="hidden" name="state"    value={uf} />

                  {/* CEP — busca primeiro */}
                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label className="overline" htmlFor="br-zip">
                        CEP
                        {cepLoading && (
                          <Loader2 size={11} style={{ marginLeft: 6, display: 'inline', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
                        )}
                      </label>
                      <input
                        id="br-zip" type="text" className="field"
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
                      id="br-address" type="text" className="field"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="Rua das Flores, 123 — Bairro"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label className="overline" htmlFor="br-city">Cidade</label>
                      <input
                        id="br-city" type="text" className="field"
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="São Paulo"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label className="overline" htmlFor="br-state">UF</label>
                      <select
                        id="br-state" className="field"
                        value={uf}
                        onChange={e => setUf(e.target.value)}
                      >
                        <option value="">—</option>
                        {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {formState?.error && (
                <p style={{
                  color: 'var(--warning)', background: 'var(--warning-soft)',
                  borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  {formState.error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={handleClose}>
                  Cancelar
                </button>
                <button type="submit" disabled={pending} className="btn-primary">
                  {pending ? 'Criando…' : 'Criar unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
