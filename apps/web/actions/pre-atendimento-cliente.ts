'use server'

import { z } from 'zod'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { paraAnamneseGeral } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral, preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'

/**
 * A cliente responde o pré-atendimento pelo app (2026-10-20). Só o DELA: a
 * ficha da sessão (ctx.clientId — a da clínica do endereço) e o pendente
 * dessa ficha; sem pendente, nada é gravado. Grava pelo núcleo
 * (`gravarAnamneseGeral`), com as perguntas que ela RECEBEU.
 *
 * Sem revalidatePath, de propósito: a página recarregada já não acha o
 * pendente e troca a tela por "Nada para responder agora" — some o
 * "Respostas enviadas" (a completa de 2026-10-20 pegou). A tela inicial é
 * dinâmica: o cartão sai sozinho na próxima navegação.
 */

type Resultado = { ok: true } | { error: string }

const SEM_PENDENTE = 'Não há pré-atendimento para responder agora.'
const Entrada = z.object({ respostas: z.record(z.string(), z.unknown()) })

export async function responderPreAtendimento(input: unknown): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  const dados = Entrada.safeParse(input)
  if (!dados.success) return { error: 'Dados inválidos.' }
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ctx.clientId!)
  if (!pendente) return { error: SEM_PENDENTE }

  await gravarAnamneseGeral(admin, {
    tenantId: pendente.tenantId, clientId: ctx.clientId!, respostas: dados.data.respostas,
    origem: 'CLIENTE_APP', porUsuario: null, ficha: pendente.ficha,
  })
  return { ok: true }
}

/** Dentro da validade: "nada mudou" — as respostas de antes, com a data de hoje. */
export async function confirmarQueNadaMudou(): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ctx.clientId!)
  if (!pendente) return { error: SEM_PENDENTE }

  const registro = await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', ctx.clientId!).maybeSingle(), 'buscar a anamnese')
  const atual = paraAnamneseGeral(registro?.general_anamnesis ?? null, pendente.ficha)
  if (!atual) return { error: 'Não há respostas anteriores: responda a ficha.' }

  await gravarAnamneseGeral(admin, {
    tenantId: pendente.tenantId, clientId: ctx.clientId!, respostas: atual.respostas,
    origem: 'CLIENTE_APP', porUsuario: null, ficha: pendente.ficha,
  })
  return { ok: true }
}
