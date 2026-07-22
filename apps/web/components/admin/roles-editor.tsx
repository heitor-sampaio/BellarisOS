'use client'

import React, { useActionState, useEffect, useState, useTransition } from 'react'
import { Plus, Lock, Trash2, Pencil, Check, X, CheckCircle2 } from 'lucide-react'
import { createRole, updateRole, deleteRole } from '@/actions/roles'
import { saveRolePermissions } from '@/actions/permissions'
import { ALL_MODULES, MODULE_LABELS, MODULE_HINTS, LEVEL_LABELS } from '@/lib/permissions'
import type { AppModule, PermissionLevel } from '@estetica-os/types'

export interface EditorRole {
  id:        string
  key:       string
  label:     string
  is_system: boolean
}

interface RolesEditorProps {
  roles:       EditorRole[]
  permsByRole: Record<string, Partial<Record<AppModule, PermissionLevel>>>
}

const LEVELS: PermissionLevel[] = ['NONE', 'VIEW', 'MANAGE']

export function RolesEditor({ roles, permsByRole }: RolesEditorProps) {
  const editable = roles.filter(r => !r.is_system)
  const [selectedId, setSelectedId] = useState<string | null>(editable[0]?.id ?? null)
  const selected = roles.find(r => r.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RoleList
        roles={roles}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {selected && !selected.is_system && (
        <PermissionMatrix
          key={selected.id}
          role={selected}
          perms={permsByRole[selected.id] ?? {}}
        />
      )}

      {selected?.is_system && (
        <div className="card" style={{ background: 'var(--bg-app)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            <strong style={{ color: 'var(--text)' }}>{selected.label}</strong> é um cargo do sistema com acesso total à rede. Suas permissões não podem ser editadas.
          </p>
        </div>
      )}

      {editable.length === 0 && (
        <div className="card" style={{ background: 'var(--bg-app)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhum cargo criado ainda. Use <strong>Novo cargo</strong> acima para começar e defina os acessos por módulo.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Lista de cargos (criar / selecionar / renomear / excluir) ────────────────
function RoleList({
  roles, selectedId, onSelect,
}: {
  roles: EditorRole[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createState, createAction, creating] = useActionState(createRole, undefined)

  // Só reage quando o resultado da action muda (não a cada render) — senão o
  // reabrir o form seria imediatamente fechado enquanto createState.success persiste.
  useEffect(() => {
    if (createState && 'success' in createState && createState.success) {
      setShowForm(false)
      if (createState.role) onSelect(createState.role.id)
    }
  }, [createState, onSelect])

  function handleDelete(role: EditorRole) {
    if (!confirm(`Excluir o cargo "${role.label}"?`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteRole(role.id)
      if (res && 'error' in res) setError(res.error)
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {roles.map(role => {
          const isSelected = role.id === selectedId
          if (renaming === role.id) {
            return <RenameChip key={role.id} role={role} onDone={() => setRenaming(null)} />
          }
          return (
            <div
              key={role.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 8px 5px 12px',
                background: isSelected ? 'var(--brand)' : role.is_system ? 'var(--bg-app)' : 'var(--surface)',
                border: `1.5px solid ${isSelected ? 'var(--brand)' : role.is_system ? 'var(--border)' : 'var(--brand-soft-border)'}`,
                borderRadius: 'var(--radius-chip-token)',
                fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                color: isSelected ? '#fff' : role.is_system ? 'var(--text-muted)' : 'var(--brand)',
                cursor: role.is_system ? 'default' : 'pointer',
                transition: 'background 120ms, border 120ms',
              }}
              onClick={() => !role.is_system && onSelect(role.id)}
            >
              {role.label}
              {role.is_system ? (
                <Lock size={11} style={{ opacity: 0.5 }} />
              ) : (
                <span style={{ display: 'inline-flex', gap: 2, marginLeft: 2 }}>
                  <button
                    onClick={e => { e.stopPropagation(); setRenaming(role.id) }}
                    title="Renomear"
                    style={iconBtn(isSelected)}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(role) }}
                    disabled={pending}
                    title="Excluir"
                    style={iconBtn(isSelected)}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )}
            </div>
          )
        })}

        {!showForm && (
          <button
            className="btn-secondary"
            onClick={() => setShowForm(true)}
            style={{ padding: '5px 12px', fontSize: 'var(--text-xs-sz)', gap: 5 }}
          >
            <Plus size={13} /> Novo cargo
          </button>
        )}
      </div>

      {showForm && (
        <form
          action={createAction}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
            padding: '12px 14px', background: 'var(--bg-app)',
            border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-card-sm)',
          }}
        >
          <div style={{ flex: 1 }}>
            <input
              name="label" type="text" required autoFocus
              className="field" placeholder="Nome do novo cargo (ex.: Atendente sênior)"
              style={{ background: 'var(--surface)' }}
            />
            {createState && 'error' in createState && createState.error && (
              <p style={{ color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', marginTop: 5 }}>
                {createState.error}
              </p>
            )}
          </div>
          <button type="submit" disabled={creating} className="btn-primary" style={{ flexShrink: 0 }}>
            {creating ? 'Criando…' : 'Criar'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} style={{ flexShrink: 0 }}>
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <p style={{ color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  )
}

function RenameChip({ role, onDone }: { role: EditorRole; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateRole, undefined)
  useEffect(() => {
    if (state && 'success' in state && state.success) onDone()
  }, [state, onDone])
  return (
    <form
      action={action}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 4px 3px 8px', background: 'var(--surface)',
        border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-chip-token)',
      }}
    >
      <input type="hidden" name="roleId" value={role.id} />
      <input
        name="label" defaultValue={role.label} autoFocus required
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
          width: Math.max(80, role.label.length * 8),
        }}
      />
      <button type="submit" disabled={pending} title="Salvar" style={iconBtn(false)}><Check size={12} /></button>
      <button type="button" onClick={onDone} title="Cancelar" style={iconBtn(false)}><X size={12} /></button>
    </form>
  )
}

// ─── Matriz de um cargo (módulo × nível) ──────────────────────────────────────
function PermissionMatrix({
  role, perms,
}: {
  role: EditorRole
  perms: Partial<Record<AppModule, PermissionLevel>>
}) {
  const [state, action, pending] = useActionState(saveRolePermissions, undefined)
  const [levels, setLevels] = useState<Record<AppModule, PermissionLevel>>(
    () => Object.fromEntries(ALL_MODULES.map(m => [m, perms[m] ?? 'NONE'])) as Record<AppModule, PermissionLevel>,
  )

  return (
    <form action={action} className="card">
      <input type="hidden" name="roleId" value={role.id} />
      {ALL_MODULES.map(m => (
        <input key={m} type="hidden" name={`level:${m}`} value={levels[m]} />
      ))}

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Acessos de <span style={{ color: 'var(--brand)' }}>{role.label}</span>
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Defina o nível de cada módulo. <strong>Sem acesso</strong> esconde o módulo do menu.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ALL_MODULES.map((module, i) => (
          <div
            key={module}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              padding: '10px 4px',
              borderBottom: i < ALL_MODULES.length - 1 ? '1px solid var(--hairline)' : undefined,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                {MODULE_LABELS[module]}
              </div>
              {MODULE_HINTS[module] && (
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                  {MODULE_HINTS[module]}
                </div>
              )}
            </div>
            <SegmentedLevel
              value={levels[module]}
              onChange={v => setLevels(prev => ({ ...prev, [module]: v }))}
            />
          </div>
        ))}
      </div>

      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', marginTop: 16,
        }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', marginTop: 16, fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> Acessos salvos.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Salvando…' : 'Salvar acessos'}
        </button>
      </div>
    </form>
  )
}

function SegmentedLevel({ value, onChange }: { value: PermissionLevel; onChange: (v: PermissionLevel) => void }) {
  return (
    <div style={{
      display: 'inline-flex', flexShrink: 0, padding: 2, gap: 2,
      background: 'var(--bg-app)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-field-token)',
    }}>
      {LEVELS.map(lvl => {
        const active = value === lvl
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onChange(lvl)}
            style={{
              padding: '5px 12px', border: 'none', cursor: 'pointer',
              borderRadius: 'calc(var(--radius-field-token) - 2px)',
              fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
              background: active ? 'var(--brand)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              transition: 'background 120ms, color 120ms',
              whiteSpace: 'nowrap',
            }}
          >
            {LEVEL_LABELS[lvl]}
          </button>
        )
      })}
    </div>
  )
}

function iconBtn(onBrand: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0,
    borderRadius: 4, color: onBrand ? 'rgba(255,255,255,0.85)' : 'var(--brand)',
  }
}
