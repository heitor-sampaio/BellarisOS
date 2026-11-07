import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Emite os termos e contratos do INÍCIO do atendimento antes de tentar iniciar
 * (D7 da 9ª simulação, 2026-11-07 — regressão da F33). Desde a D13 da 8ª, os
 * do início nascem no check-in (ARRIVED); no início direto de Confirmado, a
 * trava do banco (`trg_documentos_bloqueiam_inicio`) os emitia e recusava no
 * MESMO update — e a transação desfazia a emissão: a recepção lia "Falta
 * assinar: Termo… Colha a assinatura" e o termo não existia para colher.
 *
 * Aqui eles nascem num passo próprio, gravado, ANTES do update de status: a
 * trava continua recusando (é a segunda linha), e o termo fica para assinar.
 * Idempotente (a emissão não repete o modelo já emitido). O agendamento de
 * plano não emite (o plano tem os dele), como no gatilho.
 */
export async function emitirDocumentosDoInicio(admin: Admin, appointmentId: string): Promise<void> {
  const ap = await ler(admin.from('appointments').select('status, treatment_plan_id').eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
  if (!ap || ap.treatment_plan_id || !['SCHEDULED', 'CONFIRMED'].includes(ap.status as string)) return
  await gravar(admin.rpc('documentos_emitir_do_atendimento', {
    p_agendamento: appointmentId, p_momentos: ['AGENDAMENTO', 'INICIO_ATENDIMENTO'],
  }), 'emitir os documentos do início')
}
