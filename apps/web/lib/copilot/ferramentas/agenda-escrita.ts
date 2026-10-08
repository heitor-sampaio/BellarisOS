import 'server-only'
import { z } from 'zod/v4'
import { revalidateTag } from 'next/cache'
import { isOwnScope } from '@/lib/auth'
import { ler, gravar } from '@/lib/db'
import { createAppointmentCore, conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { agendamentoAoAlcance, cancelarCore, remarcarCore } from '@/lib/appointments/alteracoes'
import { getUserName, logHistory, notifyCancelledAppointment, notifyNewAppointment, notifyRescheduledAppointment } from '@/lib/appointments/avisos'
import { garantirClienteRapido, digitosDoTelefone } from '@/lib/clients/cliente-rapido'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { EVENTOS } from '@estetica-os/types'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, HORA, UUID, dinheiro, instanteDe, quandoLegivel, resolverCliente, resolverProcedimento,
  resolverProfissional, resolverUnidade, rota, nomesPorId, STATUS_DO_AGENDAMENTO,
} from '@/lib/copilot/ferramentas/comum'

/**
 * As GRAVAÇÕES da agenda. Cada uma prepara (resolve nomes, confere alcance e
 * horário, monta o resumo do cartão) e só grava no "Confirmar", pelos MESMOS
 * núcleos da tela (`createAppointmentCore`, `remarcarCore`, `cancelarCore`) e
 * com os mesmos avisos ao paciente e à equipe.
 */

/** O profissional está livre? A mesma conferência da tela (horarioOcupado, no núcleo). */
async function livre(c: ContextoDaFerramenta, a: { professionalId: string; inicio: Date; duracaoMin: number; excluir?: string }): Promise<boolean> {
  return !(await horarioOcupado(c.admin, { tenantId: c.ctx.tenantId!, professionalId: a.professionalId, inicio: a.inicio, duracaoMin: a.duracaoMin, excluir: a.excluir }))
}

interface ArgsAgendar {
  cliente?: string
  clienteNovo?: { nome: string; telefone: string }
  procedimento: string
  profissional: string
  data: string
  hora: string
  unidade?: string
  observacao?: string
}
interface PayloadAgendar {
  branchId: string; procedureId: string; professionalId: string; scheduledAt: string
  clientId: string | null; clienteNovo: { nome: string; telefone: string } | null; notes: string | null
}

