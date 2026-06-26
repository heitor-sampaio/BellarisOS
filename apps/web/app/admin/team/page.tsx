import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AdminTeamForm } from '@/components/admin/team-form'
import { TeamFilters } from '@/components/admin/team-filters'
import { deactivateTeamMember } from '@/actions/team'
import { UserMinus } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { HIDDEN_ROLES } from '@/lib/permissions'

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
      flexShrink: 0,
    }}>
      {letters.toUpperCase()}
    </div>
  )
}

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; role?: string; status?: string }>
}) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const { q = '', branch = '', role = '', status = '' } = await searchParams

  const supabase = await createClient()

  // Dados para os filtros + lista de membros em paralelo
  const [{ data: branches }, { data: tenantRoles }, membersResult] = await Promise.all([
    supabase
      .from('branches')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('tenant_roles')
      .select('key, label')
      .eq('tenant_id', ctx.tenantId!)
      .not('key', 'in', `(${[...HIDDEN_ROLES].join(',')})`)
      .order('is_system', { ascending: false })
      .order('label'),

    (() => {
      let query = supabase
        .from('users')
        .select('id, name, email, role, is_active, branch_id, branches(name)')
        .eq('tenant_id', ctx.tenantId!)

      if (q)      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      if (branch) query = query.eq('branch_id', branch)
      if (role)   query = query.eq('role', role)
      if (status === 'active')   query = query.eq('is_active', true)
      if (status === 'inactive') query = query.eq('is_active', false)

      return query.order('name')
    })(),
  ])

  const members = membersResult.data ?? []

  // Mapa de label dos cargos (sistema + customizados)
  const roleLabel = Object.fromEntries((tenantRoles ?? []).map(r => [r.key, r.label]))

  const branchMap: Record<string, string> = {}
  for (const b of branches ?? []) branchMap[b.id] = b.name

  const hasFilters = !!(q || branch || role || status)

  return (
    <div>
      <RealtimeRefresher tables={['users']} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Equipe
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {members.length} {members.length === 1 ? 'membro' : 'membros'}
            {hasFilters && ' encontrados'}
            {!hasFilters && ' em toda a rede'}
          </p>
        </div>
        <AdminTeamForm branches={branches ?? []} />
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: 16 }}>
        <TeamFilters
          branches={branches ?? []}
          roles={tenantRoles ?? []}
          initialQ={q}
          initialBranch={branch}
          initialRole={role}
          initialStatus={status}
        />
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!members.length ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              {hasFilters
                ? 'Nenhum membro encontrado com esses filtros.'
                : 'Nenhum membro cadastrado ainda.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Membro', 'Filial', 'Cargo', 'Situação', ''].map(h => (
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
              {members.map((m, i) => {
                const branchName = (m.branches as { name: string } | null)?.name
                  ?? branchMap[m.branch_id]
                  ?? '—'
                const label = roleLabel[m.role] ?? m.role

                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: i < members.length - 1 ? '1px solid var(--hairline)' : undefined }}
                  >
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

                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
                        {branchName}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span className={ROLE_CHIP[m.role] ?? 'chip chip-muted'}>
                        {label}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span className={m.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                        {m.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {m.is_active && (
                        <form action={async () => {
                          'use server'
                          await deactivateTeamMember(m.id, '/admin/team')
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
