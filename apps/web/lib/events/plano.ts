import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type { NomeDeEvento, AtorDoEvento, DadosDePlano } from '@estetica-os/types'

/**
 * Emite um evento de plano de tratamento com o retrato dele.
 *
 * O total é somado aqui, e não lido de uma coluna, porque não existe coluna:
 * o valor do plano é a soma dos procedimentos das sessões (mesma conta de
 * `listarPlanejamentos`). A automação de "plano aceito acima de X" depende
 * desse número vir pronto — mandá-la somar sessões seria pedir que ela
 * conhecesse o modelo de dados.
 */
export async function emitirEventoDePlano(
  nome: NomeDeEvento,
  planId: string,
  ctx: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
  extras?: { ator?: AtorDoEvento; origem?: 'app' | 'webhook' | 'cron' },
): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('treatment_plans')
      .select(`
        id, name, status, branch_id, client_id,
        clients(name),
        treatment_plan_sessions(treatment_plan_session_procedures(price))
      `)
      .eq('id', planId)
      .maybeSingle()

    if (error) console.error('[eventoDePlano] retrato:', error.message)

    const cli = data?.clients as unknown as { name?: string } | null
    type Sess = { treatment_plan_session_procedures: { price: number }[] }
    const sessoes = (data?.treatment_plan_sessions as unknown as Sess[]) ?? []

    const dados: DadosDePlano = {
      nome:        (data?.name as string) ?? null,
      clienteId:   (data?.client_id as string) ?? null,
      clienteNome: cli?.name ?? null,
      sessoes:     sessoes.length,
      total: sessoes.reduce(
        (s, sess) => s + (sess.treatment_plan_session_procedures ?? [])
          .reduce((t, p) => t + Number(p.price), 0),
        0,
      ),
      status: (data?.status as string) ?? 'DESCONHECIDO',
    }

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: planId,
      dados,
      ator:       extras?.ator ?? (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA),
      origem:     extras?.origem ?? 'app',
      // Os três são marcos do plano e acontecem uma vez: propor duas vezes é
      // reenviar a mesma proposta, não um fato novo.
      chave: `${nome}:${planId}`,
    })
  } catch (e) {
    console.error('[eventoDePlano]', nome, (e as Error).message)
  }
}

/** Atalhos, para o ponto de emissão ficar legível na action. */
export const planoCriado   = (id: string, ctx: Parameters<typeof emitirEventoDePlano>[2]) =>
  emitirEventoDePlano(EVENTOS.PLANO_CRIADO, id, ctx)
export const planoProposto = (id: string, ctx: Parameters<typeof emitirEventoDePlano>[2]) =>
  emitirEventoDePlano(EVENTOS.PLANO_PROPOSTO, id, ctx)
export const planoAceito   = (id: string, ctx: Parameters<typeof emitirEventoDePlano>[2]) =>
  emitirEventoDePlano(EVENTOS.PLANO_ACEITO, id, ctx)
