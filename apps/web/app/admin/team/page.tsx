import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AdminTeamForm } from '@/components/admin/team-form'
import { TeamFilters } from '@/components/admin/team-filters'
import { deactivateTeamMember, reactivateTeamMember } from '@/actions/team'
import { UserMinus, UserCheck } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

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
  assertPermission(ctx, 'team', 'MANAGE')

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
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('is_system', { ascending: false })
      .order('label'),

    (() => {
      let query = supabase
        .from('users')
        .select('id, name, email, role_id, is_active, branch_id, provides_services, branches(name)')
        .eq('tenant_id', ctx.tenantId!)

      if (q)      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      if (branch) query = query.eq('branch_id', branch)
      if (role)   query = query.eq('role_id', role)
      if (status === 'active')   query = query.eq('is_active', true)
      if (status === 'inactive') query = query.eq('is_active', false)

      return query.order('name')
    })(),
  ])

  const members = membersResult.data ?? []

  const allRoles = tenantRoles ?? []
  // Cargos atribuíveis pela UI: sem os de sistema (NETWORK_ADMIN)
  const assignableRoles = allRoles.filter(r => !r.is_system && r.key !== 'NETWORK_ADMIN')
  // Mapa id → label (inclui sistema, para exibir o Admin da rede)
  const roleLabel = Object.fromEntries(allRoles.map(r => [r.id, r.label]))
  // Filtro por cargo: value = role_id
  const filterRoles = allRoles.map(r => ({ key: r.id, label: r.label }))

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
        <AdminTeamForm branches={branches ?? []} roles={assignableRoles} isNetworkAdmin={ctx.isNetworkAdmin} />
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: 16 }}>
        <TeamFilters
          branches={branches ?? []}
          roles={filterRoles}
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
                const branchName = (m.branches as unknown as { name: string } | null)?.name
                  ?? (m.branch_id ? branchMap[m.branch_id] : null)
                  ?? (m.branch_id ? '—' : 'Rede inteira')
                const label = (m.role_id ? roleLabel[m.role_id] : null) ?? '—'

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
                      <span className="chip chip-brand">{label}</span>
                      {m.provides_services && (
                        <span className="chip chip-success" style={{ marginLeft: 6 }}>Atende</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span className={m.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                        {m.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {m.is_active ? (
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
                      ) : (
                        <form action={async () => {
                          'use server'
                          await reactivateTeamMember(m.id, '/admin/team')
                        }}>
                          <button
                            type="submit"
                            className="btn-ghost"
                            style={{ padding: '5px 8px', color: 'var(--brand)' }}
                            title="Reativar membro"
                          >
                            <UserCheck size={15} />
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
