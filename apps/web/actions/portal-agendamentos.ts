'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { EVENTOS } from '@estetica-os/types'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { computeAvailableSlots, candidatasDoDia, horarioOcupado } from '@/lib/appointments/core'
import { salaUnicaDoHorario } from '@/lib/appointments/salas'
import { escolherQuemAtende, juntarHorarios } from '@/lib/appointments/sem-preferencia'
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

/** A51 da 12ª: o remarcado diz com quem ficou (`quemAtende`, o nome). */
type Resultado = { ok: true; quemAtende?: string | null } | { error: string }
const ABERTOS = ['SCHEDULED', 'CONFIRMED']
const UUID = z.string().uuid()

async function agendamentoDaCliente(appointmentId: string) {
  const ctx = await getTenantContext()
  assertClient(ctx)
  if (!UUID.safeParse(appointmentId).success || !ctx.clientId) return null
  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, scheduled_at, duration_min, branch_id, professional_id, procedure_id, room_id, client_id, clients!inner(name, tenant_id), branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('client_id', ctx.clientId).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; scheduled_at: string; duration_min: number; branch_id: string; professional_id: string | null
      procedure_id: string | null; room_id: string | null
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
    // A61: sem motivo digitado, "Pela cliente no app" — era "Pela cliente no
    // app: Cancelado pela cliente no app".
    const digitado = (motivo ?? '').trim().slice(0, 300)
    const porque = digitado || 'Cancelado pela cliente no app'

    const canceladas = await gravar(admin.from('appointments').update({
      status: 'CANCELLED', cancelled_at: new Date().toISOString(),
      cancellation_reason: digitado ? `Pela cliente no app: ${digitado}` : 'Pela cliente no app',
    }).eq('id', a.id).in('status', ABERTOS).select('id'), 'cancelar o agendamento') as { id: string }[] | null
    if (!canceladas?.length) return { error: 'Este agendamento não pode mais ser cancelado.' }

    await logHistory(admin, a.id, null, `${a.clients.name} (app)`, 'CANCELLED', digitado ? `Cancelado pela cliente no app: ${digitado}` : 'Cancelado pela cliente no app')
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

/**
 * "Sem preferência" no remarcar (A59): as candidatas do dia entre quem atende
 * na unidade e REALIZA o procedimento, sem o próprio agendamento ocupando o
 * horário — as mesmas do agendar (`candidatasDoDia`).
 */
async function candidatasParaRemarcar(admin: ReturnType<typeof createAdminClient>, a: {
  id: string; branch_id: string; procedure_id: string | null; duration_min: number; clients: { tenant_id: string }
}, dia: string) {
  return candidatasDoDia(admin, a.clients.tenant_id, a.branch_id, dia, a.duration_min || 30, a.procedure_id, a.id)
}

export async function remarcarPelaCliente(appointmentId: string, scheduledAt: string, semPreferencia = false): Promise<Resultado> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado) return { error: 'Agendamento não encontrado.' }
    const { ctx, admin, a, prazoHoras } = achado
    if (!ABERTOS.includes(a.status)) return { error: 'Este agendamento não pode mais ser remarcado.' }
    const recusa = recusaDoPrazo(a.scheduled_at, prazoHoras)
    if (recusa) return { error: recusa }
    if (!a.professional_id && !semPreferencia) return { error: 'Fale com a clínica para remarcar este horário.' }

    // O horário novo é um dos livres do self-service: da mesma profissional,
    // ou, em "Sem preferência" (A59), de quem estiver livre e realizar o
    // procedimento — a escolha do agendar (`escolherQuemAtende`).
    const inicio = new Date(scheduledAt)
    if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) return { error: 'Escolha um horário a partir de agora.' }
    const p = partsInTZ(inicio)
    const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    if (p.second !== 0) return { error: 'Este horário não está mais disponível. Escolha outro.' }
    let profissional = a.professional_id
    let nomeDeQuemAtende: string | null = null
    if (semPreferencia) {
      const candidatas = await candidatasParaRemarcar(admin, a, dayKeyTZ(inicio))
      profissional = escolherQuemAtende(candidatas, hora)
      if (!profissional) return { error: 'Este horário não está mais disponível. Escolha outro.' }
      nomeDeQuemAtende = candidatas.find(c => c.id === profissional)?.nome ?? null
    } else {
      const livres = await computeAvailableSlots(admin, a.branch_id, a.professional_id!, dayKeyTZ(inicio), a.duration_min || 30, a.id)
      if (!livres.includes(hora)) return { error: 'Este horário não está mais disponível. Escolha outro.' }
    }

    // D8 da 12ª: a sala no horário novo. A que ele tinha fica, se segue livre;
    // senão, a sala única que serve ao procedimento, livre (a regra da única
    // opção, A2 da 10ª); senão, sem sala — a sala é opcional (H1), e a cliente
    // não escolhe sala.
    const duracao = a.duration_min || 30
    const salaDeAntesLivre = !!a.room_id && !(await horarioOcupado(admin, {
      tenantId: a.clients.tenant_id, roomId: a.room_id, branchId: a.branch_id, inicio, duracaoMin: duracao, excluir: a.id,
    }))
    const sala = salaDeAntesLivre ? a.room_id : (await salaUnicaDoHorario(admin, {
      tenantId: a.clients.tenant_id, branchId: a.branch_id, procedureId: a.procedure_id, inicio, duracaoMin: duracao, excluir: a.id,
    })).salaId

    const remarcadas = await gravar(admin.from('appointments').update({
      scheduled_at: inicio.toISOString(), status: 'SCHEDULED', confirmed_at: null, updated_at: new Date().toISOString(),
      professional_id: profissional, sem_preferencia: semPreferencia, room_id: sala,
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
    if (!nomeDeQuemAtende && profissional) {
      nomeDeQuemAtende = ((await ler(admin.from('users').select('name').eq('id', profissional).eq('tenant_id', a.clients.tenant_id).maybeSingle(),
        'ler quem atende')) as { name: string } | null)?.name ?? null
    }
    return { ok: true, quemAtende: nomeDeQuemAtende }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * A56 da 11ª: em "Sem preferência", QUEM fica com o horário escolhido — a
 * mesma escolha do remarcar (`escolherQuemAtende`), dita antes de confirmar
 * (a Bruna virou Carla, e só depois de confirmar ela ficava sabendo).
 */
export async function quemAtendeNoRemarcar(appointmentId: string, dia: string, hora: string): Promise<{ nome: string | null; mesma: boolean }> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return { nome: null, mesma: false }
    const candidatas = await candidatasParaRemarcar(achado.admin, achado.a, dia)
    const id = escolherQuemAtende(candidatas, hora)
    return { nome: candidatas.find(c => c.id === id)?.nome ?? null, mesma: !!id && id === achado.a.professional_id }
  } catch {
    return { nome: null, mesma: false }
  }
}

/** Os horários livres para remarcar: os do self-service, do mesmo profissional (ou de todas, em "Sem preferência") e duração. */
export async function horariosParaRemarcar(appointmentId: string, dia: string, semPreferencia = false): Promise<{ slots: string[] } | { error: string }> {
  try {
    const achado = await agendamentoDaCliente(appointmentId)
    if (!achado) return { error: 'Agendamento não encontrado.' }
    const { admin, a } = achado
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { slots: [] }
    if (semPreferencia) return { slots: juntarHorarios((await candidatasParaRemarcar(admin, a, dia)).map(c => c.livres)) }
    if (!a.professional_id) return { slots: [] }
    return { slots: await computeAvailableSlots(admin, a.branch_id, a.professional_id, dia, a.duration_min || 30, a.id) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
