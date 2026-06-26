'use client'

import { useActionState, useState } from 'react'
import { createRole, deleteRole } from '@/actions/roles'
import { Plus, Lock, X, CheckCircle2 } from 'lucide-react'

interface Role {
  id:        string
  key:       string
  label:     string
  is_system: boolean
}

interface RoleManagerProps {
  roles: Role[]
}

export function RoleManager({ roles }: RoleManagerProps) {
  const [showForm, setShowForm]   = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [state, action, pending]  = useActionState(createRole, undefined)

  if (state?.success && showForm) setShowForm(false)

  async function handleDelete(role: Role) {
    if (!confirm(`Excluir o cargo "${role.label}"? Usuários com esse cargo perderão todos os acessos.`)) return
    setDeleting(role.id)
    await deleteRole(role.id)
    setDeleting(null)
  }

  return (
    <div>
      {/* Lista de cargos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {roles.map(role => (
          <div
            key={role.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 5px 12px',
              background: role.is_system ? 'var(--bg-app)' : 'var(--brand-soft)',
              border: `1.5px solid ${role.is_system ? 'var(--border)' : 'var(--brand-soft-border)'}`,
              borderRadius: 'var(--radius-chip-token)',
              fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
              color: role.is_system ? 'var(--text-muted)' : 'var(--brand)',
              opacity: deleting === role.id ? 0.4 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {role.label}
            {role.is_system ? (
              <Lock size={11} style={{ opacity: 0.5 }} />
            ) : (
              <button
                onClick={() => handleDelete(role)}
                disabled={deleting === role.id}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--brand)', padding: 1, lineHeight: 0,
                  borderRadius: 4,
                }}
                title={`Excluir cargo "${role.label}"`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        {/* Botão adicionar */}
        {!showForm && (
          <button
            className="btn-secondary"
            onClick={() => setShowForm(true)}
            style={{ padding: '5px 12px', fontSize: 'var(--text-xs-sz)', gap: 5 }}
          >
            <Plus size={13} />
            Novo cargo
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {showForm && (
        <form
          action={action}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px',
            background: 'var(--bg-app)',
            border: '1.5px solid var(--brand-soft-border)',
            borderRadius: 'var(--radius-card-sm)',
          }}
        >
          <div style={{ flex: 1 }}>
            <input
              name="label"
              type="text"
              required
              autoFocus
              className="field"
              placeholder="Nome do novo cargo"
              style={{ background: 'var(--surface)' }}
            />
            {state?.error && (
              <p style={{
                color: 'var(--warning)', fontSize: 'var(--text-xs-sz)',
                fontWeight: 'var(--weight-semibold)', marginTop: 5,
              }}>
                {state.error}
              </p>
            )}
          </div>
          <button type="submit" disabled={pending} className="btn-primary" style={{ flexShrink: 0 }}>
            {pending ? 'Criando…' : 'Criar'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowForm(false)}
            style={{ flexShrink: 0 }}
          >
            Cancelar
          </button>
        </form>
      )}

      {state?.success && !showForm && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--success)', fontSize: 'var(--text-xs-sz)',
          fontWeight: 'var(--weight-semibold)', marginTop: 4,
        }}>
          <CheckCircle2 size={13} /> Cargo criado com sucesso.
        </div>
      )}
    </div>
  )
}
