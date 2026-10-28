'use server'

import { z } from 'zod'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { paraAnamneseGeral, respostasDaFicha, oQueFaltaNaFicha, anamneseRespondida } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral, preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'

/**
 * A cliente responde o pré-atendimento pelo app (2026-10-20). Só o DELA: a
 * ficha da sessão (ctx.clientId — a da clínica do endereço) e o pendente
 * dessa ficha; sem pendente, nada é gravado. Grava pelo núcleo
 * (`gravarAnamneseGeral`), com as perguntas que ela RECEBEU.
 *
 * Sem resposta nenhuma, ou com uma pergunta obrigatória vazia, é recusado
 * AQUI (D2 da simulação de 2026-10-28): a ficha vazia passava, e a clínica
 * via "Respondida pela cliente" com os campos em branco. A tela também
 * confere, mas é o servidor que segura.
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

  const falta = oQueFaltaNaFicha(pendente.ficha.rows, respostasDaFicha(pendente.ficha.rows, dados.data.respostas))
  if (falta) return { error: falta }

  await gravarAnamneseGeral(admin, {
    tenantId: pendente.tenantId, clientId: ctx.clientId!, respostas: dados.data.respostas,
    origem: 'CLIENTE_APP', porUsuario: null, ficha: pendente.ficha,
  })
  return { ok: true }
}

/**
 * Dentro da validade: "nada mudou" — as respostas de antes, com a data de
 * hoje. Só se havia resposta (a ficha vazia não tem o que confirmar) e se as
 * de antes cobrem as obrigatórias da ficha de agora.
 */
export async function confirmarQueNadaMudou(): Promise<Resultado> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, ctx.clientId!)
  if (!pendente) return { error: SEM_PENDENTE }

  const registro = await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', ctx.clientId!).maybeSingle(), 'buscar a anamnese')
  const atual = paraAnamneseGeral(registro?.general_anamnesis ?? null, pendente.ficha)
  if (!anamneseRespondida(atual)) return { error: 'Não há respostas anteriores: responda a ficha.' }
  const falta = oQueFaltaNaFicha(pendente.ficha.rows, respostasDaFicha(pendente.ficha.rows, atual.respostas))
  if (falta) return { error: `${falta} Toque em "Atualizar respostas".` }

  await gravarAnamneseGeral(admin, {
    tenantId: pendente.tenantId, clientId: ctx.clientId!, respostas: atual.respostas,
    origem: 'CLIENTE_APP', porUsuario: null, ficha: pendente.ficha,
  })
  return { ok: true }
}
