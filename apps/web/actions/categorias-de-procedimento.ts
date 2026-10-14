'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * As categorias de procedimento da rede (2026-10-14), Procedimentos →
 * Categorias. Eram quinze fixas no código; agora a rede cria, renomeia — em
 * todos os procedimentos, e junta se o nome já existe — e arquiva (sai das
 * opções, fica em quem já está nela).
 *
 * Gerencia quem gerencia o catálogo: `procedures: MANAGE` e abrangência de
 * rede, a mesma trava de criar procedimento.
 */

export interface CategoriaDeProcedimento {
  id: string; nome: string; arquivada: boolean; procedimentos: number
}

async function quemGerencia() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'MANAGE')
  if (ctx.branchId !== null) throw semAcesso()
  return ctx
}

function validarNome(bruto: unknown): { nome: string } | { error: string } {
  const nome = String(bruto ?? '').trim().replace(/\s+/g, ' ')
  if (!nome) return { error: 'Dê um nome à categoria.' }
  if (nome.length > 60) return { error: 'A categoria tem no máximo 60 caracteres.' }
  return { nome }
}

/** A lista da janela, com quantos procedimentos usam cada uma. */
export async function listarCategoriasDeProcedimento(): Promise<CategoriaDeProcedimento[]> {
  const ctx = await quemGerencia()
  const { data, error } = await createAdminClient().rpc('categorias_de_procedimento_da_rede', { p_tenant: ctx.tenantId! })
  if (error) throw new Error(`Ler as categorias de procedimento: ${error.message}`)
  return ((data ?? []) as { id: string; nome: string; arquivada_em: string | null; procedimentos: number }[])
    .map(c => ({ id: c.id, nome: c.nome, arquivada: !!c.arquivada_em, procedimentos: Number(c.procedimentos) }))
}

export async function criarCategoriaDeProcedimento(bruto: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await quemGerencia()
  const v = validarNome(bruto)
  if ('error' in v) return { ok: false, error: v.error }
  const { error } = await createAdminClient().from('procedure_categories').insert({ tenant_id: ctx.tenantId!, nome: v.nome })
  if (error?.code === '23505') return { ok: false, error: `A categoria "${v.nome}" já existe.` }
  if (error) return { ok: false, error: `Não foi possível criar a categoria: ${error.message}` }
  return { ok: true }
}

export async function renomearCategoriaDeProcedimento(id: string, bruto: string): Promise<
  { ok: true; nome: string; procedimentos: number; juntou: boolean } | { ok: false; error: string }
> {
  const ctx = await quemGerencia()
  const v = validarNome(bruto)
  if ('error' in v) return { ok: false, error: v.error }
  const admin = createAdminClient()
  const todas = await ler(admin.from('procedure_categories').select('id, nome').eq('tenant_id', ctx.tenantId!),
    'ler as categorias da rede') as { id: string; nome: string }[] | null
  const atual = (todas ?? []).find(c => c.id === String(id ?? ''))
  if (!atual) return { ok: false, error: 'Categoria não encontrada nesta rede.' }
  if (atual.nome === v.nome) return { ok: true, nome: v.nome, procedimentos: 0, juntou: false }
  // Já existe outra com o nome novo (sem caixa)? Então as duas viram uma.
  const juntou = (todas ?? []).some(c => c.id !== atual.id && c.nome.toLowerCase() === v.nome.toLowerCase())
  const { data, error } = await admin.rpc('renomear_categoria_de_procedimento', {
    p_tenant: ctx.tenantId!, p_categoria: atual.id, p_novo: v.nome,
  })
  if (error) return { ok: false, error: `Não foi possível renomear: ${error.message}` }
  const r = ((data ?? []) as { nome_final: string; procedimentos: number }[])[0]
  return { ok: true, nome: r?.nome_final ?? v.nome, procedimentos: Number(r?.procedimentos ?? 0), juntou }
}

/** Arquivar tira das opções do cadastro; o procedimento que já está nela continua. */
export async function arquivarCategoriaDeProcedimento(id: string, arquivar: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await quemGerencia()
  const { data, error } = await createAdminClient().from('procedure_categories')
    .update({ arquivada_em: arquivar ? new Date().toISOString() : null })
    .eq('id', String(id ?? '')).eq('tenant_id', ctx.tenantId!).select('id')
  if (error) return { ok: false, error: `Não foi possível ${arquivar ? 'arquivar' : 'reativar'}: ${error.message}` }
  if (!data?.length) return { ok: false, error: 'Categoria não encontrada nesta rede.' }
  return { ok: true }
}