export const agendar: FerramentaDeEscrita<ArgsAgendar, PayloadAgendar> = {
  nome: 'agendar',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'agenda'),
  descricao: 'Agenda um atendimento: cliente (id, nome ou telefone de quem já é cliente) OU clienteNovo {nome, telefone com DDD} para quem ainda não é; procedimento e profissional (nome ou id); data (AAAA-MM-DD) e hora (HH:MM, Brasília). Confira os horários livres antes. O cliente é avisado da confirmação.',
  parametros: z.object({
    cliente: z.string().min(2).max(120).optional(),
    clienteNovo: z.object({ nome: z.string().min(2).max(120), telefone: z.string().min(10).max(20) }).optional(),
    procedimento: z.string().min(2).max(80),
    profissional: z.string().min(2).max(80),
    data: DATA, hora: HORA,
    unidade: z.string().max(80).optional(),
    observacao: z.string().max(300).optional(),
  }),
  async preparar(c, a) {
    if (!a.cliente && !a.clienteNovo) return { erro: 'Quem vai ser atendido? Informe o cliente (ou nome e telefone de um cliente novo).' }
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const unidade = u.unidade!
    const [proc, prof] = await Promise.all([
      resolverProcedimento(c, a.procedimento, unidade.id),
      resolverProfissional(c, a.profissional, unidade.id),
    ])
    if ('erro' in proc) return { erro: proc.erro }
    if ('erro' in prof) return { erro: prof.erro }

    let clientId: string | null = null
    let nomeDoCliente: string
    let clienteNovo: PayloadAgendar['clienteNovo'] = null
    if (a.cliente) {
      const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
      if ('erro' in cl) return { erro: cl.erro }
      clientId = cl.id
      nomeDoCliente = cl.name
    } else {
      const telefone = digitosDoTelefone(a.clienteNovo!.telefone)
      if (telefone.length < 10) return { erro: 'O telefone do cliente novo precisa do DDD.' }
      // Telefone que já é de alguém: é esse cliente (o cadastro rápido faria o mesmo).
      const { data: existente, error: erroTel } = await c.admin.rpc('cliente_por_telefone', { p_tenant: c.ctx.tenantId!, p_digitos: telefone })
      if (erroTel) return { erro: 'Não consegui conferir o telefone agora.' }
      if (existente) {
        const nomes = await nomesPorId(c, 'clients', [existente as string])
        clientId = existente as string
        // Diz que achou pelo telefone: pode ser a mãe de quem vai ser atendida.
        nomeDoCliente = `${nomes.get(clientId) ?? a.clienteNovo!.nome} (já cadastrada com este telefone)`
      } else {
        clienteNovo = { nome: a.clienteNovo!.nome.trim(), telefone }
        nomeDoCliente = `${clienteNovo.nome} (cliente novo)`
      }
    }

    const inicio = instanteDe(a.data, a.hora)
    if (inicio.getTime() < Date.now() - 5 * 60_000) return { erro: 'Esse horário já passou.' }
    const recusa = await conferirPecasDoAgendamento(c.admin, c.ctx, { branchId: unidade.id, professionalId: prof.id, clientId, roomId: null })
    if (recusa) return { erro: recusa }
    if (!(await livre(c, { professionalId: prof.id, inicio, duracaoMin: proc.duration_min || 60 }))) {
      return { erro: `${prof.name} já tem agendamento nesse horário. Veja os horários livres.` }
    }

    return {
      resumo: {
        titulo: 'Agendar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: nomeDoCliente },
          { rotulo: 'Procedimento', valor: `${proc.name} · ${proc.duration_min} min` },
          { rotulo: 'Profissional', valor: prof.name },
          { rotulo: 'Quando', valor: quandoLegivel(inicio) },
          { rotulo: 'Unidade', valor: unidade.name },
          { rotulo: 'Valor', valor: dinheiro(proc.price) },
          ...(a.observacao ? [{ rotulo: 'Observação', valor: a.observacao }] : []),
        ],
        aviso: 'O cliente recebe a confirmação do agendamento.',
      },
      payload: {
        branchId: unidade.id, procedureId: proc.id, professionalId: prof.id, scheduledAt: inicio.toISOString(),
        clientId, clienteNovo, notes: a.observacao?.trim() || null,
      },
    }
  },
  async efetivar(c, p) {
    let clientId = p.clientId
    if (!clientId && p.clienteNovo) {
      const novo = await garantirClienteRapido(c.admin, c.ctx, { nome: p.clienteNovo.nome, telefone: p.clienteNovo.telefone, branchId: p.branchId })
      if (novo.error || !novo.clientId) return { erro: novo.error ?? 'Não foi possível registrar o cliente.' }
      clientId = novo.clientId
      revalidateTag(`clients:${c.ctx.tenantId!}`, 'max')
    }
    const r = await createAppointmentCore(c.admin, c.ctx, {
      branchId: p.branchId, clientId: clientId!, procedureId: p.procedureId, professionalId: p.professionalId,
      scheduledAt: p.scheduledAt, notes: p.notes, source: 'INTERNAL',
    })
    if ('error' in r) return { erro: r.error }
    revalidateTag(`appointments:${c.ctx.tenantId!}`, 'max')
    notifyNewAppointment(r.id, c.ctx.internalUserId)
    return { mensagem: `Agendado para ${quandoLegivel(p.scheduledAt)}.`, href: rota(c, `/agenda/${r.id}`), rotuloDoLink: 'Ver agendamento' }
  },
}

/** Lê o agendamento ao alcance, com os nomes para o resumo. */
async function agendamentoParaResumo(c: ContextoDaFerramenta, id: string) {
  const a = await agendamentoAoAlcance(c.admin, c.ctx, id)
  if (!a) return null
  const extra = await ler(c.admin.from('appointments').select('client_id, procedure_id').eq('id', id).single(), 'ler o agendamento') as { client_id: string; procedure_id: string }
  const [clientes, procs, profs] = await Promise.all([
    nomesPorId(c, 'clients', [extra.client_id]),
    nomesPorId(c, 'procedures', [extra.procedure_id]),
    nomesPorId(c, 'users', [a.professional_id]),
  ])
  return {
    ...a,
    cliente: clientes.get(extra.client_id) ?? 'Cliente',
    procedimento: procs.get(extra.procedure_id) ?? 'Atendimento',
    profissional: a.professional_id ? (profs.get(a.professional_id) ?? '—') : '—',
  }
}

