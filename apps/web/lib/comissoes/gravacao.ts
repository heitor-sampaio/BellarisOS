import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { adminsDaRede, souAdminDaRede } from '@/lib/equipe/admin-da-rede'
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

export const RECUSA_DA_COMISSAO_DA_ADMIN = 'Só quem é Admin da rede altera a comissão de uma Admin da rede.'

/**
 * O valor de uma Admin da rede no procedimento (a exceção dela) só muda pelas
 * mãos de outra Admin — "somente admin pode alterar admin" (revisão do Heitor,
 * 2026-10-29, CLAUDE.md §11). A Equipe já recusava (`recusaDeMexerNaAdmin`),
 * mas o procedimento grava o conjunto INTEIRO dos profissionais dele, e quem
 * tinha o Financeiro em Gerenciar punha, mudava ou tirava o da Admin por aqui
 * (achado da compilação da 5ª simulação, 2026-11-01).
 *
 * Compara o que a Admin tem hoje com o que fica depois: o envio que deixa o
 * dela como estava passa (a tela manda a lista toda). "A mesma para todos"
 * tira as exceções — inclusive a dela, e por isso conta como mexer. A regra
 * geral nova de um procedimento em que a Admin não tem valor próprio não é
 * mexer NELA: é a do procedimento.
 */
export async function recusaDaComissaoDaAdmin(
  ctx: TenantContext, procedimentoId: string | null, entrada: EntradaDaComissao,
): Promise<string | null> {
  const admin = createAdminClient()
  if (await souAdminDaRede(admin, ctx)) return null
  const admins = await adminsDaRede(admin, ctx.tenantId!)
  if (!admins.size) return null
  const antes = procedimentoId
    ? ((await ler(admin.from('commission_rules').select('professional_id, type, value')
        .eq('tenant_id', ctx.tenantId!).eq('procedure_id', procedimentoId).eq('is_active', true)
        .in('professional_id', [...admins]), 'ler a comissão das Admins no procedimento')) ?? []) as { professional_id: string; type: string; value: number | string }[]
    : []
  const depois = entrada.modo === 'POR_PROFISSIONAL' ? entrada.profissionais.filter(p => admins.has(p.professional_id)) : []
  const chave = (id: string, tipo: string, valor: number | string) => `${id}|${tipo}|${Number(valor)}`
  const tinha = new Set(antes.map(r => chave(r.professional_id, r.type, r.value)))
  const fica  = new Set(depois.map(p => chave(p.professional_id, p.tipo, p.valor)))
  const igual = tinha.size === fica.size && [...tinha].every(k => fica.has(k))
  return igual ? null : RECUSA_DA_COMISSAO_DA_ADMIN
}

/** Substitui o conjunto inteiro do procedimento (a função confere procedimento e profissionais da rede). */
export async function gravarComissaoDoProcedimento(ctx: TenantContext, procedimentoId: string, entrada: EntradaDaComissao) {
  // A segunda linha: quem chama confere antes (para a recusa não deixar meio cadastro).
  const recusa = await recusaDaComissaoDaAdmin(ctx, procedimentoId, entrada)
  if (recusa) throw new Error(recusa)
  await gravar(createAdminClient().rpc('comissao_do_procedimento_definir', {
    p_tenant: ctx.tenantId!, p_procedimento: procedimentoId,
    p_geral: entrada.modo === 'GERAL' ? entrada.geral : null,
    p_profissionais: entrada.modo === 'POR_PROFISSIONAL' ? entrada.profissionais : [],
    p_ator: ctx.internalUserId ?? null,
  }), 'salvar a comissão do procedimento')
}
