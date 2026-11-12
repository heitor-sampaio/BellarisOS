import { unstable_cache } from 'next/cache'
import { COLUNAS_DA_OFERTA, ofereceNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { createAdminClient } from '@/lib/supabase/admin'
import { unitTag } from '@estetica-os/utils'
import { ler, lerTodas } from '@/lib/db'
import type { FichaDoLogin } from '@/lib/clientes/ficha-da-requisicao'
import { quemRealizaOsProcedimentos } from '@/lib/procedimentos/quem-realiza'
import { precosDaUnidade, precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

// ─── Membro por auth_id (usado no getTenantContext) ───────────────────────────
// Traz id interno + cargo dinâmico + flag de profissional. Fonte de fallback dos
// claims (role_id/provides_services) enquanto o JWT antigo não carrega role_id.
// Invalidar em actions/team.ts via tag `user:${authId}`.
export type CachedMember = {
  id: string; name: string; roleId: string | null; roleLabel: string
  /**
   * O cargo é o de SISTEMA "Admin da rede" (`tenant_roles.key = 'NETWORK_ADMIN'`
   * com `is_system`) — lido do BANCO (C58, F70). O "tudo" da Admin vinha da
   * claim `role` do token: rebaixada, ela seguia com tudo até o token renovar.
   */
  ehAdminDaRede: boolean
  providesServices: boolean
  /**
   * As unidades em que ele ATENDE (decisão 2 do Heitor, 8ª simulação): o
   * checklist do "Atende" na Equipe. Não é abrangência — ele alcança nelas só
   * os agendamentos DELE (`alcancaOAgendamento`, lib/auth.ts).
   */
  atendeEm: string[]
  /**
   * Abrangência do membro: `null` = rede inteira.
   *
   * Vem do banco pelo mesmo motivo que `role_id` vem: trocar a abrangência de
   * alguém tem de valer na hora. Com o valor só no JWT, promover alguém a
   * abrangência de rede o deixava até uma hora trancado fora do `/admin`, que é
   * de onde o layout manda sair quem tem filial fixa.
   */
  branchId: string | null
  /**
   * Desativado não entra (`buildContext`). Até 2026-09-27 nada lia esta
   * coluna: quem era desligado seguia com acesso completo até alguém apagar a
   * conta na mão.
   */
  isActive: boolean
}

export function getCachedMember(authId: string) {
  return unstable_cache(
    async (): Promise<CachedMember | null> => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('users')
        .select('id, name, role_id, branch_id, provides_services, atende_em, is_active, tenant_roles(label, key, is_system)')
        .eq('auth_id', authId)
        .maybeSingle(), 'buscar o usuário')
      if (!data) return null
      const roleRef = data.tenant_roles as unknown as { label: string; key: string | null; is_system: boolean | null } | null
      return {
        id: data.id,
        name: data.name ?? '',
        roleId: data.role_id ?? null,
        roleLabel: roleRef?.label ?? '',
        ehAdminDaRede: roleRef?.key === 'NETWORK_ADMIN' && roleRef?.is_system === true,
        providesServices: data.provides_services ?? false,
        atendeEm: ((data as { atende_em?: string[] | null }).atende_em ?? []) as string[],
        branchId: (data.branch_id as string | null) ?? null,
        isActive: data.is_active !== false,
      }
    },
    // `v2`: o formato ganhou o `ehAdminDaRede` (F70) — a entrada antiga, sem
    // ele, valeria "não é Admin" por até uma hora depois do deploy.
    [`member-v2-${authId}`],
    { revalidate: 3600, tags: [`user:${authId}`] },
  )()
}

// ─── As fichas de um login de cliente (uma por clínica, 2026-10-19) ──────────
// A mesma pessoa pode ser cliente de várias clínicas com um login só. O
// `buildContext` escolhe, entre estas, a da clínica do endereço
// (lib/clientes/ficha-da-requisicao.ts). Quem liga uma ficha nova ao login
// expira a tag `fichas-do-login:<authId>`.
export type FichaDoLoginCacheada = FichaDoLogin & { unidade: string; rede: string }

export const tagDasFichasDoLogin = (authId: string) => `fichas-do-login:${authId}`

