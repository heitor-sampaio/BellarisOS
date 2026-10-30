import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, tentar } from '@/lib/db'
import { escolherEntrada, ROTA_DO_SELETOR } from '@/lib/clientes/entrada'
import { fichasQueAbrem } from '@/lib/clientes/disponibilidade'

/**
 * O destino da cliente depois do login — um lugar só para a tela de login, a
 * sessão do app, `/auth/redirect` e o `/` (antes, quatro cópias que liam a
 * unidade da ficha do token). A regra é `escolherEntrada`; aqui a leitura
 * FRESCA (a última entrada muda a cada visita, não vai para cache).
 * Sem ficha com unidade: null (quem chama segue o caminho de reserva).
 */
export async function destinoDaCliente(authId: string): Promise<string | null> {
  const linhas = await ler(createAdminClient()
    .from('clients')
    .select('id, tenant_id, portal_ligado_em, portal_ultima_entrada_em, branches(slug)')
    .eq('auth_id', authId), 'buscar as fichas da cliente')
  const fichas = (linhas ?? []).map(c => ({
    clientId: c.id as string,
    tenantId: c.tenant_id as string,
    slug: (c.branches as unknown as { slug: string } | null)?.slug ?? null,
    ligadaEm: (c.portal_ligado_em as string | null) ?? null,
    ultimaEntradaEm: (c.portal_ultima_entrada_em as string | null) ?? null,
  }))
  // Clínica fechada (bloqueada, sem o portal no plano) fica fora da escolha —
  // a não ser que nenhuma abra: aí a de sempre, e o portão mostra o aviso.
  const abertas = await fichasQueAbrem(fichas)
  const entrada = escolherEntrada(abertas.length ? abertas : fichas)
  if (!entrada) return null
  return entrada.tipo === 'seletor' ? ROTA_DO_SELETOR : `/${entrada.ficha.slug}/cliente`
}

/**
 * Ela abriu o portal desta clínica: anota a hora (é a "última clínica usada").
 * Com folga de 10 min — a condição está no próprio update, sem ler antes —
 * para não gravar a cada tela. Acessório: falhar não derruba o portal.
 */
export async function registrarEntradaNoPortal(clientId: string, opcoes: { escolheuAgora?: boolean } = {}): Promise<void> {
  const dezMinutos = new Date(Date.now() - 10 * 60_000).toISOString()
  // `last_app_login_at` é o "último acesso" do pacote LGPD (J-65: nada o
  // gravava, e o titular via sempre nulo) — a mesma entrada, por clínica.
  const agora = new Date().toISOString()
  let consulta = createAdminClient().from('clients')
    .update({ portal_ultima_entrada_em: agora, last_app_login_at: agora })
    .eq('id', clientId)
  // Escolher no seletor sempre conta: é a "última clínica usada" de agora.
  if (!opcoes.escolheuAgora) consulta = consulta.or(`portal_ultima_entrada_em.is.null,portal_ultima_entrada_em.lt.${dezMinutos}`)
  await tentar(consulta, 'anotar a entrada no portal')
}
