import 'server-only'
import { z } from 'zod/v4'
import { revalidateTag } from 'next/cache'
import { ler } from '@/lib/db'
import { createAppointmentCore, conferirPecasDoAgendamento, horarioOcupado, CREDITO_JA_USADO } from '@/lib/appointments/core'
import { pagoParaAgendar } from '@/lib/creditos/pago-no-app'
import { conferirCredito, type CreditoDeAgendamento } from '@/lib/creditos/credito'
import { quemRealizaOProcedimento, realiza } from '@/lib/procedimentos/quem-realiza'
import { agendamentoAoAlcance, cancelarCore, checkinCore, confirmarCore, remarcarCore, revalidarAgendamento } from '@/lib/appointments/alteracoes'
import { notifyCancelledAppointment, notifyCheckin, notifyNewAppointment, notifyRescheduledAppointment } from '@/lib/appointments/avisos'
import { avisoDasVencidasNaChegada } from '@/lib/appointments/vencidas-na-chegada'
import { podeCancelarAlgum, recusaDoCancelar } from '@/lib/appointments/quem-cancela'
import { TEXTO_DA_SESSAO_NA_DESISTENCIA } from '@/lib/atendimento/desistencia'
import { garantirClienteRapido, comPermissaoDeUnificar } from '@/lib/clients/cliente-rapido'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { trechoDoBloqueio } from '@/lib/agenda/bloqueio'
import { recusaDoHorarioPassado } from '@/lib/appointments/horario-passado'
import { fichasQueJaExistem, textoDaFichaQueJaExiste, type FichaQueJaExiste } from '@/lib/clients/ja-existe'
import { escolhasDaFichaQueJaExiste } from '@/lib/copilot/ferramentas/clientes-escrita'
import { avisoDaAgendaParaACliente, type FatoDaAgenda } from '@/lib/copilot/ferramentas/aviso-do-agendar'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { telefoneDoCopilot } from '@/lib/copilot/ferramentas/clientes-escrita'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, HORA, UUID, dinheiro, fusoDe, instanteDe, quandoLegivel, resolverCliente, resolverProcedimento,
  resolverProfissional, resolverSala, resolverUnidade, rota, nomesPorId, STATUS_DO_AGENDAMENTO, texto,
} from '@/lib/copilot/ferramentas/comum'
import { TELEFONE_INCOMPLETO } from '@/lib/contatos/propagar'

/**
 * As GRAVAÇÕES da agenda. Cada uma prepara (resolve nomes, confere alcance e
 * horário, monta o resumo do cartão) e só grava no "Confirmar", pelos MESMOS
 * núcleos da tela (`createAppointmentCore`, `remarcarCore`, `cancelarCore`) e
 * com os mesmos avisos ao paciente e à equipe.
 */

/**
 * O horário cai num BLOQUEIO da profissional (decisão 3 da 7ª simulação)? O
 * Copilot AVISA no cartão e deixa confirmar, como a agenda da equipe
 * (princípio 2, "não recusar o valor que a rede escolheu: no máximo, avisar";
 * 2026-11-18 — até aqui recusava e mandava encaixar pela agenda). Os livres
 * que ele oferece continuam sem o bloqueado (`computeAvailableSlots`).
 */
async function avisoDoBloqueado(c: ContextoDaFerramenta, a: { professionalId: string; nome: string; inicio: Date; duracaoMin: number; fuso: string }): Promise<string> {
  const [b] = await bloqueiosQueBatem(c.admin, { professionalId: a.professionalId, inicio: a.inicio, fim: new Date(a.inicio.getTime() + a.duracaoMin * 60_000) })
  return b ? `${a.nome} está com o horário bloqueado ${trechoDoBloqueio(b, a.fuso)} (${b.motivo}). O encaixe é permitido: confirme só se for isso mesmo. ` : ''
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
  /** A sala pedida (A1 da 27ª): da unidade, conferida como as outras peças. */
  sala?: string
  observacao?: string
}
interface PayloadAgendar {
  branchId: string; procedureId: string; professionalId: string; scheduledAt: string
  /** A sala do agendamento (A1 da 27ª); sem pedido, nenhuma — como era. */
  roomId?: string | null
  clientId: string | null; clienteNovo: { nome: string; telefone: string; jaExisteId?: string } | null; notes: string | null
  /** O que a cliente JÁ PAGOU deste procedimento (C5, F65): o "Já pago" da agenda, escolhido igual. */
  credito?: CreditoDeAgendamento | null
}

