import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'
import { EntradaDaComissaoDoProcedimento } from './config'
import type { z } from 'zod'

/**
 * A comissão de um procedimento (2026-10-15), gravada pelo chip da tabela
 * (`salvarComissaoDoProcedimento`) ou junto com o procedimento, no modal de
 * criar/editar (`addProcedure`/`updateProcedure`). A trava e a gravação moram
 * aqui para as duas portas serem a mesma.
 */

export type EntradaDaComissao = z.infer<typeof EntradaDaComissaoDoProcedimento>

/** Quanto cada um ganha é do financeiro (§9.7), e o conjunto do procedimento é da rede. */
export function podeMudarComissaoDoProcedimento(ctx: TenantContext): boolean {
  return can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes') && ctx.branchId === null
}

export const SEM_PERMISSAO_DE_COMISSAO = 'Seu cargo não muda a comissão dos procedimentos.'

/**
 * O campo `comissao` do formulário do procedimento: ausente = não mexe na
 * comissão. Presente, confere a permissão e valida ANTES de o procedimento ser
 * gravado — a recusa não deixa meio cadastro.
 */
export function comissaoDoFormulario(ctx: TenantContext, formData: FormData):
  { entrada: EntradaDaComissao | null; error?: undefined } | { error: string; entrada?: undefined } {
  const bruto = formData.get('comissao')
  if (bruto == null || bruto === '') return { entrada: null }
  if (!podeMudarComissaoDoProcedimento(ctx)) return { error: SEM_PERMISSAO_DE_COMISSAO }
  let json: unknown
  try { json = JSON.parse(String(bruto)) } catch { return { error: 'Comissão inválida.' } }
  const lido = EntradaDaComissaoDoProcedimento.safeParse(json)
  if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Comissão inválida.' }
  return { entrada: lido.data }
}

/** Substitui o conjunto inteiro do procedimento (a função confere procedimento e profissionais da rede). */
export async function gravarComissaoDoProcedimento(ctx: TenantContext, procedimentoId: string, entrada: EntradaDaComissao) {
  await gravar(createAdminClient().rpc('comissao_do_procedimento_definir', {
    p_tenant: ctx.tenantId!, p_procedimento: procedimentoId,
    p_geral: entrada.modo === 'GERAL' ? entrada.geral : null,
    p_profissionais: entrada.modo === 'POR_PROFISSIONAL' ? entrada.profissionais : [],
    p_ator: ctx.internalUserId ?? null,
  }), 'salvar a comissão do procedimento')
}
