// O "Retorno vencendo" (D-12, 2026-10-30): no dia do retorno pedido ao
// finalizar o atendimento, o cron emite `agendamento.retorno_vencendo` — o
// gatilho das automações, com o procedimento do atendimento para o "Se". Nada
// é mandado à cliente aqui: quem decide o que fazer é a automação que a
// clínica montou.
//
// Passa por TODAS as redes (é do cron). Cada atendimento é REIVINDICADO antes
// de emitir (`retorno_avisado_em` de nulo para agora, conferindo a linha
// devolvida — §9.9): duas passagens ao mesmo tempo emitem uma vez. A chave do
// evento é a segunda trava.

import { EVENTOS } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { ATOR_SISTEMA } from '@/lib/events/emitir'
import { diaDeBrasilia } from './retornos'

const LOTE = 200

export async function emitirRetornosVencendo(agora = new Date()): Promise<{ emitidos: number }> {
  const admin = createAdminClient()
  const hoje = diaDeBrasilia(agora)
  let emitidos = 0

  for (let volta = 0; volta < 50; volta++) {
    const { data, error } = await admin.from('appointments')
      .select('id, retorno_em_dias, retorno_para, branches!inner(tenant_id)')
      .eq('status', 'COMPLETED')
      .is('retorno_avisado_em', null)
      .not('retorno_para', 'is', null)
      .lte('retorno_para', hoje)
      .order('retorno_para').order('id')
      .limit(LOTE)
    if (error) throw new Error(`Não consegui ler os retornos: ${error.message}`)
    const linhas = (data ?? []) as unknown as {
      id: string; retorno_em_dias: number | null; retorno_para: string; branches: { tenant_id: string }
    }[]
    if (linhas.length === 0) break

    for (const r of linhas) {
      // Reivindica: só quem muda a linha emite.
      const { data: minha, error: erroClaim } = await admin.from('appointments')
        .update({ retorno_avisado_em: new Date().toISOString() })
        .eq('id', r.id).is('retorno_avisado_em', null)
        .select('id')
      if (erroClaim) throw new Error(`Não consegui marcar o retorno: ${erroClaim.message}`)
      if (!minha?.length) continue
      await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_RETORNO_VENCENDO, r.id,
        { tenantId: r.branches.tenant_id },
        { ator: ATOR_SISTEMA, origem: 'cron', retorno: { emDias: r.retorno_em_dias, para: r.retorno_para } })
      emitidos++
    }
    if (linhas.length < LOTE) break
  }
  return { emitidos }
}