export const agendar: FerramentaDeEscrita<ArgsAgendar, PayloadAgendar> = {
  nome: 'agendar',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  descricao: 'Agenda um atendimento: cliente (id, nome ou telefone de quem já é cliente) OU clienteNovo {nome, telefone com DDD} para quem ainda não é; procedimento e profissional (nome ou id — passe o nome que a pessoa disse, "Dr. Caio": a ferramenta acha pelo nome entre quem atende na unidade, sem precisar buscar antes, e sem achar diz quem atende); data (AAAA-MM-DD) e hora (HH:MM, no horário da unidade); sala (nome ou id, "Sala 1"), quando a pessoa disser a sala — vai na sala, nunca na observação. Confira os horários livres antes. O cartão diz se a cliente recebe aviso no app.',
  parametros: z.object({
    cliente: texto({ min: 2, max: 120 }).optional(),
    // O nome da cliente nova, como o "+ Cliente" da agenda (garantirClienteRapido): 2 letras, sem teto.
    clienteNovo: z.object({ nome: texto({ min: 2, seCurto: 'Informe o nome de quem será atendido.' }), telefone: texto({ min: 8, max: 24, seCurto: TELEFONE_INCOMPLETO }) }).optional(),
    procedimento: texto({ min: 2, max: 80 }),
    profissional: texto({ min: 2, max: 80 }),
    data: DATA, hora: HORA,
    unidade: texto({ max: 80 }).optional(),
    sala: texto({ min: 1, max: 80 }).optional(),
    // A observação da janela "+ Agendar" não tem teto (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito.").
    observacao: z.string().optional(),
  }),
  async preparar(c, a) {
    if (!a.cliente && !a.clienteNovo) return { erro: 'Quem vai ser atendido? Informe o cliente (ou nome e telefone de um cliente novo).' }
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const unidade = u.unidade!
    const [proc, prof, sala] = await Promise.all([
      resolverProcedimento(c, a.procedimento, unidade.id),
      resolverProfissional(c, a.profissional, unidade.id),
      a.sala?.trim() ? resolverSala(c, a.sala.trim(), unidade.id) : Promise.resolve(null),
    ])
    if ('erro' in proc) return { erro: proc.erro }
    if ('erro' in prof) return { erro: prof.erro }
    if (sala && 'erro' in sala) return { erro: sala.erro }
    const roomId = sala?.id ?? null

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
    // A regra do núcleo (createAppointmentCore), com a mesma mensagem: o que é antes do minuto de agora
    // não se agenda (o Heitor, 25/11: "recusa, não dá pra agendar no passado"). Eram 5 minutos de
    // tolerância só no Copilot, que o núcleo recusava no Confirmar.
    const passou = recusaDoHorarioPassado(inicio.toISOString(), new Date(), fuso)
    if (passou) return { erro: passou }
    // Unidade, profissional (e que ela ATENDE nesta unidade — F65), cliente e
    // procedimento feito aqui: o núcleo, o mesmo da tela.
    // A sala pedida também (A1 da 27ª): ativa, da unidade e, com o procedimento ligado a salas, uma das dele.
    const recusa = await conferirPecasDoAgendamento(c.admin, c.ctx, { branchId: unidade.id, professionalId: prof.id, clientId, roomId, procedureId: proc.id })
    if (recusa) return { erro: recusa }

    // O "Já pago" (C5, F65): o que a cliente já pagou deste procedimento — a
    // sessão livre do plano, ou o crédito de pacote/pré-pago — entra sozinho,
    // como na janela "+ Agendar" (A20 da 8ª, princípio 3). Sem ele, o Copilot
    // agendava avulso e a comanda do PDV cobrava de novo.
    const pago = clientId ? await pagoParaAgendar(c.admin, c.ctx.tenantId!, clientId, proc.id) : null
    const credito: CreditoDeAgendamento | null = pago?.tipo === 'CREDITO' ? pago.credito
      : pago?.tipo === 'PLANO' ? { tipo: 'PLANO', id: pago.sessionId } : null
    let duracao = proc.duration_min || 60
    if (credito?.tipo === 'PLANO' && clientId) {
      const conferido = await conferirCredito(c.admin, c.ctx.tenantId!, clientId, credito)
      if (!('error' in conferido) && conferido.duracaoMin) duracao = conferido.duracaoMin
    }

    if (!(await livre(c, { professionalId: prof.id, inicio, duracaoMin: duracao }))) {
      return { erro: `${prof.name} já tem agendamento nesse horário. Veja os horários livres.` }
    }
    // A sala ocupada, a mesma conta do núcleo (que confere de novo no Confirmar).
    if (sala && !('erro' in sala) && await horarioOcupado(c.admin, { tenantId: c.ctx.tenantId!, roomId: sala.id, branchId: unidade.id, inicio, duracaoMin: duracao })) {
      return { erro: `A ${sala.name} já está ocupada nesse horário.` }
    }
    const avisoDoBloqueio = await avisoDoBloqueado(c, { professionalId: prof.id, nome: prof.name, inicio, duracaoMin: duracao, fuso })

    // "Quem realiza" (por-01): como a janela da agenda, AVISA sem barrar — o
    // encaixe é da clínica (princípio 2).
    const naoRealiza = !realiza(await quemRealizaOProcedimento(c.admin, proc.id), prof.id)
    const avisoDoRealiza = naoRealiza ? `${prof.name} não está em “Quem realiza” deste procedimento. ` : ''
    // A33 da 16ª: o aviso que chega de fato — só pelo app, e só a quem tem acesso.
    const avisoDaCliente = await avisoDaClienteNoCartao(c, clientId, 'agendar')

    return {
      resumo: {
        titulo: 'Agendar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: nomeDoCliente },
          { rotulo: 'Procedimento', valor: `${proc.name} · ${duracao} min` },
          { rotulo: 'Profissional', valor: prof.name },
          { rotulo: 'Quando', valor: quandoLegivel(inicio, fuso) },
          { rotulo: 'Unidade', valor: unidade.name },
          ...(sala && !('erro' in sala) ? [{ rotulo: 'Sala', valor: sala.name }] : []),
          pago
            // A3 da 25ª: "Incluído", não "Já pago" (o crediário tem parcelas em aberto).
            ? { rotulo: 'Incluído', valor: `${pago.texto} · ${dinheiro(pago.preco)}` }
            : { rotulo: 'Valor', valor: dinheiro(proc.price) },
          ...(a.observacao ? [{ rotulo: 'Observação', valor: a.observacao }] : []),
        ],
        aviso: avisoDoBloqueio + avisoDoRealiza + (jaExiste
          ? `${textoDaFichaQueJaExiste(jaExiste)} Nada foi gravado: agende numa ficha nova mesmo assim, ou na ficha que existe. ${avisoDaCliente}`
          : avisoDaCliente),
        ...(jaExiste ? { escolhas: escolhasDaFichaQueJaExiste(jaExiste) } : {}),
      },
      payload: {
        branchId: unidade.id, procedureId: proc.id, professionalId: prof.id, scheduledAt: inicio.toISOString(), roomId,
        clientId, clienteNovo, notes: a.observacao?.trim() || null, credito,
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
    const agendarCom = (credito: CreditoDeAgendamento | null) => createAppointmentCore(c.admin, c.ctx, {
      branchId: p.branchId, clientId: clientId!, procedureId: p.procedureId, professionalId: p.professionalId,
      scheduledAt: p.scheduledAt, roomId: p.roomId ?? null, notes: p.notes, source: 'INTERNAL', credito,
    })
    // O crédito que outro agendamento pegou entre o cartão e o Confirmar: agenda
    // avulso, como o app (a comanda do PDV cobra) — e a mensagem diz.
    let r = await agendarCom(p.credito ?? null)
    let semOCredito = false
    if ('error' in r && p.credito && r.error === CREDITO_JA_USADO) { r = await agendarCom(null); semOCredito = true }
    if ('error' in r) return { erro: r.error }
    revalidarAgendamento(c.ctx, r.id)
    notifyNewAppointment(r.id, c.ctx.internalUserId)
    return { mensagem: `Agendado para ${quandoLegivel(p.scheduledAt, await fusoDe(c, p.branchId))}.${semOCredito ? ' O que ela já tinha pago foi usado em outro agendamento: este fica avulso.' : ''}`, href: rota(c, `/agenda/${r.id}`), rotuloDoLink: 'Ver agendamento' }
  },
}

/**
 * O aviso que chega DE FATO à cliente, dito no cartão (A33 da 16ª; A23 da 17ª:
 * remarcar e cancelar prometiam "O cliente recebe o aviso" sempre). O aviso é
 * só pelo app, e só a quem tem acesso, com o app da cliente no plano.
 */
async function avisoDaClienteNoCartao(c: ContextoDaFerramenta, clientId: string | null | undefined, fato: FatoDaAgenda): Promise<string> {
  const temAcesso = clientId
    ? !!(await ler(c.admin.from('clients').select('auth_id').eq('id', clientId).eq('tenant_id', c.ctx.tenantId!).maybeSingle(), 'conferir o acesso da cliente') as { auth_id: string | null } | null)?.auth_id
    : false
  return avisoDaAgendaParaACliente(fato, { temAcesso, portalNoPlano: await redeTemRecurso(c.ctx.tenantId!, 'portal') })
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
    clientId: extra.client_id,
    cliente: clientes.get(extra.client_id) ?? 'Cliente',
    procedimento: procs.get(extra.procedure_id) ?? 'Atendimento',
    profissional: a.professional_id ? (profs.get(a.professional_id) ?? '—') : '—',
  }
}

