'use client'

import { useActionState, useState } from 'react'
import { updateClientSelf } from '@/actions/clients'
import { Pencil, X, Check } from 'lucide-react'

type Client = {
  phone:              string | null
  email:              string | null
  zip_code:           string | null
  address:            string | null
  address_number:     string | null
  address_complement: string | null
  neighborhood:       string | null
  city:               string | null
  state:              string | null
}

interface Props {
  client: Client
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize:      10.5,
      fontWeight:    700,
      color:         'var(--text-muted)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      display:       'block',
      marginBottom:  4,
    }}>
      {children}
    </label>
  )
}

export function EditProfileForm({ client }: Props) {
  const [editing, setEditing] = useState(false)
  const [state, action, pending] = useActionState(updateClientSelf, undefined)

  const fmtPhone = (p: string | null) => {
    if (!p) return '—'
    const d = p.replace(/\D/g, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return p
  }

  // After success, close edit mode
  if (state?.success && editing) {
    setEditing(false)
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{
          fontSize:      11,
          fontWeight:    700,
          color:         'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Contato e endereço
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         5,
              padding:     '6px 12px',
              borderRadius: 8,
              border:      '1px solid var(--border)',
              background:  'var(--surface)',
              color:       'var(--text-muted)',
              fontSize:    12,
              fontWeight:  600,
              cursor:      'pointer',
            }}
          >
            <Pencil size={12} />
            Editar
          </button>
        )}
      </div>

      {/* -- Read mode --------------------------------------------- */}
      {!editing && (
        <div className="card" style={{ padding: '4px 22px' }}>
          <Row label="Telefone"     value={fmtPhone(client.phone)} />
          <Row label="E-mail"       value={client.email ?? '—'} />
          {(client.address || client.city) && (
            <Row
              label="Endereço"
              value={[
                client.address,
                client.address_number,
                client.address_complement,
                client.neighborhood,
                client.city,
                client.state,
              ].filter(Boolean).join(', ')}
            />
          )}
          {client.zip_code && (
            <Row label="CEP" value={client.zip_code.replace(/(\d{5})(\d{3})/, '$1-$2')} />
          )}
        </div>
      )}

      {/* -- Edit mode --------------------------------------------- */}
      {editing && (
        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-2col">
            <div>
              <Label>Telefone</Label>
              <input
                name="phone"
                type="tel"
                className="field"
                defaultValue={client.phone ?? ''}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <input
                name="email"
                type="email"
                className="field"
                defaultValue={client.email ?? ''}
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div>
            <Label>CEP</Label>
            <input
              name="zip_code"
              type="text"
              className="field"
              defaultValue={client.zip_code ?? ''}
              placeholder="00000-000"
              maxLength={9}
              style={{ maxWidth: 140 }}
            />
          </div>

          <div>
            <Label>Endereço (rua/avenida)</Label>
            <input
              name="address"
              type="text"
              className="field"
              defaultValue={client.address ?? ''}
              placeholder="Rua das Flores"
            />
          </div>

          <div className="form-2col">
            <div>
              <Label>Número</Label>
              <input
                name="address_number"
                type="text"
                className="field"
                defaultValue={client.address_number ?? ''}
                placeholder="123"
              />
            </div>
            <div>
              <Label>Complemento</Label>
              <input
                name="address_complement"
                type="text"
                className="field"
                defaultValue={client.address_complement ?? ''}
                placeholder="Apto 10"
              />
            </div>
          </div>

          <div className="form-2col">
            <div>
              <Label>Bairro</Label>
              <input
                name="neighborhood"
                type="text"
                className="field"
                defaultValue={client.neighborhood ?? ''}
                placeholder="Centro"
              />
            </div>
            <div>
              <Label>Cidade</Label>
              <input
                name="city"
                type="text"
                className="field"
                defaultValue={client.city ?? ''}
                placeholder="São Paulo"
              />
            </div>
          </div>

          <div>
            <Label>Estado (UF)</Label>
            <select name="state" className="field" defaultValue={client.state ?? ''} style={{ maxWidth: 100 }}>
              <option value="">—</option>
              {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>

          {state?.error && (
            <p style={{
              color:        'var(--warning)',
              background:   'var(--warning-soft)',
              borderRadius: 8,
              padding:      '8px 12px',
              fontSize:     12.5,
              fontWeight:   700,
            }}>
              {state.error}
            </p>
          )}

          {state?.success && (
            <p style={{
              color:        '#22c55e',
              background:   '#22c55e18',
              borderRadius: 8,
              padding:      '8px 12px',
              fontSize:     12.5,
              fontWeight:   700,
            }}>
              Dados atualizados com sucesso!
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         5,
                padding:     '9px 16px',
                borderRadius: 10,
                border:      '1px solid var(--border)',
                background:  'var(--surface)',
                color:       'var(--text-muted)',
                fontWeight:  600,
                fontSize:    13,
                cursor:      'pointer',
              }}
            >
              <X size={13} />
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        5,
                padding:    '9px 18px',
                borderRadius: 10,
                border:     'none',
                background: 'var(--brand)',
                color:      '#fff',
                fontWeight: 700,
                fontSize:   13,
                cursor:     'pointer',
                boxShadow:  '0 2px 8px rgba(195,77,107,0.35)',
              }}
            >
              <Check size={13} />
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      padding:       '13px 0',
      borderBottom:  '1px solid var(--hairline)',
    }}>
      <span style={{
        fontSize:      10.5,
        fontWeight:    700,
        color:         'var(--text-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom:  3,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
