'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { semAcesso } from '@/lib/sem-acesso'
import { normalizeFormSchema, validateFormSchema, flattenFields } from '@/lib/anamnesis'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral } from '@/lib/pre-atendimento/ficha'

/**
 * O pré-atendimento pela equipe (2026-10-20, decisões do Heitor): a ficha
 * universal da rede, o envio ao agendar e a anamnese do atendimento.
 *
 * A ficha e o envio são da REDE (uma ficha por rede): mudam só quem tem
 * `forms: MANAGE` e abrangência de rede — como os procedimentos e as demais
 * configurações. Personalizar a ficha é do plano (`fichas`), como as outras.
 */

type Resultado = { ok: true } | { error: string }

const ROTULO_FORA: Record<string, string> = { photo: 'foto', injectable_map: 'planejador de injetáveis' }

export async function salvarFichaDePreAtendimento(input: { id?: string; name: string; schema: unknown }): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'forms', 'MANAGE')
  assertRecurso(ctx, 'fichas')
  if (ctx.branchId !== null) throw semAcesso()

  const nome = String(input?.name ?? '').trim().slice(0, 120) || 'Pré-atendimento'
  const schema = normalizeFormSchema(input?.schema)
  const invalido = validateFormSchema(schema)
  if (invalido) return { error: invalido }
  const fora = flattenFields(schema).find(f => TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type))
  if (fora) return { error: `A cliente responde a ficha pelo celular: campo de ${ROTULO_FORA[fora.type] ?? fora.type} não entra no pré-atendimento ("${fora.label}").` }

  const admin = createAdminClient()
  const atualizadas = await gravar(admin.from('forms')
    .update({ name: nome, schema, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId!).eq('tipo', 'PRE_ATENDIMENTO').select('id'), 'salvar a ficha de pré-atendimento') as { id: string }[] | null
  if (!atualizadas?.length) return { error: 'A ficha de pré-atendimento da rede não foi encontrada.' }
  revalidatePath('/admin/settings')
  return { ok: true }
}

const EntradaDoEnvio = z.object({ envio: z.boolean(), validadeMeses: z.number().int().min(1).max(36) })

export async function definirEnvioDoPreAtendimento(input: unknown): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'forms', 'MANAGE')
  if (ctx.branchId !== null) throw semAcesso()
  const dados = EntradaDoEnvio.safeParse(input)
  if (!dados.success) return { error: 'A validade vai de 1 a 36 meses.' }

  await gravar(createAdminClient().from('tenants')
    .update({ pre_atendimento_envio: dados.data.envio, pre_atendimento_validade_meses: dados.data.validadeMeses })
    .eq('id', ctx.tenantId!), 'salvar o envio do pré-atendimento')
  revalidatePath('/admin/settings')
  return { ok: true }
}

const EntradaDaAnamnese = z.object({ clientId: z.string().uuid(), respostas: z.record(z.string(), z.unknown()) })

/** A equipe responde (ou corrige) a anamnese da cliente — na sessão, na clínica. */
export async function salvarAnamneseGeral(input: unknown): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const dados = EntradaDaAnamnese.safeParse(input)
  if (!dados.success) return { error: 'Dados inválidos.' }

  // A cliente é desta rede: com o id de uma cliente de OUTRA rede, seria
  // escrever a anamnese de saúde dela.
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id')
    .eq('id', dados.data.clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a cliente da anamnese')
  if (!cliente) return { error: 'Cliente não encontrada.' }

  await gravarAnamneseGeral(admin, {
    tenantId: ctx.tenantId!, clientId: dados.data.clientId, respostas: dados.data.respostas,
    origem: 'EQUIPE', porUsuario: ctx.internalUserId,
  })
  revalidatePath('/admin/clients')
  revalidatePath('/admin/agenda')
  return { ok: true }
}
