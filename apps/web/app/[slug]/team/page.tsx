import { getTenantContext, assertPermission, can, temRecurso, unidadesDoContexto, alcancaUnidade } from '@/lib/auth'
import { contagemDeMembros } from '@/lib/equipe/contagem'
import { DesativarMembro } from '@/components/admin/desativar-membro'
import { ComissaoDoMembro } from '@/components/admin/comissao-do-membro'
import { regrasDaRede, procedimentosParaComissao, procedimentosComComissaoGeral, configDeComissaoDaRede } from '@/lib/comissoes/leitura'
import { cargosQueVendem } from '@/lib/vendas/equipe-da-venda'
import { TeamForm } from '@/components/branch/team-form'
import { TeamMemberEdit } from '@/components/admin/team-member-edit'
import { fusosDasUnidades } from '@/lib/unidades/fuso-da-unidade'
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
import { cargosAcimaDoMeu } from '@/lib/equipe/cargo-acima'
import { alcancaTodasAsDoMembro, CARGO_DE_QUEM_TEM_OUTRA_UNIDADE } from '@/lib/unidades/do-membro'
import { Dica } from '@/components/shared/dica'
import { cargosQueSeDaoPelaEquipe, avisoDoMembroSemAcesso } from '@/lib/cargos/sem-acesso'
import { cargosSemAcesso } from '@/lib/equipe/cargos-sem-acesso'
import { abreAEquipe } from '@/lib/equipe/quem-abre-a-equipe'
import { alcancaOMembro } from '@/lib/equipe/alcance-do-membro'

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
  // D5 da 40ª (CM-04): quem muda a comissão (o Financeiro em Gerenciar) chega ao chip sem a Equipe.
  if (!abreAEquipe(ctx.permissions, temRecurso(ctx, 'comissoes'))) assertPermission(ctx, 'team', 'VIEW')
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): tudo se lê pelo
  // servidor, com a rede e a abrangência conferidas aqui (era a RLS).
  const admin = createAdminClient()
  const achada = await ler(admin
    .from('branches')
    .select('id, name, horario')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  // A unidade fora do alcance não se abre (a RLS a escondia): vale a da pessoa.
  const branch = achada && alcancaUnidade(ctx, achada.id as string) ? achada : null

  const branchId = branch?.id ?? ctx.branchId!

  const [todosOsMembros, tenantRoles, daRedeQueAtendem, unidadesDaRede] = await Promise.all([
    ler(admin
      .from('users')
      .select('id, name, email, role_id, branch_id, outras_unidades, is_active, provides_services, atende_em, horario, comissao_venda_pct, registro_conselho')
      .eq('tenant_id', ctx.tenantId!)
      // Quem tem esta unidade: a principal ou uma das outras (EQ1a).
      .or(`branch_id.eq.${branchId},outras_unidades.cs.{${branchId}}`)
      .order('name'), 'carregar a equipe'),
    ler(admin
      .from('tenant_roles')
      .select('id, key, label, is_system')
      .eq('tenant_id', ctx.tenantId!)
      .order('label'), 'carregar os cargos'),
    // Quem é DE FORA (da rede ou de outra unidade) e tem esta unidade marcada
    // no "Atende" (decisão 2 da 8ª simulação; era só "da rede, que atende em
    // todas") — a dona da clínica que atende é o caso típico (A5/D2,
    // 2026-10-29), e a Talita da Água Verde cobrindo o Batel. A sessão de
    // unidade não lê esses membros (RLS): o servidor lê só estes. A linha
    // mostra o nome, o cargo e onde atendem; o e-mail e o horário vão só à
    // janela de editar de quem tem unidades (D14 da 40ª, EQ-05).
    ler(createAdminClient()
      .from('users')
      .select('id, name, email, role_id, branch_id, outras_unidades, provides_services, atende_em, horario, registro_conselho')
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
  // A11 da 26ª: o fuso de cada unidade — a edição diz em que relógio vale o horário próprio.
  const fusos = await fusosDasUnidades(ctx.tenantId)
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
  // Os da rede e o "Não definido" (item 20 de 18/11); o Admin da rede, não.
  const assignableRoles = cargosQueSeDaoPelaEquipe(allRoles)
  // Item 21: os cargos que não abrem módulo nenhum.
  const semAcesso = await cargosSemAcesso(createAdminClient(), ctx, allRoles)
  const roleLabel = Object.fromEntries(allRoles.map(r => [r.id, r.label]))
  const canManage = ctx.permissions.team === 'MANAGE'
  // A comissão é do financeiro, não da equipe (ver a página da rede).
  const podeComissao = can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes')
  const [regras, procedimentos, comGeral, quemVende, configDaComissao] = podeComissao
    ? await Promise.all([regrasDaRede(ctx.tenantId!), procedimentosParaComissao(ctx.tenantId!, branchId), procedimentosComComissaoGeral(ctx.tenantId!, branchId), cargosQueVendem(ctx.tenantId!), configDeComissaoDaRede(ctx.tenantId!)])
    : [null, [], [], new Set<string>(), null]
  // O Heitor, 25/11 ("Diz o percentual da rede"): o chip de quem vende diz a comissão de venda da rede.
  const vendaDaRede = configDaComissao ? { plano: configDaComissao.plano_pct, produto: configDaComissao.produto_pct } : undefined
  // C62 (F70; H7 = b), como na Equipe da rede: o cargo com mais acesso que o
  // de quem age aparece desligado, dizendo por quê — a action também recusa.
  const acimaDoMeu = canManage
    ? await cargosAcimaDoMeu(createAdminClient(), ctx, assignableRoles.filter(r => !r.is_system).map(r => r.id), ctx.isNetworkAdmin)
    : new Set<string>()
  const comTrava = assignableRoles.map(r => ({ ...r, semAcesso: semAcesso.has(r.id), ...(acimaDoMeu.has(r.id) ? { acimaDoMeu: true } : {}) }))
  const cargosDoCadastro = comTrava
  /** EQ1: o cargo e o desativar valem em TODAS as unidades do membro — só quem alcança todas mexe. */
  const alcancaTodas = (m: { branch_id?: string | null; outras_unidades?: string[] | null }) =>
    alcancaTodasAsDoMembro(minhas, { branchId: m.branch_id ?? null, outrasUnidades: m.outras_unidades ?? [] })
  /**
   * D14 da 40ª (EQ-05): quem tem "A rede inteira" e atende aqui se edita por quem
   * tem unidades — o "Atende" (só as dela) e o horário, com o cargo travado; o
   * desativar e o reativar pedem todas as unidades dele. A Admin da rede, só outra
   * Admin (EQ-10), e quem tem a rede inteira a edita na Equipe da rede.
   */
  const editaQuemEDaRede = (m: { role_id: string | null; branch_id: string | null; outras_unidades?: string[] | null }) =>
    canManage && minhas !== null && m.branch_id === null && alcancaOMembro(minhas, m)
    && !allRoles.some(r => r.id === m.role_id && r.key === 'NETWORK_ADMIN' && r.is_system)

  return (
    <div>
      <RealtimeRefresher topicos={['equipe']} />
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
          {/* A8 da 26ª (CLAUDE.md §11, "a própria Admin edita em si o 'atende'"; princípio 7):
              quem é da rede inteira não aparece aqui até atender nesta unidade, e a Admin
              não achava onde se marcar. O caminho, a quem abre a rede. */}
          {minhas === null && (
            <p data-equipe-da-rede style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 4, maxWidth: 560 }}>
              {fala('Quem é da rede inteira (você também) está na ')}
              <Link href="/admin/team" style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)', textDecoration: 'none' }}>{fala('Equipe da rede')}</Link>
              {fala(': é lá que se marca o “Atende clientes” de cada um.')}
            </p>
          )}
          {ninguemAtendeAqui && (
            <p data-ninguem-atende role="status" style={{
              marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-field-token)', maxWidth: 560,
              background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
            }}>
              {/* A13 da 39ª (princípio 7, o Heitor, 26/11: intuitivo não é explicativo): a faixa diz o estado. */}
              {fala('Ninguém atende nesta unidade ainda.')}
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
                        {/* Item 21 de 18/11: o cargo dela não abre módulo nenhum — avisa, à vista. */}
                        {m.is_active && !!m.role_id && semAcesso.has(m.role_id) && (
                          <p data-sem-acesso style={{
                            fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--warning)',
                            marginTop: 3, maxWidth: 360,
                          }}>
                            {avisoDoMembroSemAcesso(!!m.provides_services)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Cargo */}
                  <td style={{ padding: '14px 20px' }}>
                    <span className="chip chip-brand">
                      {(m.role_id ? roleLabel[m.role_id] : null) ?? '—'}
                    </span>
                    {/* A24 da 20ª: o desativado não leva o selo. A29 da 32ª: o selo é de quem atende NESTA unidade. */}
                    {seloDoAtende({ ativo: !!m.is_active, atende: (m.atende_em ?? []).includes(branchId), onde: [], variasUnidades: false }) && (
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
                        vendaPct={(m as { comissao_venda_pct?: number | null }).comissao_venda_pct ?? null} vendaDaRede={vendaDaRede} />
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
                        fusos={fusos}
                        editaveisDoAtende={editaveisDoAtende}
                        roles={comTrava}
                        cargoTravado={alcancaTodas(m as { branch_id?: string | null; outras_unidades?: string[] | null }) ? undefined : CARGO_DE_QUEM_TEM_OUTRA_UNIDADE}
                        canChooseScope={false}
                        unidadesDeQuemEdita={minhas}
                        redirectPath={`/${slug}/team`}
                      />
                    )}
                    {/* Não se oferece desativar a si mesmo: trancaria a pessoa do lado de fora
                          (a action também recusa). Nem quem tem outra unidade fora do alcance
                          (EQ1): o login é um só, e a action recusaria. */}
                      {canManage && m.id !== ctx.internalUserId && alcancaTodas(m as { branch_id?: string | null; outras_unidades?: string[] | null }) && (m.is_active ? (
                      <DesativarMembro membroId={m.id} nome={m.name} redirectPath={`/${slug}/team`} atende={!!m.provides_services} />
                    ) : (
                      <ReativarMembro membroId={m.id} nome={m.name} atende={!!m.provides_services} redirectPath={`/${slug}/team`} />
                    ))}
                    </div>
                  </td>
                </tr>
              ))}
              {/* Quem é da rede e atende aqui. Cargo, comissão, desativar e acesso
                  se mexem na Equipe da rede (pedem todas as unidades dele); quem
                  tem unidades edita o "Atende" e o horário (D14 da 40ª, EQ-05). */}
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
                    {editaQuemEDaRede(m as { role_id: string | null; branch_id: string | null; outras_unidades?: string[] | null }) && (
                      <TeamMemberEdit
                        member={{
                          id:               m.id,
                          name:             m.name,
                          email:            (m as { email?: string | null }).email ?? '',
                          roleId:           m.role_id ?? null,
                          branchId:         null,
                          outrasUnidades:   [],
                          providesServices: !!(m as { provides_services?: boolean | null }).provides_services,
                          horario:          (m as { horario?: unknown }).horario ?? null,
                          atendeEm:         ((m.atende_em as string[] | null) ?? []),
                          registroConselho: (m as { registro_conselho?: string | null }).registro_conselho ?? null,
                        }}
                        branches={[{ id: branchId, name: branch?.name ?? 'Esta unidade', horario: branch?.horario }]}
                        unidadesDoAtende={unidadesDoAtende}
                        fusos={fusos}
                        editaveisDoAtende={editaveisDoAtende}
                        roles={comTrava}
                        cargoTravado={CARGO_DE_QUEM_TEM_OUTRA_UNIDADE}
                        canChooseScope={false}
                        unidadesDeQuemEdita={minhas}
                        redirectPath={`/${slug}/team`}
                      />
                    )}
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