/**
 * A frase do `remarcarCore` (`lib/appointments/alteracoes.ts`) para o
 * agendamento Em atendimento — repetida aqui, a mesma letra por letra
 * (`tests/copilot-remarcar-em-atendimento-e-tamanhos-como-a-tela.test.ts` trava).
 */
export const RECUSA_DO_REMARCAR_EM_ATENDIMENTO = 'Este agendamento está em atendimento agora: não se remarca. Para desistir, use "Cancelar" no atendimento.'

export const remarcar: FerramentaDeEscrita<{ agendamento: string; data: string; hora: string; profissional?: string }, { appointmentId: string; scheduledAt: string; professionalId: string | null; soQuemAtende?: boolean }> = {
  nome: 'remarcar',
  tipo: 'escrita',
  modulo: 'agenda', nivel: 'MANAGE',
  descricao: 'Remarca um agendamento (id, da ferramenta agendamentos) para outra data/hora (no horário da unidade dele) e, opcionalmente, outro profissional (pelo nome que a pessoa disse: a ferramenta acha entre quem atende, sem precisar buscar antes). Também REPASSA o atendimento a outra pessoa que atende ("repasse a Toxina da Neusa para a Bianca", "troque a profissional"): a mesma data e hora, com o profissional novo. O cartão diz se a cliente recebe o aviso no app.',
  parametros: z.object({ agendamento: UUID, data: DATA, hora: HORA, profissional: texto({ max: 80 }).optional() }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(ag.status)) return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    // O Em atendimento não se remarca (C15, F65): o remarcarCore recusa, mas só no
    // Confirmar — o cartão aparecia para algo que ia falhar. Recusa no preparo, com a frase dele.
    if (ag.status === 'IN_PROGRESS') return { erro: RECUSA_DO_REMARCAR_EM_ATENDIMENTO }
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
    // A regra do núcleo (remarcarCore), com a mesma mensagem: o horário NOVO que já passou não se remarca
    // (o Heitor, 25/11: "remarcar para o passado é possível desde que não tenha passado do horario já, o
    // que tornaria impossível desse atendimento acontecer"). Só trocar quem atende não é horário novo.
    if (inicio.getTime() !== new Date(ag.scheduled_at).getTime()) {
      const passou = recusaDoHorarioPassado(inicio.toISOString(), new Date(), fuso)
      if (passou) return { erro: passou }
    }
    const quem = professionalId ?? ag.professional_id
    if (quem && !(await livre(c, { professionalId: quem, inicio, duracaoMin: ag.duration_min || 60, excluir: ag.id }))) {
      return { erro: `${nomeDoProfissional} já tem agendamento nesse horário.` }
    }
    const avisoDoBloqueio = quem ? await avisoDoBloqueado(c, { professionalId: quem, nome: nomeDoProfissional, inicio, duracaoMin: ag.duration_min || 60, fuso }) : ''
    // A28 da 21ª (princípio 3): a troca só de quem atende saía "Remarcar
    // atendimento", com o De e o Para iguais, sem quem atendia nem a unidade. A
    // palavra é a da Equipe e da Auditoria ("Repassou"): trocar quem atende.
    const outraPessoa = professionalId !== null && professionalId !== ag.professional_id
    const mesmoHorario = inicio.getTime() === new Date(ag.scheduled_at).getTime()
    if (mesmoHorario && !outraPessoa) return { erro: `Nada muda: ${nomeDoProfissional} já atende neste horário.` }
    const soQuemAtende = mesmoHorario && outraPessoa
    const unidade = (await nomesPorId(c, 'branches', [ag.branch_id])).get(ag.branch_id) ?? '—'
    const quemAtende = { rotulo: 'Quem atende', valor: outraPessoa ? `${ag.profissional} → ${nomeDoProfissional}` : nomeDoProfissional }
    return {
      resumo: {
        titulo: soQuemAtende ? 'Trocar quem atende' : 'Remarcar atendimento',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          ...(soQuemAtende
            ? [{ rotulo: 'Quando', valor: quandoLegivel(inicio, fuso) }]
            : [{ rotulo: 'De', valor: quandoLegivel(ag.scheduled_at, fuso) }, { rotulo: 'Para', valor: quandoLegivel(inicio, fuso) }]),
          quemAtende,
          { rotulo: 'Unidade', valor: unidade },
        ],
        aviso: avisoDoBloqueio + await avisoDaClienteNoCartao(c, ag.clientId, 'remarcar'),
      },
      payload: { appointmentId: ag.id, scheduledAt: inicio.toISOString(), professionalId, ...(soQuemAtende ? { soQuemAtende: true } : {}) },
    }
  },
  async efetivar(c, p) {
    const { soQuemAtende, ...doNucleo } = p
    const r = await remarcarCore(c.admin, c.ctx, doNucleo)
    if ('error' in r) return { erro: r.error }
    revalidarAgendamento(c.ctx, p.appointmentId)
    notifyRescheduledAppointment(p.appointmentId, c.ctx.internalUserId)
    if (soQuemAtende && p.professionalId) {
      const nome = (await nomesPorId(c, 'users', [p.professionalId])).get(p.professionalId) ?? 'a pessoa escolhida'
      return { mensagem: `Agora quem atende é ${nome}.`, href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
    }
    const daUnidade = await ler(c.admin.from('appointments').select('branch_id').eq('id', p.appointmentId).maybeSingle(), 'ler a unidade do agendamento') as { branch_id: string | null } | null
    return { mensagem: `Remarcado para ${quandoLegivel(p.scheduledAt, await fusoDe(c, daUnidade?.branch_id))}.`, href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}

export const cancelar: FerramentaDeEscrita<{ agendamento: string; motivo: string }, { appointmentId: string; motivo: string }> = {
  nome: 'cancelar_agendamento',
  tipo: 'escrita',
  // A regra da tela (ATD-A01): cancelar é da Agenda em Gerenciar; o Em
  // atendimento é DESISTIR, do Atendimento em Gerenciar — conferido no preparo
  // e no núcleo (`recusaDoCancelar`).
  pode: podeCancelarAlgum,
  descricao: 'Cancela um agendamento (id) com o motivo (obrigatório — pergunte se não foi dito). O cartão diz se a cliente recebe o aviso no app.',
  // O motivo, como o Cancelar da agenda: só que exista, sem teto.
  parametros: z.object({ agendamento: UUID, motivo: texto({ min: 1, seCurto: 'Informe o motivo do cancelamento.' }) }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(ag.status)) return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
    const recusa = recusaDoCancelar(c.ctx, ag)
    if (recusa) return { erro: recusa }
    const daCliente = await avisoDaClienteNoCartao(c, ag.clientId, 'cancelar')
    // A desistência no meio: a sessão já paga conta como usada (o aviso da tela).
    const aviso = ag.status === 'IN_PROGRESS' ? [TEXTO_DA_SESSAO_NA_DESISTENCIA, daCliente].filter(Boolean).join(' ') : daCliente
    return {
      resumo: {
        titulo: ag.status === 'IN_PROGRESS' ? 'Cancelar atendimento' : 'Cancelar agendamento',
        linhas: [
          { rotulo: 'Cliente', valor: ag.cliente },
          { rotulo: 'Procedimento', valor: ag.procedimento },
          { rotulo: 'Quando', valor: quandoLegivel(ag.scheduled_at, await fusoDe(c, ag.branch_id)) },
          { rotulo: 'Motivo', valor: a.motivo },
        ],
        aviso,
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
  // Confirmar é da Agenda em Gerenciar (updateAppointmentStatus, C10).
  modulo: 'agenda', nivel: 'MANAGE',
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
  descricao: 'Faz o CHECK-IN de um agendamento (id): o cliente chegou à unidade (fica "chegou", na sala de espera). De agendamento "agendado" ou "confirmado".',
  parametros: z.object({ agendamento: UUID }),
  async preparar(c, a) {
    const ag = await agendamentoParaResumo(c, a.agendamento)
    if (!ag) return { erro: 'Agendamento não encontrado.' }
    // O agendado E o confirmado, como o núcleo da agenda (checkinCore) e a
    // descrição — recusava o confirmado (CP1).
    if (ag.status !== 'SCHEDULED' && ag.status !== 'CONFIRMED') return { erro: `Este agendamento está ${STATUS_DO_AGENDAMENTO[ag.status]}.` }
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
    // O aviso das parcelas vencidas, o mesmo da agenda (D13; ficou de fora do CP1).
    const aviso = await avisoDasVencidasNaChegada(c.ctx, p.appointmentId)
    return { mensagem: aviso ? `Check-in feito. ${aviso}` : 'Check-in feito.', href: rota(c, `/agenda/${p.appointmentId}`), rotuloDoLink: 'Ver agendamento' }
  },
}
