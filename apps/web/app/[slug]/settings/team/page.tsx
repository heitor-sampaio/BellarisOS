import { getTenantContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TeamForm } from '@/components/branch/team-form'
import { deactivateTeamMember } from '@/actions/team'
import { UserMinus } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

const ROLE_LABEL: Record<string, string> = {
  NETWORK_ADMIN: 'Admin rede',
  BRANCH_ADMIN:  'Gerente',
  RECEPTIONIST:  'Recepcionista',
  PROFESSIONAL:  'Profissional',
  FINANCIAL:     'Financeiro',
}

const ROLE_CHIP: Record<string, string> = {
  NETWORK_ADMIN: 'chip chip-brand',
  BRANCH_ADMIN:  'chip chip-brand',
  PROFESSIONAL:  'chip chip-success',
  RECEPTIONIST:  'chip chip-muted',
  FINANCIAL:     'chip chip-warning',
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const letters = parts.length >= 2
    ? parts[0]![0]! + parts[parts.length - 1]![0]!
    : parts[0]!.substring(0, 2)
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 'var(--weight-bold)', color: 'var(--brand)',
      flexShrink: 0, textTransform: 'uppercase',
    }}>
      {letters.toUpperCase()}
    </div>
  )
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  const supabase = await createClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  const branchId = branch?.id ?? ctx.branchId!

  const { data: members } = await supabase
    .from('users')
    .select('id, name, email, role, is_active')
    .eq('branch_id', branchId)
    .order('name')

  const canManage = ctx.role === 'NETWORK_ADMIN'

  return (
    <div>
      <RealtimeRefresher tables={['users']} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Equipe
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {members?.length ?? 0} {members?.length === 1 ? 'membro' : 'membros'} cadastrados
          </p>
        </div>
        {canManage && (
          <TeamForm
            branchId={branchId}
            slug={slug}
            isNetworkAdmin={ctx.role === 'NETWORK_ADMIN'}
          />
        )}
      </div>

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!members?.length ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Nenhum membro cadastrado ainda.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Membro', 'Cargo', 'Situação', ''].map(h => (
                  <th key={h} style={{
                    padding: '12px 20px', textAlign: 'left',
                    fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)',
                    letterSpacing: 'var(--tracking-overline)', textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr
                  key={m.id}
                  style={{
                    borderBottom: i < members.length - 1 ? '1px solid var(--hairline)' : undefined,
                    transition: 'background 80ms',
                  }}
                >
                  {/* Membro */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Initials name={m.name} />
                      <div>
                        <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                          {m.name}
                        </p>
                        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                          {m.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Cargo */}
                  <td style={{ padding: '14px 20px' }}>
                    <span className={ROLE_CHIP[m.role] ?? 'chip chip-muted'}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>

                  {/* Situação */}
                  <td style={{ padding: '14px 20px' }}>
                    <span className={m.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                      {m.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {canManage && m.is_active && (
                      <form action={async () => {
                        'use server'
                        await deactivateTeamMember(m.id, slug)
                      }}>
                        <button
                          type="submit"
                          className="btn-ghost"
                          style={{ padding: '5px 8px', color: 'var(--text-faint)' }}
                          title="Desativar membro"
                        >
                          <UserMinus size={15} />
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
