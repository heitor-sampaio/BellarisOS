'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createTeamMember } from '@/actions/team'

const ROLE_OPTIONS = [
  { value: 'BRANCH_ADMIN',  label: 'Gerente de filial' },
  { value: 'RECEPTIONIST',  label: 'Recepcionista' },
  { value: 'PROFESSIONAL',  label: 'Profissional' },
  { value: 'FINANCIAL',     label: 'Financeiro' },
] as const

interface Branch { id: string; name: string }

interface AdminTeamFormProps {
  branches: Branch[]
}

export function AdminTeamForm({ branches }: AdminTeamFormProps) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createTeamMember, undefined)

  if (state?.success && open) setOpen(false)

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
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, position: 'relative' }}>
            {/* Header */}
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
              {/* redirectPath para a action saber onde revalidar */}
              <input type="hidden" name="redirectPath" value="/admin/team" />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-name">Nome completo</label>
                  <input id="tm-name" name="name" type="text" required className="field" placeholder="Ex: Ana Souza" />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-email">E-mail</label>
                  <input id="tm-email" name="email" type="email" required className="field" placeholder="ana@bellaris.com" />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-branch">Filial</label>
                  <select id="tm-branch" name="branchId" required className="field" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-role">Cargo</label>
                  <select id="tm-role" name="role" required className="field" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-password">Senha temporária</label>
                  <input id="tm-password" name="password" type="password" required minLength={8} className="field" placeholder="Mín. 8 caracteres" />
                </div>
              </div>

              {state?.error && (
                <p style={{
                  color: 'var(--warning)', background: 'var(--warning-soft)',
                  borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  {state.error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
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