export function getCachedFichasDoLogin(authId: string) {
  return unstable_cache(
    async (): Promise<FichaDoLoginCacheada[]> => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('clients')
        .select('id, tenant_id, branches(slug, name, tenants(name))')
        .eq('auth_id', authId)
        .order('created_at'), 'buscar as fichas do login')
      // As unidades ATIVAS da clínica de cada ficha: o portal de qualquer uma
      // abre esta ficha (H5, 2026-11-02).
      const redes = [...new Set((data ?? []).map(c => c.tenant_id as string))]
      const unidades = redes.length
        ? ((await ler(admin.from('branches').select('slug, tenant_id')
            .in('tenant_id', redes).eq('is_active', true), 'buscar as unidades das clínicas da cliente')) ?? []) as { slug: string; tenant_id: string }[]
        : []
      return (data ?? []).map(c => {
        const unidade = c.branches as unknown as { slug: string; name: string; tenants: { name: string } | null } | null
        return {
          clientId: c.id as string, tenantId: c.tenant_id as string,
          slugsDaClinica: unidades.filter(u => u.tenant_id === c.tenant_id).map(u => u.slug),
          slug: unidade?.slug ?? null, unidade: unidade?.name ?? '', rede: unidade?.tenants?.name ?? '',
        }
      })
    },
    [`fichas-do-login-${authId}`],
    { revalidate: 300, tags: [tagDasFichasDoLogin(authId)] },
  )()
}

// A situação da REDE e a rede do cliente moram em lib/redes/cache.ts (o
// núcleo: a clínica e a plataforma usam).
export { getCachedRede, tagDaRede, getCachedRedeDoCliente, type CachedRede } from '@/lib/redes/cache'

// ─── Branch: clientes que FREQUENTAM a filial (via unit tag "Unidade: <nome>") ─
// Cliente pertence à REDE; a unidade é uma TAG. Listamos quem tem a tag da filial.
export function getCachedBranchClients(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const branch = await ler(admin
        .from('branches')
        .select('name')
        .eq('id', branchId)
        .eq('tenant_id', tenantId)
        .maybeSingle(), 'buscar a unidade')
      if (!branch?.name) return []
      // Todas, em páginas: o PostgREST corta em 1000, e a lista parava numa
      // letra do alfabeto — a busca da barra (em memória) não achava o resto.
      const nome = branch.name
      return lerTodas((de, ate) => admin
        .from('clients')
        .select('id, name, phone, tags, is_active, created_at, cliente_desde')
        .eq('tenant_id', tenantId)
        .contains('tags', [unitTag(nome)])
        .order('name').order('id')
        .range(de, ate), 'carregar os clientes')
    },
    [`branch-clients-v2-${branchId}`],
    { revalidate: 120, tags: [`clients:${tenantId}`] },
  )()
}

// ─── A última visita de cada cliente (a lista de clientes) ───────────────────
// Agregada no banco (`ultimas_visitas`, 2026-10-22). Era a lista dos 800
// (unidade) ou 1000 (rede) concluídos mais recentes: quem não tinha vindo
// nesse intervalo aparecia "Sem visitas", igual a quem nunca veio.
export function getCachedUltimasVisitas(tenantId: string, branchId: string | null) {
  return unstable_cache(
    async (): Promise<{ client_id: string; ultima: string }[]> => {
      const admin = createAdminClient()
      return lerTodas((de, ate) => admin
        .rpc('ultimas_visitas', { p_tenant: tenantId, p_branch: branchId })
        .order('client_id')
        .range(de, ate), 'carregar a última visita dos clientes') as Promise<{ client_id: string; ultima: string }[]>
    },
    [`ultimas-visitas-${tenantId}-${branchId ?? 'rede'}`],
    { revalidate: 300, tags: [`appointments:${tenantId}`] },
  )()
}

// ─── Network (admin): todos os clientes da rede ───────────────────────────────
export function getCachedNetworkClients(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      // Todas, em páginas (ver getCachedBranchClients).
      return lerTodas((de, ate) => admin
        .from('clients')
        .select('id, name, phone, tags, is_active, created_at, cliente_desde, branch_id, branches!branch_id(id, name)')
        .eq('tenant_id', tenantId)
        .order('name').order('id')
        .range(de, ate), 'carregar os clientes')
    },
    [`network-clients-v2-${tenantId}`],
    { revalidate: 120, tags: [`clients:${tenantId}`] },
  )()
}

// ─── Network (admin): branches ativas ────────────────────────────────────────
export function getCachedNetworkBranches(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('branches')
        // O slug resolve o `?unidade=<slug>` da rede (J-54) — a chave do cache
        // mudou junto, para não servir a forma antiga, sem ele.
        .select('id, name, slug')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'), 'carregar as unidades')
      return data ?? []
    },
    [`network-branches-v2-${tenantId}`],
    { revalidate: 600, tags: [`branches:${tenantId}`] },
  )()
}

