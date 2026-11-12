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
