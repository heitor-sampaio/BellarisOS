import { cargosAcimaDoMeu } from '@/lib/equipe/cargo-acima'
import { getTenantContext, assertPermission, can, temRecurso } from '@/lib/auth'
import { contagemDeMembros } from '@/lib/equipe/contagem'
import { DesativarMembro } from '@/components/admin/desativar-membro'
import { createClient } from '@/lib/supabase/server'
import { ComissaoDoMembro } from '@/components/admin/comissao-do-membro'
import { regrasDaRede, procedimentosParaComissao, procedimentosComComissaoGeral } from '@/lib/comissoes/leitura'
import { cargosQueVendem, cargosQueVeemAsComissoes } from '@/lib/vendas/equipe-da-venda'
import { AdminTeamForm } from '@/components/admin/team-form'
import { TeamMemberEdit } from '@/components/admin/team-member-edit'
import { TeamFilters } from '@/components/admin/team-filters'
import { ReativarMembro } from '@/components/admin/reativar-membro'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { iniciaisDoNome } from '@estetica-os/utils'
import { ler } from '@/lib/db'
import { contemSemAcento, termoDaUrl } from '@/lib/texto'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import { vocabulario } from '@/lib/unidades/vocabulario'
import { createAdminClient } from '@/lib/supabase/admin'
import { listaDeUnidades } from '@/lib/equipe/atende'

