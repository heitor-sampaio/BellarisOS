'use server'

import { z } from 'zod'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, gravar, mensagemDoErro } from '@/lib/db'
import { paraAnamneseGeral, respostasDaFicha, oQueFaltaNaFicha, anamneseRespondida } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral, preAtendimentoPendente, dadosDaOfertaNoApp } from '@/lib/pre-atendimento/ficha'
import { ofereceAFichaNoApp } from '@/lib/pre-atendimento/oferta-no-app'

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

const SEM_PENDENTE = 'Não há ficha de saúde para responder agora.'
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
    .eq('client_id', ctx.clientId!).maybeSingle(), 'buscar a ficha de saúde')
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

/**
 * A cliente abre a PRÓPRIA ficha de saúde pelo Início (15ª A33 = 16ª A11):
 * com o envio automático desligado, o pendente nasce aqui, no clique dela
 * (princípio 6: nada se move sozinho), pelo mesmo caminho do envio manual da
 * equipe (`pre_atendimento_abrir_manual`). Só pelo agendamento futuro DELA
 * (ctx.clientId) e só quando a oferta vale: sem ficha válida.
 */
export async function abrirMinhaFichaDeSaude(appointmentId: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)
    if (!z.string().uuid().safeParse(appointmentId).success || !ctx.clientId) return { error: 'Agendamento não encontrado.' }
    const admin = createAdminClient()
    const ag = await ler(admin.from('appointments').select('id, status, scheduled_at, clients!inner(tenant_id)')
      .eq('id', appointmentId).eq('client_id', ctx.clientId).maybeSingle(), 'buscar o agendamento') as
      { id: string; status: string; scheduled_at: string; clients: { tenant_id: string } } | null
    if (!ag || !['SCHEDULED', 'CONFIRMED'].includes(ag.status) || new Date(ag.scheduled_at).getTime() < Date.now()) {
      return { error: 'Agendamento não encontrado.' }
    }
    if (await preAtendimentoPendente(admin, ctx.clientId)) return { ok: true }
    const dados = await dadosDaOfertaNoApp(admin, ag.clients.tenant_id, ctx.clientId)
    if (!ofereceAFichaNoApp({ pendente: false, proximoAgendamentoId: ag.id, ...dados })) return { error: SEM_PENDENTE }
    await gravar(admin.rpc('pre_atendimento_abrir_manual', { p_tenant: ag.clients.tenant_id, p_appointment: ag.id }), 'abrir a ficha de saúde')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
