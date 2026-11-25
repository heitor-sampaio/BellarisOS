import { ler } from '@/lib/db'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A unidade OFERECE o procedimento? (D7 da 13ª simulação, F65.) A regra é uma
 * só — a do quadro, da busca universal e do Copilot:
 * - o procedimento DA unidade (`branch_id` = ela);
 * - o da REDE (`branch_id` nulo) sem disponibilidade cadastrada (vale em todas);
 * - o da rede com a unidade na disponibilidade (`procedure_branch_availability`).
 *
 * O procedimento de OUTRA unidade não é oferecido. Até 2026-11-12 o agendar,
 * o Vender, o checkout e o app listavam a Bambuterapia no Batel, onde ela não
 * é feita, e o núcleo gravava.
 */
export function ofereceNaUnidade(
  proc: { branch_id: string | null; procedure_branch_availability?: { branch_id: string }[] | null },
  unidadeId: string,
): boolean {
  if (proc.branch_id !== null) return proc.branch_id === unidadeId
  const av = proc.procedure_branch_availability ?? []
  return !av.length || av.some(a => a.branch_id === unidadeId)
}

/** O select que `ofereceNaUnidade` precisa, para pôr junto do resto da consulta. */
export const COLUNAS_DA_OFERTA = 'branch_id, procedure_branch_availability(branch_id)'

/**
 * A recusa de agendar (ou vender) o procedimento numa unidade que não o faz —
 * nula quando faz. O procedimento que não é da rede não se recusa aqui (quem
 * chama já confere: "Procedimento não encontrado").
 */
export async function recusaDoProcedimentoNaUnidade(
  admin: Admin, tenantId: string, procedureId: string, unidadeId: string,
): Promise<string | null> {
  const [proc, unidade] = await Promise.all([
    ler(admin.from('procedures').select(`name, ${COLUNAS_DA_OFERTA}`)
      .eq('id', procedureId).eq('tenant_id', tenantId).maybeSingle(), 'conferir onde o procedimento é feito') as Promise<
      { name: string; branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null } | null>,
    ler(admin.from('branches').select('name').eq('id', unidadeId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a unidade') as Promise<{ name: string } | null>,
  ])
  if (!proc || ofereceNaUnidade(proc, unidadeId)) return null
  return `${proc.name} não é feito na unidade ${unidade?.name ?? 'escolhida'}. Escolha outra unidade ou outro procedimento.`
}

/**
 * A recusa de pôr num PLANO o procedimento que a unidade do plano não faz (D4
 * da 14ª simulação, F73) — nula quando todos são feitos lá. Uma leitura só,
 * para as sessões inteiras: o editor do plano já lista só o catálogo da
 * unidade do plano (`procedimentosParaPlano` com a unidade), e o servidor que
 * grava as sessões confere de novo. O procedimento que não é da rede responde
 * como inexistente.
 *
 * O que JÁ estava no plano e a unidade deixou de fazer NÃO se recusa: fica à
 * vista no editor com a marca "(não é feito nesta unidade)", e o plano se salva
 * com ele — a marca é o aviso (princípio 2, "no máximo, avisar"; a revisão das
 * perguntas de 24/11, Q24 do catálogo de Atendimento — decisão do Claude). Até
 * 24/11 o plano antigo só se salvava tirando o item. `jaGravado` diz onde ler o
 * que estava: o plano (`planoId`) ou o rascunho da avaliação (`avaliacaoId`);
 * quem chama já conferiu a rede dele. Agendar a sessão numa unidade que não faz
 * o procedimento segue recusado pelo núcleo (`conferirPecasDoAgendamento`).
 */
export async function recusaDosProcedimentosDoPlano(
  admin: Admin, tenantId: string, unidadeId: string, procedureIds: string[],
  jaGravado: { planoId?: string | null; avaliacaoId?: string | null } = {},
): Promise<string | null> {
  const ids = [...new Set(procedureIds.filter(Boolean))]
  if (!ids.length) return null
  const [procs, unidade] = await Promise.all([
    ler(admin.from('procedures').select(`id, name, ${COLUNAS_DA_OFERTA}`)
      .in('id', ids).eq('tenant_id', tenantId), 'conferir onde os procedimentos do plano são feitos') as Promise<
      { id: string; name: string; branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null }[] | null>,
    ler(admin.from('branches').select('name').eq('id', unidadeId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a unidade do plano') as Promise<{ name: string } | null>,
  ])
  const lidos = procs ?? []
  if (lidos.length < ids.length) return 'Procedimento do plano não encontrado.'
  const fora = lidos.filter(p => !ofereceNaUnidade(p, unidadeId))
  if (!fora.length) return null
  const jaNoPlano = await procedimentosJaNoPlano(admin, jaGravado)
  const novo = fora.find(p => !jaNoPlano.has(p.id))
  if (!novo) return null
  return `${novo.name} não é feito na unidade ${unidade?.name ?? 'do plano'}. Escolha outra unidade ou outro procedimento.`
}

/** Os procedimentos que o plano já tem gravados (o plano, ou o rascunho da avaliação). */
async function procedimentosJaNoPlano(
  admin: Admin, de: { planoId?: string | null; avaliacaoId?: string | null },
): Promise<Set<string>> {
  const planos = de.planoId ? [de.planoId]
    : de.avaliacaoId
      ? ((await ler(admin.from('treatment_plans').select('id').eq('evaluation_appointment_id', de.avaliacaoId),
          'buscar o plano da avaliação')) as { id: string }[] | null ?? []).map(p => p.id)
      : []
  if (!planos.length) return new Set()
  const linhas = await ler(admin.from('treatment_plan_session_procedures')
    .select('procedure_id, treatment_plan_sessions!inner(plan_id)')
    .in('treatment_plan_sessions.plan_id', planos), 'ler os procedimentos que o plano já tem') as { procedure_id: string }[] | null
  return new Set((linhas ?? []).map(l => l.procedure_id))
}
