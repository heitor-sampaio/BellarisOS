'use client'

import { useActionState, useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { updateTeamMember } from '@/actions/team'
import { SegSelect } from '@/components/shared/seg-select'

interface Branch { id: string; name: string }
interface Role   { id: string; label: string }

export interface EditableMember {
  id:               string
  name:             string
  email:            string
  roleId:           string | null
  branchId:         string | null
  providesServices: boolean
}

interface Props {
  member:         EditableMember
  branches:       Branch[]
  roles:          Role[]
  /** Só quem tem abrangência de rede escolhe entre filial e rede. */
  canChooseScope: boolean
  redirectPath:   string
}

/**
 * Edição de membro já cadastrado: cargo, abrangência e a flag de profissional.
 *
 * A action `updateTeamMember` existia desde a migração de cargos dinâmicos e
 * nunca teve tela — sem isso não havia como trocar o cargo de ninguém, o que
 * deixava o modelo de permissões inoperante na prática.
 */
export function TeamMemberEdit({ member, branches, roles, canChooseScope, redirectPath }: Props) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'branch' | 'network'>(member.branchId ? 'branch' : 'network')
  const [state, action, pending] = useActionState(updateTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (state && 'success' in state && state.success) setOpen(false)
  }, [state])

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
        style={{ padding: '5px 8px', color: 'var(--brand)' }}
        title={`Editar ${member.name}`}
      >
        <Pencil size={15} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(34,22,25,0.25)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, position: 'relative', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  {member.name}
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {member.email}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="redirectPath" value={redirectPath} />
              <input type="hidden" name="scope" value={scope} />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor={`tme-role-${member.id}`}>Cargo</label>
                  <select
                    id={`tme-role-${member.id}`} name="roleId" required className="field"
                    defaultValue={member.roleId ?? ''}
                  >
                    <option value="" disabled>Selecione…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    A troca de cargo vale no próximo carregamento — não é preciso sair e entrar.
                  </span>
                </div>

                {canChooseScope && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline">Abrangência</label>
                    <SegSelect
                      options={[
                        { key: 'branch',  label: 'Uma filial' },
                        { key: 'network', label: 'Rede inteira' },
                      ]}
                      value={scope}
                      onSelect={k => setScope(k as 'branch' | 'network')}
                      ariaLabel="Abrangência do membro"
                    />
                  </div>
                )}

                {scope === 'branch' && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor={`tme-branch-${member.id}`}>Filial</label>
                    <select
                      id={`tme-branch-${member.id}`} name="branchId" required className="field"
                      defaultValue={member.branchId ?? ''}
                    >
                      <option value="" disabled>Selecione…</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {scope === 'network' && (
                  <span style={{ gridColumn: '1 / -1', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Acesso a todas as unidades, sem filial fixa.
                  </span>
                )}

                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox" name="providesServices"
                    defaultChecked={member.providesServices}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                    Atende clientes (aparece na agenda como profissional e gera comissão)
                  </span>
                </label>
              </div>

              {stateError && (
                <p style={{
                  color: 'var(--warning)', background: 'var(--warning-soft)',
                  borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  {stateError}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" disabled={pending} className="btn-primary">
                  {pending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
