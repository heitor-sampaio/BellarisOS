import 'server-only'
import { z } from 'zod/v4'
import { revalidateTag } from 'next/cache'
import { isOwnScope } from '@/lib/auth'
import { ler } from '@/lib/db'
import { createAppointmentCore, conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { agendamentoAoAlcance, cancelarCore, checkinCore, confirmarCore, remarcarCore, revalidarAgendamento } from '@/lib/appointments/alteracoes'
import { notifyCancelledAppointment, notifyCheckin, notifyNewAppointment, notifyRescheduledAppointment } from '@/lib/appointments/avisos'
import { garantirClienteRapido, comPermissaoDeUnificar } from '@/lib/clients/cliente-rapido'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { trechoDoBloqueio } from '@/lib/agenda/bloqueio'
import { fichasQueJaExistem, textoDaFichaQueJaExiste, type FichaQueJaExiste } from '@/lib/clients/ja-existe'
import { escolhasDaFichaQueJaExiste } from '@/lib/copilot/ferramentas/clientes-escrita'
import { telefoneDoCopilot } from '@/lib/copilot/ferramentas/clientes-escrita'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, HORA, UUID, dinheiro, fusoDe, instanteDe, quandoLegivel, resolverCliente, resolverProcedimento,
  resolverProfissional, resolverUnidade, rota, nomesPorId, STATUS_DO_AGENDAMENTO,
} from '@/lib/copilot/ferramentas/comum'

/**
 * As GRAVAÇÕES da agenda. Cada uma prepara (resolve nomes, confere alcance e
 * horário, monta o resumo do cartão) e só grava no "Confirmar", pelos MESMOS
 * núcleos da tela (`createAppointmentCore`, `remarcarCore`, `cancelarCore`) e
 * com os mesmos avisos ao paciente e à equipe.
 */

/**
 * O horário cai num BLOQUEIO da profissional (decisão 3 da 7ª simulação)? O
 * Copilot não oferece nem marca o horário bloqueado: a recusa diz o bloqueio
 * e que o encaixe nele é pela agenda (onde a equipe é avisada e encaixa).
 */
async function recusaDoBloqueado(c: ContextoDaFerramenta, a: { professionalId: string; nome: string; inicio: Date; duracaoMin: number; fuso: string }): Promise<string | null> {
  const [b] = await bloqueiosQueBatem(c.admin, { professionalId: a.professionalId, inicio: a.inicio, fim: new Date(a.inicio.getTime() + a.duracaoMin * 60_000) })
  return b ? `${a.nome} está com o horário bloqueado ${trechoDoBloqueio(b, a.fuso)} (${b.motivo}). Escolha outro horário — o encaixe num horário bloqueado é pela agenda.` : null
}

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
  clientId: string | null; clienteNovo: { nome: string; telefone: string; jaExisteId?: string } | null; notes: string | null
}