// ─── Filial por slug (lookup feito em quase toda página de filial) ────────────
export function getCachedBranchBySlug(slug: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('branches')
        .select('id, name, slug')
        .eq('slug', slug)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle(), 'buscar a unidade')
      return data
    },
    [`branch-by-slug-${tenantId}-${slug}`],
    { revalidate: 600, tags: [`branches:${tenantId}`] },
  )()
}

// ─── Permissões por cargo (resolvidas no getTenantContext → toda navegação) ────
// `scope` faz parte da linha: sem ele no tipo, um `.map` futuro o descarta sem
// erro de compilação e todo cargo volta a ser "vê tudo" em silêncio.
export type CachedRolePermission = {
  module: string
  level:  'NONE' | 'VIEW' | 'MANAGE'
  scope:  'OWN' | 'ALL' | null
}

export function getCachedRolePermissions(tenantId: string, roleId: string) {
  return unstable_cache(
    async (): Promise<CachedRolePermission[]> => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('role_permissions')
        .select('module, level, scope')
        .eq('tenant_id', tenantId)
        .eq('role_id', roleId), 'carregar as permissões dos cargos')
      return (data ?? []) as CachedRolePermission[]
    },
    [`role-permissions-${tenantId}-${roleId}`],
    { revalidate: 600, tags: [`permissions:${tenantId}`] },
  )()
}

// ─── Abas de Relatórios por cargo ─────────────────────────────────────────────
// Mesma tag das permissões: salvar a matriz do cargo invalida as duas coisas de
// uma vez, e ninguém fica com a aba velha enquanto o cache não expira.
export function getCachedRoleReportTabs(tenantId: string, roleId: string) {
  return unstable_cache(
    async (): Promise<{ tab: string }[]> => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('role_report_tabs')
        .select('tab')
        .eq('tenant_id', tenantId)
        .eq('role_id', roleId), 'carregar as abas de relatório')
      return (data ?? []) as { tab: string }[]
    },
    [`role-report-tabs-${tenantId}-${roleId}`],
    { revalidate: 600, tags: [`permissions:${tenantId}`] },
  )()
}

// ─── Procedimentos da filial (base da rede + locais) ──────────────────────────
export function getCachedBranchProcedures(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const lidos = await ler(admin
        .from('procedures')
        .select(`id, name, category, duration_min, price, ${COLUNAS_DA_OFERTA}`)
        .eq('tenant_id', tenantId)
        .or(`branch_id.is.null,branch_id.eq.${branchId}`)
        .eq('is_active', true)
        .order('name'), 'carregar os procedimentos') as ({ id: string; name: string; category: string; duration_min: number; price: number; branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null }[] | null)
      // Só o que a unidade OFERECE (D7 da 13ª, F65): o da rede restrito a
      // outras unidades não aparece no agendar, no card nem no checkout.
      const oferecidos = (lidos ?? []).filter(p => ofereceNaUnidade(p, branchId))
        .map(p => ({ id: p.id, name: p.name, category: p.category, duration_min: p.duration_min, price: p.price }))
      // Quem realiza cada um (por-01): a agenda avisa quando a escolhida não
      // realiza. Gravar o procedimento expira a tag `procedures:<rede>`.
      const [realizam, daUnidade] = await Promise.all([
        quemRealizaOsProcedimentos(admin, oferecidos.map(p => p.id)),
        // O preço DA UNIDADE, quando ela tem um (D2 da 9ª). Gravar o
        // procedimento (e os preços por unidade) expira a mesma tag.
        precosDaUnidade(admin, branchId),
      ])
      return oferecidos.map(p => ({
        ...p, price: precoNaUnidade(p.price, daUnidade.get(p.id)), realizam: realizam.get(p.id) ?? [],
      }))
    },
    [`branch-procedures-v4-${branchId}`],
    { revalidate: 300, tags: [`procedures:${tenantId}`] },
  )()
}

// ─── Procedimentos da rede (lista leve id/name — admin CRM, notificações) ─────
export function getCachedNetworkProcedures(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('procedures')
        .select('id, name, category')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'), 'carregar os procedimentos')
      return data ?? []
    },
    [`network-procedures-${tenantId}`],
    { revalidate: 300, tags: [`procedures:${tenantId}`] },
  )()
}

// ─── Profissionais da unidade (quem atende clientes nela) ────────────────────
/**
 * Quem atende NA unidade: quem tem a unidade marcada no "Atende" da Equipe
 * (`users.atende_em`, decisão 2 do Heitor sobre a 8ª simulação, 2026-11-06:
 * "o atende vira um checklist com todas as unidades, as que estiverem marcadas
 * ficam disponiveis"). Até ali eram os da unidade e os da REDE, que atendiam em
 * todas (D1 de 2026-10-28) — e a Talita, da Água Verde, só cobria o Batel
 * ganhando a rede inteira. Toda lista de "quem atende aqui" usa este filtro
 * (num `.or()`). A tag é da REDE: mexer num membro expira todas as unidades.
 */
