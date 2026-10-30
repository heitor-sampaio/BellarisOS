'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { nomeDeSala } from '@/lib/agenda/salas'
import type { TenantContext } from '@estetica-os/types'

/**
 * As salas da unidade (D5, decisão do Heitor, 2026-10-30): Configurações →
 * Unidades → a unidade. Criar, renomear, desativar e reativar — a sala não se
 * apaga (os agendamentos de antes apontam para ela). Quem mexe é quem
 * configura (`settings: MANAGE`), na unidade ao alcance (§11), e a gravação é
 * do SERVIDOR: a sessão não grava sala pelo PostgREST (migration
 * 20261029001401).
 */

type Resultado = { error?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOME_REPETIDO = 'Já existe uma sala com este nome nesta unidade.'

/** A unidade é da rede e está ao alcance? */
async function unidadeAoAlcance(ctx: TenantContext, branchId: unknown): Promise<boolean> {
  if (typeof branchId !== 'string' || !UUID.test(branchId) || !alcancaUnidade(ctx, branchId)) return false
  const unidade = await ler(createAdminClient().from('branches').select('id')
    .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  return !!unidade
}

/** A sala pelo id, se for de uma unidade da rede ao alcance. */
async function salaAoAlcance(ctx: TenantContext, salaId: unknown): Promise<{ id: string; branch_id: string } | null> {
  if (typeof salaId !== 'string' || !UUID.test(salaId)) return null
  const sala = await ler(createAdminClient().from('rooms').select('id, branch_id, branches!inner(tenant_id)')
    .eq('id', salaId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a sala') as { id: string; branch_id: string } | null
  if (!sala || !alcancaUnidade(ctx, sala.branch_id)) return null
  return sala
}

function expirar(ctx: TenantContext, branchId: string) {
  revalidateTag(`rooms:${ctx.tenantId!}`, { expire: 0 })
  revalidatePath(`/admin/branches/${branchId}`)
}

function recusaDoBanco(e: { code?: string; message?: string } | null): string | null {
  if (!e) return null
  if (e.code === '23505') return NOME_REPETIDO
  return mensagemDoErro(e)
}

export async function criarSala(branchId: string, nome: string): Promise<Resultado & { id?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const lido = nomeDeSala(nome)
  if ('erro' in lido) return { error: lido.erro }
  if (!(await unidadeAoAlcance(ctx, branchId))) return { error: 'Unidade não encontrada.' }

  const { data, error } = await createAdminClient().from('rooms')
    .insert({ branch_id: branchId, name: lido.nome }).select('id').single<{ id: string }>()
  const recusa = recusaDoBanco(error)
  if (recusa || !data) return { error: recusa ?? 'Não foi possível criar a sala.' }
  expirar(ctx, branchId)
  return { id: data.id }
}

export async function renomearSala(salaId: string, nome: string): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const lido = nomeDeSala(nome)
  if ('erro' in lido) return { error: lido.erro }
  const sala = await salaAoAlcance(ctx, salaId)
  if (!sala) return { error: 'Sala não encontrada.' }

  const { data, error } = await createAdminClient().from('rooms')
    .update({ name: lido.nome }).eq('id', sala.id).select('id')
  const recusa = recusaDoBanco(error)
  if (recusa) return { error: recusa }
  if (!data?.length) return { error: 'Sala não encontrada.' }
  expirar(ctx, sala.branch_id)
  return {}
}

/** Desativar tira a sala do agendar (os agendamentos que já têm a sala ficam como estão). */
export async function mudarSituacaoDaSala(salaId: string, ativa: boolean): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  if (typeof ativa !== 'boolean') return { error: 'Situação inválida.' }
  const sala = await salaAoAlcance(ctx, salaId)
  if (!sala) return { error: 'Sala não encontrada.' }

  const { data, error } = await createAdminClient().from('rooms')
    .update({ is_active: ativa }).eq('id', sala.id).select('id')
  const recusa = recusaDoBanco(error)
  if (recusa) return { error: recusa }
  if (!data?.length) return { error: 'Sala não encontrada.' }
  expirar(ctx, sala.branch_id)
  return {}
}