function Initials({ name }: { name: string }) {
  const letters = iniciaisDoNome(name)
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--brand)',
      flexShrink: 0,
    }}>
      {letters}
    </div>
  )
}

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; role?: string; status?: string }>
}) {
  const ctx = await getTenantContext()
  // "Ver" abre a lista sem as ações, como já acontece no portal da unidade.
  // Antes o menu aparecia com Ver e o clique caía em Forbidden.
  assertPermission(ctx, 'team', 'VIEW')
  const canManage = ctx.permissions.team === 'MANAGE'

  const { q = '', branch = '', role = '', status = '' } = await searchParams

  const supabase = await createClient()

  // Dados para os filtros + lista de membros em paralelo
  const [branches, tenantRoles, membersResult] = await Promise.all([
    ler(supabase
      .from('branches')
      .select('id, name, horario')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'), 'carregar as unidades'),

    ler(supabase
      .from('tenant_roles')
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('is_system', { ascending: false })
      .order('label'), 'carregar os cargos'),

    ler((() => {
      let query = supabase
        .from('users')
        .select('id, name, email, role_id, is_active, branch_id, provides_services, atende_em, horario, sem_comissao_de_proposito, comissao_venda_pct, registro_conselho, branches(name)')
        .eq('tenant_id', ctx.tenantId!)

      if (branch) query = query.eq('branch_id', branch)
      if (role)   query = query.eq('role_id', role)
      if (status === 'active')   query = query.eq('is_active', true)
      if (status === 'inactive') query = query.eq('is_active', false)

      return query.order('name')
    })(), 'carregar a equipe'),
  ])

  // A busca por nome/e-mail é feita aqui, sem acento ("joao" acha "João").
  // Ia crua para dentro do `.or()` do PostgREST — uma vírgula ou um parêntese
  // digitados quebravam a consulta. A equipe de uma rede é lista curta.
  const termo   = termoDaUrl(q)
  const members = (membersResult ?? []).filter(m => contemSemAcento([m.name, m.email], termo))

  // A comissão de cada um é do financeiro, não da equipe: quem gere a equipe
  // sem `financial: MANAGE` não vê nem muda quanto cada um ganha.
  const podeComissao = can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes')
  const [regras, procedimentos, comGeral, quemVende, veemAsComissoes] = podeComissao
    ? await Promise.all([regrasDaRede(ctx.tenantId!), procedimentosParaComissao(ctx.tenantId!, ctx.branchId), procedimentosComComissaoGeral(ctx.tenantId!, ctx.branchId), cargosQueVendem(ctx.tenantId!), cargosQueVeemAsComissoes(ctx.tenantId!)])
    : [null, [], [], new Set<string>(), new Set<string>()]

  // A clínica de uma unidade não fala "rede" (F8): o cargo "Admin da rede" é "Admin".
  const fala = vocabulario(await redeTemUmaUnidade(ctx.tenantId!))
  const allRoles = (tenantRoles ?? []).map(r => ({ ...r, label: fala(r.label) }))
  // Cargos atribuíveis pela UI: sem os de sistema (NETWORK_ADMIN)
  const assignableRoles = allRoles.filter(r => !r.is_system && r.key !== 'NETWORK_ADMIN')
  // O cargo de SISTEMA Admin da rede (`key` + `is_system`, nunca o rótulo —
  // lib/equipe/admin-da-rede.ts). Revisão do Heitor (2026-10-29): só quem o TEM
  // dá esse cargo e altera quem o tem; a própria Admin edita "atende", comissão
  // e horário com o cargo travado (D2). As actions conferem de novo.
  const cargoDeAdmin = allRoles.find(r => r.key === 'NETWORK_ADMIN' && r.is_system)
  const souAdmin = !!cargoDeAdmin && ctx.roleId === cargoDeAdmin.id
  // A9 da 7ª simulação: a Admin vem PRIMEIRO, como na tela de Cargos (era a última da lista).
  // C62 (F70; H7 = b): o cargo com mais acesso que o de quem age aparece
  // desligado, dizendo por quê — a action também recusa.
  const acimaDoMeu = await cargosAcimaDoMeu(createAdminClient(), ctx, assignableRoles.map(r => r.id), souAdmin)
  const comTrava = assignableRoles.map(r => (acimaDoMeu.has(r.id) ? { ...r, acimaDoMeu: true } : r))
  const rolesParaDar = souAdmin && cargoDeAdmin ? [cargoDeAdmin, ...comTrava] : comTrava
  /** Quem age pode mexer neste membro? A Admin da rede, só outra Admin (ou ela mesma). */
  const podeMexerEm = (m: { id: string; role_id: string | null }) =>
    !cargoDeAdmin || m.role_id !== cargoDeAdmin.id || souAdmin || m.id === ctx.internalUserId
  // Mapa id → label (inclui sistema, para exibir o Admin da rede)
  const roleLabel = Object.fromEntries(allRoles.map(r => [r.id, r.label]))
  // Filtro por cargo: value = role_id
  const filterRoles = allRoles.map(r => ({ key: r.id, label: r.label }))

  const branchMap: Record<string, string> = {}
  for (const b of branches ?? []) branchMap[b.id] = b.name

  const hasFilters = !!(q || branch || role || status)

  // O "Atende" por unidade (decisão 2 da 8ª): a unidade sem ninguém marcado
  // (a nova nasce assim — princípio 6) diz, e quem atende diz onde.
  const ativosQueAtendem = (await ler(createAdminClient().from('users').select('atende_em')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).eq('provides_services', true), 'carregar onde a equipe atende')) ?? []
  const comAlguem = new Set(ativosQueAtendem.flatMap(u => (u.atende_em as string[] | null) ?? []))
  const semNinguem = (branches ?? []).filter(b => !comAlguem.has(b.id))
  const variasUnidades = (branches ?? []).length > 1
  const ondeAtende = (m: { atende_em?: string[] | null }) =>
    (branches ?? []).filter(b => (m.atende_em ?? []).includes(b.id)).map(b => b.name)

  return (
    <div>
      <RealtimeRefresher tables={['users']} />
      {/* Header */}
      {/* `flexWrap` para o botão de adicionar descer em vez de espremer o
          título quando a largura não dá para os dois lado a lado. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 12, flexWrap: 'wrap', marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Equipe
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {fala(contagemDeMembros(members.length, hasFilters ? 'encontrados' : 'em toda a rede'))}
          </p>
          {/* A11 da 12ª (princípio 3): quem só vê a equipe lê por que não há lápis nem "Novo membro". */}
          {!canManage && (
            <p data-equipe-so-leitura style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2, maxWidth: 560 }}>
              Você vê a equipe. Cadastrar e editar é de quem tem a Equipe em Gerenciar no cargo.
            </p>
          )}
        </div>
        {canManage && (
          <AdminTeamForm branches={branches ?? []} roles={rolesParaDar} isNetworkAdmin={ctx.branchId === null} podeComissao={podeComissao}
            cargoDeAdminId={souAdmin && cargoDeAdmin ? cargoDeAdmin.id : null} />
        )}
      </div>

      {semNinguem.length > 0 && (
        <p data-ninguem-atende role="status" style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {semNinguem.length === 1 && !variasUnidades
            ? 'Ninguém atende nesta unidade ainda: marque o “Atende clientes” de quem atende, no lápis de cada pessoa.'
            : `Ninguém atende ${semNinguem.length === 1 ? 'na unidade' : 'nas unidades'} ${listaDeUnidades(semNinguem.map(b => b.name))} ainda: marque a unidade no “Atende clientes em” de quem atende lá, no lápis de cada pessoa.`}
        </p>
      )}

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
          /* Rede de segurança: se a tela for MUITO estreita, a tabela rola na
             horizontal em vez de empurrar a página inteira para o lado.
             `cards-mobile`: no celular cada membro vira um bloco. Antes duas
             colunas eram simplesmente escondidas (`hide-mobile`) e o resto
             ainda rolava 38px na horizontal — agora nada some nem rola. */
          <div style={{ overflowX: 'auto' }}>
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Filial e cargo saem da tabela no celular e reaparecem sob o
                    nome: cinco colunas em 390px ou viram rolagem lateral sem
                    fim, ou espremem o nome — que é a única coluna que importa
                    para achar alguém. */}
                {([
                  { h: 'Membro',   cls: '' },
                  { h: 'Unidade',  cls: 'hide-mobile' },
                  { h: 'Cargo',    cls: 'hide-mobile' },
                  { h: 'Situação', cls: '' },
                  { h: '',         cls: '' },
                ]).map(({ h, cls }) => (
                  <th key={h} className={cls} style={{
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
                  ?? (m.branch_id ? '—' : fala('Rede inteira'))
                const label = (m.role_id ? roleLabel[m.role_id] : null) ?? '—'

                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: i < members.length - 1 ? '1px solid var(--hairline)' : undefined }}
                  >
                    <td data-label="" style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Initials name={m.name} />
                        <div>
                          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                            {m.name}
                          </p>
                          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                            {m.email}
                          </p>
                          {/* Cargo, filial e "atende" moram AQUI no celular,
                              numa linha só. As colunas próprias existem, mas
                              saem com .so-desktop: repetidas no card elas diziam
                              a mesma coisa duas vezes, e o chip do cargo não
                              cabia em meia largura — quebrava e deixava o card
                              torto. */}
                          <p className="show-mobile" style={{
                            fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)',
                            marginTop: 3, gap: 5, flexWrap: 'wrap',
                          }}>
                            {label}
                            {m.provides_services ? (variasUnidades && ondeAtende(m).length ? ` · Atende em ${listaDeUnidades(ondeAtende(m))}` : ' · Atende') : ''}
                            {' · '}
                            {branchName}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td data-label="Unidade" className="so-desktop" style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
                        {branchName}
                      </span>
                    </td>

                    <td data-label="Cargo" className="so-desktop" style={{ padding: '14px 20px' }}>
                      <span className="chip chip-brand">{label}</span>
                      {m.provides_services && (
                        <span className="chip chip-success" style={{ marginLeft: 6 }} data-atende-em>
                          {variasUnidades && ondeAtende(m).length ? `Atende em ${listaDeUnidades(ondeAtende(m))}` : 'Atende'}
                        </span>
                      )}
                    </td>

                    <td data-label="Situação" data-par style={{ padding: '14px 20px' }}>
                      <span className={m.is_active ? 'chip chip-success' : 'chip chip-muted'}>
                        {m.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td data-label="" style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      {regras && (m.provides_services || regras.has(m.id) || (!!m.role_id && quemVende.has(m.role_id as string)) || (m as { comissao_venda_pct?: number | null }).comissao_venda_pct != null) && podeMexerEm(m) && (
                        <ComissaoDoMembro membro={{ id: m.id, nome: m.name }} regras={regras.get(m.id) ?? []}
                          procedimentos={procedimentos} comGeral={comGeral} atende={!!m.provides_services}
                          semDeProposito={!!(m as { sem_comissao_de_proposito?: boolean }).sem_comissao_de_proposito}
                        vendaPct={(m as { comissao_venda_pct?: number | null }).comissao_venda_pct ?? null}
                        naoVeAsProprias={!m.role_id || !veemAsComissoes.has(m.role_id as string)} />
                      )}
                      {canManage && podeMexerEm(m) && <TeamMemberEdit
                        member={{
                          id:               m.id,
                          name:             m.name,
                          email:            m.email ?? '',
                          roleId:           m.role_id ?? null,
                          branchId:         m.branch_id ?? null,
                          providesServices: !!m.provides_services, horario: (m as { horario?: unknown }).horario ?? null,
                          atendeEm: ((m as { atende_em?: string[] | null }).atende_em ?? []) as string[],
                          registroConselho: (m as { registro_conselho?: string | null }).registro_conselho ?? null,
                        }}
                        branches={branches ?? []}
                        editaveisDoAtende={ctx.branchId === null ? null : [ctx.branchId]}
                        roles={rolesParaDar}
                        canChooseScope={ctx.branchId === null}
                        redirectPath="/admin/team"
                        // Travado só para a própria Admin; outra Admin troca o cargo dela.
                        cargoFixo={cargoDeAdmin && m.role_id === cargoDeAdmin.id && m.id === ctx.internalUserId
                          ? { id: cargoDeAdmin.id, label: cargoDeAdmin.label } : undefined}
                        cargoDeAdminId={souAdmin ? cargoDeAdmin?.id : undefined}
                      />}
                      {/* Não se oferece desativar a si mesmo: trancaria a pessoa do lado de fora
                          (a action também recusa). A Admin da rede, só outra Admin. */}
                      {canManage && m.id !== ctx.internalUserId && podeMexerEm(m) && (m.is_active ? (
                        <DesativarMembro membroId={m.id} nome={m.name} redirectPath="/admin/team" />
                      ) : (
                        <ReativarMembro membroId={m.id} redirectPath="/admin/team" />
                      ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