export function filtroDeQuemAtendeNaUnidade(branchId: string): string {
  return `atende_em.cs.{${branchId}}`
}

export function getCachedBranchProfessionals(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('users')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .or(filtroDeQuemAtendeNaUnidade(branchId))
        .eq('provides_services', true)
        .eq('is_active', true)
        .order('name'), 'carregar a equipe')
      return data ?? []
    },
    [`branch-professionals-da-unidade-${branchId}`],
    { revalidate: 300, tags: [`professionals:${tenantId}`] },
  )()
}

// ─── Salas da filial ──────────────────────────────────────────────────────────
export function getCachedRoomsByBranch(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('rooms')
        .select('id, name')
        .eq('branch_id', branchId)
        .eq('is_active', true), 'carregar as salas')
      return data ?? []
    },
    [`branch-rooms-${branchId}`],
    { revalidate: 600, tags: [`rooms:${tenantId}`] },
  )()
}

// ─── Catálogo de produtos (colunas estáveis — NÃO inclui quantidade de estoque)
export function getCachedProductsReference(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const data = await ler(admin
        .from('products')
        .select('id, name, sku, unit, branch_id, consumption_unit, units_per_package, cost_price, uso')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'), 'carregar os produtos')
      return data ?? []
    },
    [`products-reference-v2-${tenantId}`],
    { revalidate: 300, tags: [`products:${tenantId}`] },
  )()
}

// ─── Perfil do cliente — as 11 queries paralelas da página de detalhe ─────────
// TTL curto (60s) + tags de tenant (clients/appointments) que as mutations já
// invalidam. Retorna os arrays crus; a página faz todo o mapeamento/transform.
export function getCachedClientProfileData(clientId: string, branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const [
        appts, medRecord, pkgs, docsRaw,
        branchesRaw,
        activePlansRaw, allPlansHistRaw,
      ] = await Promise.all([
        admin
          .from('appointments')
          .select('id, branch_id, scheduled_at, status, price, treatment_plan_id, created_at, completed_at, cancelled_at, confirmed_at, arrived_at, professional_id, client_confirmed_at, procedure_rating, client_rating, client_feedback, procedures(name), professional:users!professional_id(name)')
          .eq('client_id', clientId)
          .order('scheduled_at', { ascending: false })
          .limit(60),
        admin
          .from('medical_records')
          .select('id, general_anamnesis, entries:medical_record_entries(appointment_id, notes, intercurrences, queixas, form_data, created_at)')
          .eq('client_id', clientId)
          .maybeSingle(),
        admin
          .from('client_packages')
          // `purchased_at` é a data do "Pacote adquirido" no histórico — sem ela
          // o evento nunca aparecia (a página lia um campo que não vinha).
          .select('id, total_sessions, used_sessions, expires_at, purchased_at, cancelado_em, cancelamento_motivo, cancelamento, de_fora, usadas_antes, valor_referencia, service_packages(name, procedure_id, price, procedures(name, duration_min)), package_sessions(status, appointment_id)')
          .eq('client_id', clientId)
          .order('purchased_at', { ascending: false })
          .limit(10),
        admin
          .from('client_documents')
          .select('id, name, category, file_path, file_name, file_size, mime_type, uploaded_by:users!uploaded_by(name), created_at, enviado_em, enviado_por_nome, atendimento:appointments!client_documents_appointment_id_fkey(id, scheduled_at, procedures(name))')
          .eq('client_id', clientId)
          .is('apagado_em', null)
          .order('created_at', { ascending: false }),
        admin
          .from('branches')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('name'),
        admin
          .from('treatment_plans')
          .select('id, status, treatment_plan_sessions(id, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min)))')
          .eq('client_id', clientId)
          .eq('status', 'ACCEPTED')
          .order('created_at', { ascending: false })
          .limit(1),
        admin
          .from('treatment_plans')
          .select('id, status, created_at, updated_at, name, cancelado_em, cancelamento_motivo, cancelamento')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ])

      return {
        appts:          appts.data,
        medRecord:      medRecord.data,
        pkgs:           pkgs.data,
        docsRaw:        docsRaw.data,
        branchesRaw:    branchesRaw.data,
        activePlansRaw: activePlansRaw.data,
        allPlansHistRaw: allPlansHistRaw.data,
      }
    },
    [`client-profile-${clientId}`],
    { revalidate: 60, tags: [`clients:${tenantId}`, `appointments:${tenantId}`, `client:${clientId}`] },
  )()
}
