'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createTeamMember } from '@/actions/team'

interface Branch { id: string; name: string }
interface Role   { id: string; label: string }

interface AdminTeamFormProps {
  branches:       Branch[]
  roles:          Role[]
  isNetworkAdmin: boolean
}

export function AdminTeamForm({ branches, roles, isNetworkAdmin }: AdminTeamFormProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'branch' | 'network'>('branch')
  const [state, action, pending] = useActionState(createTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null

  if (state && 'success' in state && state.success && open) setOpen(false)

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Adicionar membro
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(34,22,25,0.25)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  Novo membro da equipe
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  A senha temporária deve ser trocada no primeiro acesso.
                </p>
              </div>
              <button className="btn-ghost" onClick={() => setOpen(false)} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input type="hidden" name="redirectPath" value="/admin/team" />
              <input type="hidden" name="scope" value={scope} />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-name">Nome completo</label>
                  <input id="tm-name" name="name" type="text" required className="field" placeholder="Ex: Ana Souza" />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-email">E-mail</label>
                  <input id="tm-email" name="email" type="email" required className="field" placeholder="ana@bellaris.com" />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-role">Cargo</label>
                  <select id="tm-role" name="roleId" required className="field" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                  {roles.length === 0 && (
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                      Crie um cargo em Configurações → Cargos antes de adicionar membros.
                    </span>
                  )}
                </div>

                {/* Abrangência */}
                {isNetworkAdmin && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline">Abrangência</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <ScopeChip active={scope === 'branch'} onClick={() => setScope('branch')} label="Uma filial" />
                      <ScopeChip active={scope === 'network'} onClick={() => setScope('network')} label="Rede inteira" />
                    </div>
                  </div>
                )}

                {scope === 'branch' && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor="tm-branch">Filial</label>
                    <select id="tm-branch" name="branchId" required className="field" defaultValue="">
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

                {/* Atende clientes */}
                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" name="providesServices" style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                  <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                    Atende clientes (aparece na agenda como profissional e gera comissão)
                  </span>
                </label>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-password">Senha temporária</label>
                  <input id="tm-password" name="password" type="password" required minLength={8} className="field" placeholder="Mín. 8 caracteres" />
                </div>
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
                  {pending ? 'Criando…' : 'Criar membro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function ScopeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 12px', cursor: 'pointer',
        borderRadius: 'var(--radius-field-token)',
        border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-muted)',
        fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
        transition: 'background 120ms, border 120ms',
      }}
    >
      {label}
    </button>
  )
}