export const remarcar: FerramentaDeEscrita<{ agendamento: string; data: string; hora: string; profissional?: string }, { appointmentId: string; scheduledAt: string; professionalId: string | null }> = {
  nome: 'remarcar',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'agenda'),
  descricao: 'Remarca um agendamento (id, da ferramenta agendamentos) para outra data/hora (Brasília) e, opcionalmente, outro profissional. O cliente é avisado do novo horário.',
  parametros: z.object({ agendamento: UUID, data: DATA, hora: HORA, profissional: z.string().max(80).optional() }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(ag.status)) return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    let professionalId: string | null = null
    let nomeDoProfissional = ag.profissional
    if (a.profissional) {
      const p = await resolverProfissional(c, a.profissional, ag.branch_id)
      if ('erro' in p) return { erro: p.erro }
      professionalId = p.id
      nomeDoProfissional = p.name
    }
    const inicio = instanteDe(a.data, a.hora)
    if (inicio.getTime() < Date.now() - 5 * 60_000) return { erro: 'Esse horário já passou.' }
    const quem = professionalId ?? ag.professional_id
    if (quem && !(await livre(c, { professionalId: quem, inicio, duracaoMin: ag.duration_min || 60, excluir: ag.id }))) {
      return { erro: `${nomeDoProfissional} já tem agendamento nesse horário.` }
    }
    return {
      resumo: {
        titulo: 'Remarcar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'De', valor: quandoLegivel(ag.scheduled_at) },
          { rotulo: 'Para', valor: quandoLegivel(inicio) },
          { rotulo: 'Profissional', valor: nomeDoProfissional },
        ],
        aviso: 'O cliente recebe o aviso do novo horário.',
      },
      payload: { appointmentId: ag.id, scheduledAt: inicio.toISOString(), professionalId },
    }
  },
  async efetivar(c, p) {
    const r = await remarcarCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidateTag(`appointments:${c.ctx.tenantId!}`, 'max')
    notifyRescheduledAppointment(p.appointmentId, c.ctx.internalUserId)
    return { mensagem: `Remarcado para ${quandoLegivel(p.scheduledAt)}.`, href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}

export const cancelar: FerramentaDeEscrita<{ agendamento: string; motivo: string }, { appointmentId: string; motivo: string }> = {
  nome: 'cancelar_agendamento',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'agenda'),
  descricao: 'Cancela um agendamento (id) com o motivo (obrigatório — pergunte se não foi dito). O cliente é avisado.',
  parametros: z.object({ agendamento: UUID, motivo: z.string().min(3).max(300) }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(ag.status)) return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    return {
      resumo: {
        titulo: 'Cancelar agendamento',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at) },
          { rotulo: 'Motivo', valor: a.motivo },
        ],
        aviso: 'O cliente recebe o aviso do cancelamento.',
      },
      payload: { appointmentId: ag.id, motivo: a.motivo.trim() },
    }
  },
  async efetivar(c, p) {
    const r = await cancelarCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidateTag(`appointments:${c.ctx.tenantId!}`, 'max')
    notifyCancelledAppointment(p.appointmentId, p.motivo, c.ctx.internalUserId)
    return { mensagem: 'Agendamento cancelado.', href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}

export const confirmarAgendamento: FerramentaDeEscrita<{ agendamento: string }, { appointmentId: string }> = {
  nome: 'confirmar_agendamento',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'VIEW',
  pode: ctx => !isOwnScope(ctx, 'agenda'),
  descricao: 'Marca um agendamento (id) como CONFIRMADO pelo cliente (o "confirmou presença").',
  parametros: z.object({ agendamento: UUID }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (ag.status !== 'SCHEDULED') return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    return {
      resumo: {
        titulo: 'Confirmar presença',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at) },
        ],
      },
      payload: { appointmentId: ag.id },
    }
  },
  async efetivar(c, p) {
    const ag = await agendamentoAoAlcance(c.admin, c.ctx, p.appointmentId)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    const feitas = await gravar(c.admin.from('appointments')
      .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
      .eq('id', ag.id).eq('status', 'SCHEDULED').select('id'), 'confirmar o agendamento') as { id: string }[] | null
    if (!feitas?.length) return { erro: 'O agendamento mudou de situação. Confira na agenda.' }
    const userName = c.ctx.userName || await getUserName(c.admin, c.ctx.userId)
    await logHistory(c.admin, ag.id, c.ctx.internalUserId, userName, 'CONFIRMED', 'Agendamento confirmado')
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CONFIRMADO, ag.id, { ...c.ctx, userName })
    revalidateTag(`appointments:${c.ctx.tenantId!}`, 'max')
    return { mensagem: 'Presença confirmada.', href: rota(c, `/agenda/${ag.id}`), rotuloDoLink: 'Ver agendamento' }
  },
}
