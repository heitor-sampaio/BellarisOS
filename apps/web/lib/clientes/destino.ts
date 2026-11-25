import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, tentar } from '@/lib/db'
import { escolherEntrada, ROTA_DO_SELETOR } from '@/lib/clientes/entrada'
import { fichasQueAbrem } from '@/lib/clientes/disponibilidade'
import { unidadeDoPortal } from '@/lib/clientes/unidade-do-portal'

/**
 * O destino da cliente depois do login — um lugar só para a tela de login, a
 * sessão do app, `/auth/redirect` e o `/` (antes, quatro cópias que liam a
 * unidade da ficha do token). A regra é `escolherEntrada`; aqui a leitura
 * FRESCA (a última entrada muda a cada visita, não vai para cache).
 * Sem ficha com unidade: null (quem chama segue o caminho de reserva).
 */
export async function destinoDaCliente(authId: string): Promise<string | null> {
  const entrada = await entradaDaCliente(authId)
  if (!entrada) return null
  return entrada.tipo === 'seletor' ? ROTA_DO_SELETOR : `/${entrada.ficha.slug}/cliente`
}

/**
 * A entrada da cliente: o portal de UMA ficha (a rede do destino) ou o
 * seletor — a regra do `destinoDaCliente`, com a ficha. A Auditoria registra a
 * entrada na rede em que ela entra (`lib/clientes/entrada-na-auditoria.ts`).
 */
export async function entradaDaCliente(authId: string) {
  const admin = createAdminClient()
  const linhas = await ler(admin
    .from('clients')
    .select('id, tenant_id, portal_ligado_em, portal_ultima_entrada_em, portal_ultima_unidade')
    .eq('auth_id', authId), 'buscar as fichas da cliente')
  // O endereço de cada rede: a última unidade que ela usou no portal, senão a
  // primeira ativa — nunca a unidade de cadastro (auditoria das regras, 18/11:
  // "o cliente não é da unidade, o cliente é da rede"; `unidadeDoPortal`).
  const redes = [...new Set((linhas ?? []).map(c => c.tenant_id as string))]
  const unidades = redes.length
    ? ((await ler(admin.from('branches').select('id, slug, name, tenant_id')
        .in('tenant_id', redes).eq('is_active', true).order('name').order('id'), 'buscar as unidades das redes da cliente')) ?? []) as { id: string; slug: string; name: string; tenant_id: string }[]
    : []
  const fichas = (linhas ?? []).map(c => ({
    clientId: c.id as string,
    tenantId: c.tenant_id as string,
    slug: unidadeDoPortal((c.portal_ultima_unidade as string | null) ?? null, unidades.filter(u => u.tenant_id === c.tenant_id))?.slug ?? null,
    ligadaEm: (c.portal_ligado_em as string | null) ?? null,
    ultimaEntradaEm: (c.portal_ultima_entrada_em as string | null) ?? null,
  }))
  // Clínica fechada (bloqueada, sem o portal no plano) fica fora da escolha —
  // a não ser que nenhuma abra: aí a de sempre, e o portão mostra o aviso.
  const abertas = await fichasQueAbrem(fichas)
  return escolherEntrada(abertas.length ? abertas : fichas)
}

/**
 * Ela abriu o portal desta clínica: anota a hora (é a "última clínica usada").
 * Com folga de 10 min — a condição está no próprio update, sem ler antes —
 * para não gravar a cada tela. Acessório: falhar não derruba o portal.
 *
 * E a UNIDADE do endereço (`portal_ultima_unidade`): é por ela que o próximo
 * login entra (auditoria das regras, 18/11 — era a unidade de cadastro). Só
 * grava quando muda.
 */
export async function registrarEntradaNoPortal(
  clientId: string, opcoes: { escolheuAgora?: boolean; unidadeId?: string | null } = {},
): Promise<void> {
  const dezMinutos = new Date(Date.now() - 10 * 60_000).toISOString()
  // `last_app_login_at` é o "último acesso" do pacote LGPD (J-65: nada o
  // gravava, e o titular via sempre nulo) — a mesma entrada, por clínica.
  const agora = new Date().toISOString()
  const admin = createAdminClient()
  let consulta = admin.from('clients')
    .update({ portal_ultima_entrada_em: agora, last_app_login_at: agora })
    .eq('id', clientId)
  // Escolher no seletor sempre conta: é a "última clínica usada" de agora.
  if (!opcoes.escolheuAgora) consulta = consulta.or(`portal_ultima_entrada_em.is.null,portal_ultima_entrada_em.lt.${dezMinutos}`)
  await tentar(consulta, 'anotar a entrada no portal')
  if (opcoes.unidadeId) {
    await tentar(admin.from('clients').update({ portal_ultima_unidade: opcoes.unidadeId })
      .eq('id', clientId).or(`portal_ultima_unidade.is.null,portal_ultima_unidade.neq.${opcoes.unidadeId}`),
    'anotar a unidade do portal')
  }
}
