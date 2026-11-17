import { getTenantContext, assertPermission, can, temRecurso, unidadesDoContexto } from '@/lib/auth'
import { contagemDeMembros } from '@/lib/equipe/contagem'
import { DesativarMembro } from '@/components/admin/desativar-membro'
import { createClient } from '@/lib/supabase/server'
import { ComissaoDoMembro } from '@/components/admin/comissao-do-membro'
import { regrasDaRede, procedimentosParaComissao, procedimentosComComissaoGeral } from '@/lib/comissoes/leitura'
import { cargosQueVendem, cargosQueVeemAsComissoes } from '@/lib/vendas/equipe-da-venda'
import { TeamForm } from '@/components/branch/team-form'
import { TeamMemberEdit } from '@/components/admin/team-member-edit'
import { ReativarMembro } from '@/components/admin/reativar-membro'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ler } from '@/lib/db'
import { BuscaNaUrl } from '@/components/shared/busca-na-url'
import { contemSemAcento, termoDaUrl } from '@/lib/texto'
import { falaDaTela } from '@/lib/unidades/uma-so'
import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { listaDeUnidades, seloDoAtende } from '@/lib/equipe/atende'
import { Dica } from '@/components/shared/dica'

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
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { slug } = await params
  // `?q=` filtra por nome ou e-mail (a busca universal entra por aqui).
  const termo    = termoDaUrl((await searchParams).q)
  const ctx = await getTenantContext()
  // A página lista a equipe da unidade e todos os cargos do tenant. Sem este gate
  // bastava a URL direta: o cargo sem acesso a Equipe via tudo, só sem botões.
  assertPermission(ctx, 'team', 'VIEW')
  const supabase = await createClient()

  const branch = await ler(supabase
    .from('branches')
    .select('id, name, horario')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')

  const branchId = branch?.id ?? ctx.branchId!

  const [todosOsMembros, tenantRoles, daRedeQueAtendem, unidadesDaRede] = await Promise.all([
    ler(supabase
      .from('users')
      .select('id, name, email, role_id, branch_id, outras_unidades, is_active, provides_services, atende_em, horario, comissao_venda_pct, registro_conselho')
      // Quem tem esta unidade: a principal ou uma das outras (EQ1a).
      .or(`branch_id.eq.${branchId},outras_unidades.cs.{${branchId}}`)
      .order('name'), 'carregar a equipe'),
    ler(supabase
      .from('tenant_roles')
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('label'), 'carregar os cargos'),
    // Quem é DE FORA (da rede ou de outra unidade) e tem esta unidade marcada
    // no "Atende" (decisão 2 da 8ª simulação; era só "da rede, que atende em
    // todas") — a dona da clínica que atende é o caso típico (A5/D2,
    // 2026-10-29), e a Talita da Água Verde cobrindo o Batel. A sessão de
    // unidade não lê esses membros (RLS): o servidor lê só estes, só o nome,
    // o cargo e onde atendem, e a linha vai sem e-mail nem ações.
    ler(createAdminClient()
      .from('users')
      .select('id, name, role_id, branch_id, atende_em')
      .eq('tenant_id', ctx.tenantId!)
      .contains('atende_em', [branchId])
      .or(`branch_id.is.null,branch_id.neq.${branchId}`)
      .not('outras_unidades', 'cs', `{${branchId}}`)
      .eq('is_active', true)
      .order('name'), 'carregar quem é de fora e atende aqui'),
    getCachedNetworkBranches(ctx.tenantId!),
  ])
  const nomeDa = new Map(((unidadesDaRede ?? []) as { id: string; name: string }[]).map(u => [u.id, u.name]))
  const unidadesDoAtende = (unidadesDaRede ?? []) as { id: string; name: string }[]
  // Quem tem unidades marca e desmarca só as DELA (H7, EQ1a); quem é da rede, todas.
  const minhas = unidadesDoContexto(ctx)
  const editaveisDoAtende = minhas
  // Com mais de uma unidade, ela escolhe em quais das dela a pessoa entra (EQ1a).
  const unidadesDeQuemCadastra = minhas && minhas.length > 1
    ? unidadesDoAtende.filter(u => minhas.includes(u.id))
    : null
  const ninguemAtendeAqui = ![...(todosOsMembros ?? []), ...(daRedeQueAtendem ?? [])]
    .some(m => (m as { is_active?: boolean }).is_active !== false && ((m as { atende_em?: string[] | null }).atende_em ?? []).includes(branchId))

  const members  = (todosOsMembros ?? []).filter(m => contemSemAcento([m.name, m.email], termo))
  const daRede   = (daRedeQueAtendem ?? []).filter(m => contemSemAcento([m.name], termo))
  const total    = members.length + daRede.length
  // Na rede de uma unidade (PO2), o cargo "Admin da rede" é "Admin".
  const fala = await falaDaTela(ctx.tenantId)
  const allRoles = (tenantRoles ?? []).map(r => ({ ...r, label: fala(r.label) }))
  const assignableRoles = allRoles.filter(r => !r.is_system && r.key !== 'NETWORK_ADMIN')
  const roleLabel = Object.fromEntries(allRoles.map(r => [r.id, r.label]))
  const canManage = ctx.permissions.team === 'MANAGE'
  // A comissão é do financeiro, não da equipe (ver a página da rede).
  const podeComissao = can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes')
  const [regras, procedimentos, comGeral, quemVende, veemAsComissoes] = podeComissao
    ? await Promise.all([regrasDaRede(ctx.tenantId!), procedimentosParaComissao(ctx.tenantId!, branchId), procedimentosComComissaoGeral(ctx.tenantId!, branchId), cargosQueVendem(ctx.tenantId!), cargosQueVeemAsComissoes(ctx.tenantId!)])
    : [null, [], [], new Set<string>(), new Set<string>()]
  // A18 da 17ª: o cadastro de quem atende diz quando o cargo não mostra as próprias comissões.
  const veemComissoes = temRecurso(ctx, 'comissoes')
    ? (podeComissao ? veemAsComissoes : await cargosQueVeemAsComissoes(ctx.tenantId!))
    : null
  const cargosDoCadastro = assignableRoles.map(r => ({ ...r, naoVeAsComissoes: !!veemComissoes && !veemComissoes.has(r.id) }))

  return (
    <div>
      <RealtimeRefresher tables={['users']} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <h1 style={{
              fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
              letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
            }}>
              Equipe
            </h1>
            {/* O recorte (A12 da 6ª: 3 de 7 sem saber o recorte) e o "só vê" (A11 da 12ª:
                por que não há lápis nem "Novo membro") moram na dica (2026-11-16). */}
            <Dica rotulo="Sobre a equipe da unidade">
              <span data-recorte-da-equipe style={{ display: 'block' }}>
                {fala(`Equipe da unidade ${branch?.name ?? ''}: quem é dela e quem é de fora e atende aqui. Quem é da rede e não atende fica na Equipe da rede.`)}
              </span>
              {!canManage && (
                <span data-equipe-so-leitura style={{ display: 'block', marginTop: 6 }}>
                  Você vê a equipe. Cadastrar e editar é de quem tem a Equipe em Gerenciar no cargo.
                </span>
              )}
            </Dica>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {contagemDeMembros(total, termo ? 'encontrados' : 'cadastrados')}
          </p>
          {ninguemAtendeAqui && (
            <p data-ninguem-atende role="status" style={{
              marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-field-token)', maxWidth: 560,
              background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
            }}>
              {fala('Ninguém atende nesta unidade ainda: marque esta unidade no “Atende clientes” de quem atende aqui, no lápis de cada pessoa. Quem é de fora, a Equipe da rede marca.')}
            </p>
          )}
        </div>
        {canManage && (
          <TeamForm branchId={branchId} slug={slug} roles={cargosDoCadastro} unidade={branch?.name ?? null}
            unidadesDoAtende={unidadesDoAtende} editaveisDoAtende={editaveisDoAtende} podeComissao={podeComissao}
            unidadesDeQuemCadastra={unidadesDeQuemCadastra} />
        )}
      </div>

      {((todosOsMembros?.length ?? 0) + (daRedeQueAtendem?.length ?? 0)) > 0 && (
        <div className="filtros-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <BuscaNaUrl inicial={termo} placeholder="Buscar por nome ou e-mail…" rotulo="Buscar membro" />
        </div>
      )}

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!total ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              {termo ? <>Nenhum membro encontrado para “{termo}”.</> : 'Nenhum membro cadastrado ainda.'}
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
                    borderBottom: i < total - 1 ? '1px solid var(--hairline)' : undefined,
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
                    {/* A24 da 20ª: o desativado não leva o selo. */}
                    {seloDoAtende({ ativo: !!m.is_active, atende: !!m.provides_services, onde: [], variasUnidades: false }) && (
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
                    {/* A5 da 22ª: as ações quebram a linha em vez de cortar. */}
                    <div data-acoes-do-membro style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                    {regras && (m.provides_services || regras.has(m.id) || (!!m.role_id && quemVende.has(m.role_id as string)) || (m as { comissao_venda_pct?: number | null }).comissao_venda_pct != null) && (
                      <ComissaoDoMembro membro={{ id: m.id, nome: m.name }} regras={regras.get(m.id) ?? []}
                        procedimentos={procedimentos} comGeral={comGeral} atende={!!m.provides_services}
                        vendaPct={(m as { comissao_venda_pct?: number | null }).comissao_venda_pct ?? null}
                        naoVeAsProprias={!m.role_id || !veemAsComissoes.has(m.role_id as string)} />
                    )}
                    {canManage && (
                      <TeamMemberEdit
                        member={{
                          id:               m.id,
                          name:             m.name,
                          email:            m.email ?? '',
                          roleId:           m.role_id ?? null,
                          branchId:         (m as { branch_id?: string | null }).branch_id ?? branchId,
                          outrasUnidades:   ((m as { outras_unidades?: string[] | null }).outras_unidades ?? []) as string[],
                          providesServices: !!m.provides_services, horario: (m as { horario?: unknown }).horario ?? null,
                          atendeEm: ((m as { atende_em?: string[] | null }).atende_em ?? []) as string[],
                          registroConselho: (m as { registro_conselho?: string | null }).registro_conselho ?? null,
                        }}
                        branches={[{ id: branchId, name: branch?.name ?? 'Esta unidade', horario: branch?.horario }]}
                        unidadesDoAtende={unidadesDoAtende}
                        editaveisDoAtende={editaveisDoAtende}
                        roles={assignableRoles}
                        canChooseScope={false}
                        unidadesDeQuemEdita={minhas}
                        redirectPath={`/${slug}/team`}
                      />
                    )}
                    {/* Não se oferece desativar a si mesmo: trancaria a pessoa do lado de fora
                          (a action também recusa). */}
                      {canManage && m.id !== ctx.internalUserId && (m.is_active ? (
                      <DesativarMembro membroId={m.id} nome={m.name} redirectPath={`/${slug}/team`} atende={!!m.provides_services} />
                    ) : (
                      <ReativarMembro membroId={m.id} nome={m.name} atende={!!m.provides_services} redirectPath={`/${slug}/team`} />
                    ))}
                    </div>
                  </td>
                </tr>
              ))}
              {/* Quem é da rede e atende aqui: só leitura. Cargo, comissão e
                  acesso se mexem na Equipe da rede — a unidade não alcança
                  quem é da rede (§11), e a action recusaria. */}
              {daRede.map((m, i) => (
                <tr
                  key={m.id}
                  style={{ borderBottom: members.length + i < total - 1 ? '1px solid var(--hairline)' : undefined }}
                >
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Initials name={m.name} />
                      <div>
                        <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                          {m.name}
                        </p>
                        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                          {(() => {
                            const onde = ((m.atende_em as string[] | null) ?? []).map(u => nomeDa.get(u)).filter((x): x is string => !!x)
                            return onde.length >= unidadesDoAtende.length && unidadesDoAtende.length > 1
                              ? 'Atende em todas as unidades' : `Atende em ${listaDeUnidades(onde)}`
                          })()}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span className="chip chip-brand">
                      {(m.role_id ? roleLabel[m.role_id] : null) ?? '—'}
                    </span>
                    <span className="chip chip-success" style={{ marginLeft: 6 }}>Atende</span>
                    <span className="chip chip-info" style={{ marginLeft: 6 }}>
                      {m.branch_id ? `Da unidade ${nomeDa.get(m.branch_id as string) ?? 'outra'}` : fala('Da rede')}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span className="chip chip-success">Ativo</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {canManage && ctx.branchId === null && (
                      <Link
                        href={`/admin/team?q=${encodeURIComponent(m.name)}`}
                        className="btn-ghost"
                        style={{ padding: '5px 8px', color: 'var(--brand)', display: 'inline-flex' }}
                        title={fala('Editar na Equipe da rede')}
                      >
                        <Pencil size={15} />
                      </Link>
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
