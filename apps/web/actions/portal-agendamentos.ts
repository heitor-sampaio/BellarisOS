'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { EVENTOS } from '@estetica-os/types'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { computeAvailableSlots } from '@/lib/appointments/core'
import { logHistory, notifyCancelledAppointment, notifyRescheduledAppointment } from '@/lib/appointments/avisos'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { dayKeyTZ, partsInTZ } from '@/lib/datetime'

/**
 * A cliente cancela e remarca pelo portal (2026-10-21, decisão do Heitor): até
 * o prazo da rede (`tenants.portal_prazo_alteracao_horas`, 24h por padrão);
 * depois dele, só falando com a clínica. Só a ficha DELA (ctx.clientId, a da
 * clínica do endereço), só o que ainda vai acontecer, e o horário novo tem de
 * ser um dos que o self-service oferece (os livres do mesmo profissional).
 */

type Resultado = { ok: true } | { error: string }
const ABERTOS = ['SCHEDULED', 'CONFIRMED']
const UUID = z.string().uuid()

async function agendamentoDaCliente(appointmentId: string) {
  const ctx = await getTenantContext()
  assertClient(ctx)
  if (!UUID.safeParse(appointmentId).success || !ctx.clientId) return null
  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, scheduled_at, duration_min, branch_id, professional_id, client_id, clients!inner(name, tenant_id), branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('client_id', ctx.clientId).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; scheduled_at: string; duration_min: number; branch_id: string; professional_id: string | null
      clients: { name: string; tenant_id: string }; branches: { tenant_id: string }
    } | null
  if (!a) return null
  const rede = await ler(admin.from('tenants').select('portal_prazo_alteracao_horas').eq('id', a.clients.tenant_id).single(),
    'ler o prazo do portal') as { portal_prazo_alteracao_horas: number } | null
  return { ctx, admin, a, prazoHoras: rede?.portal_prazo_alteracao_horas ?? 24 }
}

function recusaDoPrazo(scheduledAt: string, prazoHoras: number): string | null {
  const falta = new Date(scheduledAt).getTime() - Date.now()
  if (falta < prazoHoras * 3600_000) {
    return `Pelo app, só até ${prazoHoras} horas antes do horário. Para mudar agora, fale com a clínica.`
  }
  return null
}

export async function cancelarPelaCliente(appointmentId: string, motivo: string): Promise<Resultado> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado) return { error: 'Agendamento não encontrado.' }
    const { ctx, admin, a, prazoHoras } = achado
    if (!ABERTOS.includes(a.status)) return { error: 'Este agendamento não pode mais ser cancelado.' }
    const recusa = recusaDoPrazo(a.scheduled_at, prazoHoras)
    if (recusa) return { error: recusa }
    const porque = (motivo ?? '').trim().slice(0, 300) || 'Cancelado pela cliente no app'

    const canceladas = await gravar(admin.from('appointments').update({
      status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: `Pela cliente no app: ${porque}`,
    }).eq('id', a.id).in('status', ABERTOS).select('id'), 'cancelar o agendamento') as { id: string }[] | null
    if (!canceladas?.length) return { error: 'Este agendamento não pode mais ser cancelado.' }

    await logHistory(admin, a.id, null, `${a.clients.name} (app)`, 'CANCELLED', `Cancelado pela cliente no app: ${porque}`)
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CANCELADO, a.id, { tenantId: a.clients.tenant_id }, {
      motivo: porque, ator: { tipo: 'cliente', id: ctx.clientId! }, origem: 'app',
    })
    notifyCancelledAppointment(a.id, porque, null)
    revalidateTag(`appointments:${a.clients.tenant_id}`, { expire: 0 })
    revalidatePath('/[slug]/cliente/agendamentos', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function remarcarPelaCliente(appointmentId: string, scheduledAt: string): Promise<Resultado> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado) return { error: 'Agendamento não encontrado.' }
    const { ctx, admin, a, prazoHoras } = achado
    if (!ABERTOS.includes(a.status)) return { error: 'Este agendamento não pode mais ser remarcado.' }
    const recusa = recusaDoPrazo(a.scheduled_at, prazoHoras)
    if (recusa) return { error: recusa }
    if (!a.professional_id) return { error: 'Fale com a clínica para remarcar este horário.' }

    // O horário novo é um dos livres do self-service, para o mesmo profissional.
    const inicio = new Date(scheduledAt)
    if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) return { error: 'Escolha um horário a partir de agora.' }
    const p = partsInTZ(inicio)
    const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    const livres = await computeAvailableSlots(admin, a.branch_id, a.professional_id, dayKeyTZ(inicio), a.duration_min || 30)
    if (p.second !== 0 || !livres.includes(hora)) return { error: 'Este horário não está mais disponível. Escolha outro.' }

    const remarcadas = await gravar(admin.from('appointments').update({
      scheduled_at: inicio.toISOString(), status: 'SCHEDULED', confirmed_at: null, updated_at: new Date().toISOString(),
    }).eq('id', a.id).in('status', ABERTOS).select('id'), 'remarcar o agendamento') as { id: string }[] | null
    if (!remarcadas?.length) return { error: 'Este agendamento não pode mais ser remarcado.' }

    const quando = inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    await logHistory(admin, a.id, null, `${a.clients.name} (app)`, 'RESCHEDULED', `Remarcado pela cliente no app para ${quando}`,
      { scheduled_at: inicio.toISOString() })
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_REMARCADO, a.id, { tenantId: a.clients.tenant_id }, {
      deAgendadoPara: a.scheduled_at, ator: { tipo: 'cliente', id: ctx.clientId! }, origem: 'app',
    })
    notifyRescheduledAppointment(a.id, null)
    revalidateTag(`appointments:${a.clients.tenant_id}`, { expire: 0 })
    revalidatePath('/[slug]/cliente/agendamentos', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Os horários livres para remarcar: os do self-service, do mesmo profissional e duração. */
export async function horariosParaRemarcar(appointmentId: string, dia: string): Promise<{ slots: string[] } | { error: string }> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado) return { error: 'Agendamento não encontrado.' }
    const { admin, a } = achado
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !a.professional_id) return { slots: [] }
    return { slots: await computeAvailableSlots(admin, a.branch_id, a.professional_id, dia, a.duration_min || 30) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
