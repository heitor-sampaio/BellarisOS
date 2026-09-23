import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import type { NomeDeEvento, AtorDoEvento, DadosDeAgendamento } from '@estetica-os/types'

/**
 * Emite um evento da agenda com o retrato do agendamento junto.
 *
 * Existe para o retrato ser montado UMA vez: são oito eventos de agenda e
 * todos precisam dos mesmos nome e telefone do cliente. Repetir a consulta em
 * cada ponto de emissão seria a forma mais fácil de dois eventos do mesmo
 * agendamento saírem com campos diferentes.
 *
 * O telefone entra no retrato porque quase toda automação de agenda termina em
 * mandar mensagem — sem ele, o motor teria de ir ao banco justamente no momento
 * em que precisa ser rápido.
 *
 * Nunca lança: `emitirEvento` já engole, e a consulta do retrato é protegida
 * aqui pelo mesmo motivo — evento é registro, não pode derrubar a ação.
 */
export async function emitirEventoDeAgendamento(
  nome: NomeDeEvento,
  appointmentId: string,
  ctx: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
  extras?: {
    /** Cancelamento: o motivo é obrigatório na action e a automação usa no texto. */
    motivo?: string | null
    /** Remarcação: de quando para quando. */
    deAgendadoPara?: string | null
    /** Quando quem agiu não é o usuário logado (cliente pelo app, cron). */
    ator?: AtorDoEvento
    origem?: 'app' | 'webhook' | 'cron'
  },
): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('appointments')
      .select(`
        id, branch_id, status, scheduled_at, client_id, procedure_id, professional_id,
        clients(name, phone),
        procedures(name),
        users!appointments_professional_id_fkey(name)
      `)
      .eq('id', appointmentId)
      .maybeSingle()

    // Sem o agendamento não há retrato — mas o fato aconteceu, e um evento sem
    // dados ainda serve de gatilho. Melhor um evento magro que nenhum.
    if (error) console.error('[eventoDeAgendamento] retrato:', error.message)

    const cli  = data?.clients    as unknown as { name?: string; phone?: string } | null
    const proc = data?.procedures as unknown as { name?: string } | null
    const prof = data?.users      as unknown as { name?: string } | null

    const dados: DadosDeAgendamento = {
      clienteId:        (data?.client_id as string) ?? null,
      clienteNome:      cli?.name  ?? null,
      clienteTelefone:  cli?.phone ?? null,
      procedimentoId:   (data?.procedure_id as string) ?? null,
      procedimentoNome: proc?.name ?? null,
      profissionalId:   (data?.professional_id as string) ?? null,
      profissionalNome: prof?.name ?? null,
      agendadoPara:     (data?.scheduled_at as string) ?? null,
      status:           (data?.status as string) ?? 'DESCONHECIDO',
    }
    if (extras?.motivo)         dados.motivo         = extras.motivo
    if (extras?.deAgendadoPara) dados.deAgendadoPara = extras.deAgendadoPara

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: appointmentId,
      dados,
      ator:       extras?.ator ?? (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA),
      origem:     extras?.origem ?? 'app',
      // Determinística: confirmar duas vezes não vira dois eventos. Remarcação
      // fica de fora porque o MESMO agendamento pode ser remarcado várias
      // vezes, e cada uma é um fato novo.
      chave: nome === 'agendamento.remarcado' ? undefined : `${nome}:${appointmentId}`,
    })
  } catch (e) {
    console.error('[eventoDeAgendamento]', nome, (e as Error).message)
  }
}
