'use client'

import React, { useActionState, useState } from 'react'
import { saveRolePermissions } from '@/actions/permissions'
import {
  MODULE_LABELS, ALL_MODULES,
  type AppModule, type ResolvedPermissions, type MatrixRole,
} from '@/lib/permissions'
import { CheckCircle2 } from 'lucide-react'

// ─── Toggle individual ───────────────────────────────────────────
function Toggle({
  name, checked, onChange, disabled,
}: {
  name: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.3 : 1,
    }}>
      <input
        type="checkbox" name={name}
        checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 7,
        background: checked ? 'var(--brand-soft)' : 'var(--bg-app)',
        border: `1.5px solid ${checked ? 'var(--brand-soft-border)' : 'var(--border)'}`,
        transition: 'background 100ms, border 100ms',
      }}>
        {checked && (
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  )
}

// ─── Par Ver + Editar por célula ─────────────────────────────────
function CellPair({
  roleKey, module, defaultView, defaultWrite,
}: {
  roleKey: string; module: AppModule; defaultView: boolean; defaultWrite: boolean
}) {
  const [write, setWrite] = useState(defaultWrite)
  const [view,  setView]  = useState(defaultView || defaultWrite)

  return (
    <>
      <td style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid var(--hairline)' }}>
        <Toggle
          name={`${roleKey}:${module}:view`}
          checked={view}
          onChange={v => { setView(v); if (!v) setWrite(false) }}
        />
      </td>
      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
        <Toggle
          name={`${roleKey}:${module}:write`}
          checked={write}
          onChange={v => { setWrite(v); if (v) setView(true) }}
          disabled={!view}
        />
      </td>
    </>
  )
}

// ─── Matriz principal ────────────────────────────────────────────
interface PermissionsMatrixProps {
  matrix: MatrixRole[]
}

export function PermissionsMatrix({ matrix }: PermissionsMatrixProps) {
  const [state, action, pending] = useActionState(saveRolePermissions, undefined)

  // lista de keys para o campo oculto
  const roleKeys = matrix.map(r => r.key)

  return (
    <form action={action}>
      {/* Campo oculto com os role keys dinâmicos */}
      <input type="hidden" name="_roles" value={JSON.stringify(roleKeys)} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            {/* Linha 1: nomes dos cargos (colspan 2) */}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th
                rowSpan={2}
                style={{
                  padding: '10px 16px', textAlign: 'left', verticalAlign: 'bottom',
                  fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)',
                  letterSpacing: 'var(--tracking-overline)', textTransform: 'uppercase',
                  color: 'var(--text-muted)', width: 150,
                  borderRight: '1px solid var(--border)',
                }}
              >
                Módulo
              </th>
              {matrix.map((role, i) => (
                <th
                  key={role.key}
                  colSpan={2}
                  style={{
                    padding: '8px 8px', textAlign: 'center',
                    fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)',
                    letterSpacing: 'var(--tracking-overline)', textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    borderLeft: i > 0 ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {role.label}
                </th>
              ))}
            </tr>

            {/* Linha 2: Ver / Editar por cargo */}
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {matrix.map((role, i) => (
                <React.Fragment key={role.key}>
                  <th
                    style={{
                      padding: '5px 8px', textAlign: 'center',
                      fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--text-faint)',
                      borderLeft: i > 0 ? '1px solid var(--border)' : undefined,
                      borderRight: '1px solid var(--hairline)',
                    }}
                  >
                    Ver
                  </th>
                  <th
                    style={{
                      padding: '5px 8px', textAlign: 'center',
                      fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--text-faint)',
                    }}
                  >
                    Editar
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {ALL_MODULES.map((module, mi) => (
              <tr
                key={module}
                style={{
                  borderBottom: mi < ALL_MODULES.length - 1 ? '1px solid var(--hairline)' : undefined,
                  background: mi % 2 === 0 ? 'transparent' : 'var(--bg-app)',
                }}
              >
                <td style={{
                  padding: '11px 16px',
                  fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
                  color: 'var(--text)', borderRight: '1px solid var(--border)',
                }}>
                  {MODULE_LABELS[module]}
                </td>

                {matrix.map(role => (
                  <CellPair
                    key={role.key}
                    roleKey={role.key}
                    module={module}
                    defaultView={role.permissions[module].view}
                    defaultWrite={role.permissions[module].write}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingLeft: 4 }}>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          <strong>Ver</strong> — exibe o módulo no menu lateral
        </span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          <strong>Editar</strong> — permite criar e modificar registros
        </span>
      </div>

      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', marginTop: 14,
        }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--success)', marginTop: 14,
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          <CheckCircle2 size={14} /> Permissões salvas com sucesso.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Salvando…' : 'Salvar permissões'}
        </button>
      </div>
    </form>
  )
}
