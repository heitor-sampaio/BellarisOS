import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ComissaoDoMembro } from '@/components/admin/comissao-do-membro'
import { regrasDaRede, procedimentosParaComissao } from '@/lib/comissoes/leitura'
import { TeamForm } from '@/components/branch/team-form'
import { TeamMemberEdit } from '@/components/admin/team-member-edit'
import { deactivateTeamMember, reactivateTeamMember } from '@/actions/team'
import { UserMinus, UserCheck } from 'lucide-react'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ler } from '@/lib/db'

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
      fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--brand)',
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
  // A página lista a equipe da filial e todos os cargos do tenant. Sem este gate
  // bastava a URL direta: o cargo sem acesso a Equipe via tudo, só sem botões.
  assertPermission(ctx, 'team', 'VIEW')
  const supabase = await createClient()

  const branch = await ler(supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')

  const branchId = branch?.id ?? ctx.branchId!

  const [members, tenantRoles] = await Promise.all([
    ler(supabase
      .from('users')
      .select('id, name, email, role_id, is_active, provides_services')
      .eq('branch_id', branchId)
      .order('name'), 'carregar a equipe'),
    ler(supabase
      .from('tenant_roles')
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('label'), 'carregar os cargos'),
  ])

  const allRoles = tenantRoles ?? []
  const assignableRoles = allRoles.filter(r => !r.is_system && r.key !== 'NETWORK_ADMIN')
  const roleLabel = Object.fromEntries(allRoles.map(r => [r.id, r.label]))
  const canManage = ctx.permissions.team === 'MANAGE'
  // A comissão é do financeiro, não da equipe (ver a página da rede).
  const podeComissao = can(ctx, 'financial', 'MANAGE')
  const [regras, procedimentos] = podeComissao
    ? await Promise.all([regrasDaRede(ctx.tenantId!), procedimentosParaComissao(ctx.tenantId!, branchId)])
    : [null, []]

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
          <TeamForm branchId={branchId} slug={slug} roles={assignableRoles} />
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
                    <span className="chip chip-brand">
                      {(m.role_id ? roleLabel[m.role_id] : null) ?? '—'}
                    </span>
                    {m.provides_services && (
                      <span className="chip chip-success" style={{ marginLeft: 6 }}>Atende</span>
                    )}
                  </td>

                  {/* Situação */}
                  <td style={{ padding: '14px 20px' }}>
                    <span className={m.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                      {m.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    {regras && (m.provides_services || regras.has(m.id)) && (
                      <ComissaoDoMembro membro={{ id: m.id, nome: m.name }} regras={regras.get(m.id) ?? []}
                        procedimentos={procedimentos} atende={!!m.provides_services} />
                    )}
                    {canManage && (
                      <TeamMemberEdit
                        member={{
                          id:               m.id,
                          name:             m.name,
                          email:            m.email ?? '',
                          roleId:           m.role_id ?? null,
                          branchId:         branchId,
                          providesServices: !!m.provides_services,
                        }}
                        branches={[{ id: branchId, name: branch?.name ?? 'Esta unidade' }]}
                        roles={assignableRoles}
                        canChooseScope={false}
                        redirectPath={`/${slug}/team`}
                      />
                    )}
                    {/* Não se oferece desativar a si mesmo: trancaria a pessoa do lado de fora
                          (a action também recusa). */}
                      {canManage && m.id !== ctx.internalUserId && (m.is_active ? (
                      <form action={async () => {
                        'use server'
                        await deactivateTeamMember(m.id, `/${slug}/team`)
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
                        await reactivateTeamMember(m.id, `/${slug}/team`)
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
                    ))}
                    </div>
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