export const agendar: FerramentaDeEscrita<ArgsAgendar, PayloadAgendar> = {
  nome: 'agendar',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'agenda'),
  descricao: 'Agenda um atendimento: cliente (id, nome ou telefone de quem já é cliente) OU clienteNovo {nome, telefone com DDD} para quem ainda não é; procedimento e profissional (nome ou id); data (AAAA-MM-DD) e hora (HH:MM, no horário da unidade). Confira os horários livres antes. O cliente é avisado da confirmação.',
  parametros: z.object({
    cliente: z.string().min(2).max(120).optional(),
    clienteNovo: z.object({ nome: z.string().min(2).max(120), telefone: z.string().min(8).max(24) }).optional(),
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
    let jaExiste: FichaQueJaExiste | undefined
    if (a.cliente) {
      const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
      if ('erro' in cl) return { erro: cl.erro }
      clientId = cl.id
      nomeDoCliente = cl.name
    } else {
      const fone = telefoneDoCopilot(a.clienteNovo!.telefone)
      if ('erro' in fone) return { erro: fone.erro }
      const telefone = fone.gravar
      clienteNovo = { nome: a.clienteNovo!.nome.trim(), telefone }
      nomeDoCliente = `${clienteNovo.nome} (cliente novo)`
      // A ficha que JÁ EXISTE com este telefone (r2-cli-01): não é mais usada
      // calada — o cartão pergunta, como o "+ Agendar" da tela: cadastrar
      // mesmo assim (pode ser a filha de quem tem o número) ou usar a ficha.
      ;[jaExiste] = await fichasQueJaExistem(c.admin, c.ctx.tenantId!, { digitos: fone.digitos, nome: clienteNovo.nome }, { comArquivadas: true })
      // Unificar/reativar pede Clientes em Gerenciar (C66): o cartão sabe.
      if (jaExiste) jaExiste = comPermissaoDeUnificar(jaExiste, c.ctx)
      if (jaExiste && !jaExiste.podeCadastrarMesmoAssim && jaExiste.podeUnificar === false && jaExiste.arquivada) {
        return { erro: `${textoDaFichaQueJaExiste(jaExiste)} Reativar a ficha pede Clientes em Gerenciar: peça a quem cuida dos clientes.` }
      }
      if (jaExiste) clienteNovo = { ...clienteNovo, jaExisteId: jaExiste.id }
    }

    // "14:30" é 14:30 NA UNIDADE (F62b): em Manaus, 18:30 UTC — não 14:30 de Brasília.
    const fuso = await fusoDe(c, unidade.id)
    const inicio = instanteDe(a.data, a.hora, fuso)
    if (inicio.getTime() < Date.now() - 5 * 60_000) return { erro: 'Esse horário já passou.' }
    const recusa = await conferirPecasDoAgendamento(c.admin, c.ctx, { branchId: unidade.id, professionalId: prof.id, clientId, roomId: null })
    if (recusa) return { erro: recusa }
    if (!(await livre(c, { professionalId: prof.id, inicio, duracaoMin: proc.duration_min || 60 }))) {
      return { erro: `${prof.name} já tem agendamento nesse horário. Veja os horários livres.` }
    }
    const bloqueado = await recusaDoBloqueado(c, { professionalId: prof.id, nome: prof.name, inicio, duracaoMin: proc.duration_min || 60, fuso })
    if (bloqueado) return { erro: bloqueado }

    return {
      resumo: {
        titulo: 'Agendar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: nomeDoCliente },
          { rotulo: 'Procedimento', valor: `${proc.name} · ${proc.duration_min} min` },
          { rotulo: 'Profissional', valor: prof.name },
          { rotulo: 'Quando', valor: quandoLegivel(inicio, fuso) },
          { rotulo: 'Unidade', valor: unidade.name },
          { rotulo: 'Valor', valor: dinheiro(proc.price) },
          ...(a.observacao ? [{ rotulo: 'Observação', valor: a.observacao }] : []),
        ],
        aviso: jaExiste
          ? `${textoDaFichaQueJaExiste(jaExiste)} Nada foi gravado: agende numa ficha nova mesmo assim, ou na ficha que existe. O cliente recebe a confirmação do agendamento.`
          : 'O cliente recebe a confirmação do agendamento.',
        ...(jaExiste ? { escolhas: escolhasDaFichaQueJaExiste(jaExiste) } : {}),
      },
      payload: {
        branchId: unidade.id, procedureId: proc.id, professionalId: prof.id, scheduledAt: inicio.toISOString(),
        clientId, clienteNovo, notes: a.observacao?.trim() || null,
      },
    }
  },
  async efetivar(c, p, escolha) {
    let clientId = p.clientId
    if (!clientId && p.clienteNovo) {
      // A ficha que já existia: a escolha do cartão decide (r2-cli-01).
      if (p.clienteNovo.jaExisteId && escolha !== 'cadastrar' && escolha !== 'atualizar' && escolha !== 'usar') return { erro: 'Escolha no cartão: ficha nova mesmo assim, ou a ficha que existe.' }
      const novo = await garantirClienteRapido(c.admin, c.ctx, {
        nome: p.clienteNovo.nome, telefone: p.clienteNovo.telefone, branchId: p.branchId,
        jaExiste: p.clienteNovo.jaExisteId ? `${escolha}:${p.clienteNovo.jaExisteId}` : null,
      })
      if (novo.jaExiste) return { erro: `${textoDaFichaQueJaExiste(novo.jaExiste)} Nada foi gravado: peça de novo ao Copilot para escolher.` }
      if (novo.error || !novo.clientId) return { erro: novo.error ?? 'Não foi possível registrar o cliente.' }
      clientId = novo.clientId
      revalidateTag(`clients:${c.ctx.tenantId!}`, { expire: 0 })
    }
    const r = await createAppointmentCore(c.admin, c.ctx, {
      branchId: p.branchId, clientId: clientId!, procedureId: p.procedureId, professionalId: p.professionalId,
      scheduledAt: p.scheduledAt, notes: p.notes, source: 'INTERNAL',
    })
    if ('error' in r) return { erro: r.error }
    revalidarAgendamento(c.ctx, r.id)
    notifyNewAppointment(r.id, c.ctx.internalUserId)
    return { mensagem: `Agendado para ${quandoLegivel(p.scheduledAt, await fusoDe(c, p.branchId))}.`, href: rota(c, `/agenda/${r.id}`), rotuloDoLink: 'Ver agendamento' }
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
  descricao: 'Remarca um agendamento (id, da ferramenta agendamentos) para outra data/hora (no horário da unidade dele) e, opcionalmente, outro profissional. O cliente é avisado do novo horário.',
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
    // A data e a hora no relógio da unidade do agendamento (F62b).
    const fuso = await fusoDe(c, ag.branch_id)
    const inicio = instanteDe(a.data, a.hora, fuso)
    if (inicio.getTime() < Date.now() - 5 * 60_000) return { erro: 'Esse horário já passou.' }
    const quem = professionalId ?? ag.professional_id
    if (quem && !(await livre(c, { professionalId: quem, inicio, duracaoMin: ag.duration_min || 60, excluir: ag.id }))) {
      return { erro: `${nomeDoProfissional} já tem agendamento nesse horário.` }
    }
    const bloqueado = quem ? await recusaDoBloqueado(c, { professionalId: quem, nome: nomeDoProfissional, inicio, duracaoMin: ag.duration_min || 60, fuso }) : null
    if (bloqueado) return { erro: bloqueado }
    return {
      resumo: {
        titulo: 'Remarcar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'De', valor: quandoLegivel(ag.scheduled_at, fuso) },
          { rotulo: 'Para', valor: quandoLegivel(inicio, fuso) },
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
    revalidarAgendamento(c.ctx, p.appointmentId)
    notifyRescheduledAppointment(p.appointmentId, c.ctx.internalUserId)
    const daUnidade = await ler(c.admin.from('appointments').select('branch_id').eq('id', p.appointmentId).maybeSingle(), 'ler a unidade do agendamento') as { branch_id: string | null } | null
    return { mensagem: `Remarcado para ${quandoLegivel(p.scheduledAt, await fusoDe(c, daUnidade?.branch_id))}.`, href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
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
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at, await fusoDe(c, ag.branch_id)) },
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
    revalidarAgendamento(c.ctx, p.appointmentId)
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
    if (ag.status !== 'SCHEDULED' && ag.status !== 'CONFIRMED') return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    return {
      resumo: {
        titulo: 'Confirmar presença',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at, await fusoDe(c, ag.branch_id)) },
        ],
      },
      payload: { appointmentId: ag.id },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo da agenda (lib/appointments/alteracoes.ts).
    const r = await confirmarCore(c.admin, c.ctx, p.appointmentId)
    if ('error' in r) return { erro: r.error }
    revalidarAgendamento(c.ctx, p.appointmentId)
    return { mensagem: 'Presença confirmada.', href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}

export const fazerCheckIn: FerramentaDeEscrita<{ agendamento: string }, { appointmentId: string }> = {
  nome: 'fazer_check_in',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  descricao: 'Faz o CHECK-IN de um agendamento (id): o cliente chegou à clínica (fica "chegou", na sala de espera). De agendamento "agendado" ou "confirmado".',
  parametros: z.object({ agendamento: UUID }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (ag.status !== 'SCHEDULED') return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    return {
      resumo: {
        titulo: 'Check-in — o cliente chegou',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at, await fusoDe(c, ag.branch_id)) },
        ],
      },
      payload: { appointmentId: ag.id },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo da agenda (lib/appointments/alteracoes.ts).
    const r = await checkinCore(c.admin, c.ctx, p.appointmentId)
    if ('error' in r) return { erro: r.error }
    revalidarAgendamento(c.ctx, p.appointmentId)
    notifyCheckin(p.appointmentId)
    return { mensagem: 'Check-in feito.', href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}
