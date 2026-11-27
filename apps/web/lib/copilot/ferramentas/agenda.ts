import 'server-only'
import { z } from 'zod/v4'
import { computeAvailableSlots, podemOcuparDesde } from '@/lib/appointments/core'
import { ler } from '@/lib/db'
import { vistaPessoal } from '@/lib/auth'
import { ocupaOPeriodo } from '@/lib/metrics/agenda-do-dia'
import type { FerramentaDeLeitura, ContextoDaFerramenta } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, UUID, STATUS_DO_AGENDAMENTO, fusoDe, fusosPorUnidade, hojeNoFuso, horaAgoraNoFuso, idsDasUnidades, janelaDoDia, membroDesativado, membrosPorId, nomesPorId, ondeProcurou,
  quandoLegivel,
  resolverCliente, resolverProcedimento, resolverProfissional, resolverUnidade, rota,
} from '@/lib/copilot/ferramentas/comum'
import { periodoLegivel } from '@/lib/copilot/ferramentas/datas'

/**
 * As leituras da AGENDA. Quem tem a Agenda em Ver lê a agenda inteira das
 * unidades ao seu alcance, como na tela.
 */

const STATUS = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const
/** "Em aberto": o que ainda vai acontecer ou está acontecendo (D2 da 22ª). */
const EM_ABERTO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] as const

export const agendamentos: FerramentaDeLeitura<{
  de?: string; ate?: string; profissional?: string; unidade?: string; status?: (typeof STATUS)[number][]; emAberto?: boolean; cliente?: string
}> = {
  nome: 'agendamentos',
  tipo: 'leitura',
  modulo: 'agenda', nivel: 'VIEW',
  descricao: 'Lista os agendamentos de um dia ou período (até 31 dias), com cliente, procedimento, profissional e status. Filtros opcionais: profissional (nome ou id), unidade, status, cliente (nome, telefone ou id). "Os agendamentos da Fulana" pode ser de uma cliente ou quem atende: passe o nome em um dos dois — a ferramenta procura nos dois e, se o nome for dos dois, pergunta qual. Sem datas: com a cliente ou quem atende, de hoje em diante (30 dias); sem nenhum dos dois, só hoje. "Em aberto" (o que ainda vai acontecer ou está acontecendo) é emAberto: true — sem o concluído, o cancelado e a falta. Na resposta, diga o período lido ("periodo") — "Encontrei 1" sem o período parece o total. Sem unidade, procura em todas as unidades da pessoa; "procurouEm" diz quais — ao não encontrar, diga onde procurou. O atendimento que começou antes do período e ainda o ocupa (o que atravessa a meia-noite, o de vários dias) também vem, com o início real e continuaDeAntes: true — nele a pessoa não está livre.',
  parametros: z.object({
    de: DATA.optional().describe('Primeiro dia (AAAA-MM-DD). Padrão: hoje.'),
    ate: DATA.optional().describe('Último dia (AAAA-MM-DD). Padrão: o mesmo de "de"; com a cliente ou quem atende e sem datas, 30 dias depois de hoje.'),
    profissional: z.string().max(80).optional(),
    unidade: z.string().max(80).optional(),
    status: z.array(z.enum(STATUS)).max(7).optional().describe('SCHEDULED, CONFIRMED, ARRIVED (check-in), IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW. Padrão: todos menos cancelados.'),
    emAberto: z.boolean().optional().describe('true para "em aberto": agendado, confirmado, check-in e em atendimento (sem o concluído, o cancelado e a falta). Vence "status".'),
    cliente: z.string().min(1).max(120).optional().describe('Nome, telefone ou id do cliente.'),
  }),
  async executar(c, args) {
    // Sem unidade no pedido, em TODAS as da pessoa (D4 da 18ª), e diz onde procurou.
    const u = await resolverUnidade(c, args.unidade, { paraLer: true })
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    if (!unidades.length) return { dados: { agendamentos: [] } }
    const procurouEm = await ondeProcurou(c, unidades)
    // O dia é o da unidade (F62b): o de Manaus vai de 04:00 a 03:59 UTC.
    const fuso = await fusoDe(c, u.unidade?.id ?? (unidades.length === 1 ? unidades[0] : null))

    const hoje = hojeNoFuso(fuso)
    const de = args.de ?? hoje
    let ate = args.ate ?? de
    if (ate < de) return { dados: { erro: '"ate" antes de "de".' } }
    const dias = (janelaDoDia(ate, fuso).fim.getTime() - janelaDoDia(de, fuso).inicio.getTime()) / 86_400_000
    if (dias > 31.5) return { dados: { erro: 'Período de no máximo 31 dias.' } }

    let clienteId: string | null = null
    if (args.cliente) {
      if (UUID.safeParse(args.cliente).success) clienteId = args.cliente
      else {
        const cl = await resolverCliente(c, args.cliente)
        if ('erro' in cl) return { dados: { erro: cl.erro } }
        clienteId = cl.id
      }
    }
    // A27 da 19ª (princípio 3): "os agendamentos da Tereza" foi lido como uma
    // profissional Tereza, e a Tereza era cliente. Sem a cliente no pedido, o
    // nome dado como profissional se procura também entre as clientes: de um
    // só lado, vale ele (e a resposta diz como entendeu); dos dois, pergunta.
    let entendido: string | undefined
    let profissionalId: string | null = null
    // D2 da 22ª: o nome dado é de quem atende (ativo ou desativado).
    let deQuemAtende = false
    if (args.profissional) {
      const p = await resolverProfissional(c, args.profissional, u.unidade?.id)
      const cl = !args.cliente && !UUID.safeParse(args.profissional).success ? await resolverCliente(c, args.profissional) : null
      const cliente = cl && !('erro' in cl) ? cl : null
      if (!('erro' in p) && cliente) {
        return { dados: { erro: `"${args.profissional}" pode ser quem atende (${p.name}) ou a cliente ${cliente.name}. Qual?` } }
      }
      // A31 da 21ª (princípios 3 e 7): quem teve o acesso desativado sai de
      // "quem atende", e os agendamentos que ficaram com essa pessoa não se
      // achavam — o Copilot perguntava "quer que eu procure?". Para LER, vale.
      const desativado = 'erro' in p && !cliente && p.erro.includes('não encontrado') ? await membroDesativado(c, args.profissional) : null
      if (desativado) {
        profissionalId = desativado.id
        deQuemAtende = true
      } else if ('erro' in p) {
        if (!cliente) return { dados: { erro: cl && 'erro' in cl && cl.erro.startsWith('Mais de um') ? cl.erro : p.erro } }
        clienteId = cliente.id
        entendido = `Ninguém que atende se chama "${args.profissional}": estes são os agendamentos da cliente ${cliente.name}.`
      } else {
        profissionalId = p.id
        deQuemAtende = true
      }
    }

    // D2 da 20ª (princípio 3): "os agendamentos da Neusa", sem datas, leu só
    // hoje e deixou de fora a Toxina de amanhã. Com a cliente, sem datas, é de
    // hoje em diante (30 dias); e a resposta diz o período lido. D2 da 22ª: o
    // mesmo com quem atende ("os agendamentos do Dr. Otávio em aberto" leu só hoje).
    if ((clienteId || deQuemAtende) && !args.de && !args.ate) ate = maisDias(de, 30)
    const periodo = de === ate ? `${de === hoje ? 'hoje, ' : ''}${diaLegivel(de)}` : `de ${periodoLegivel(de, ate)}`

    let q = c.admin.from('appointments')
      .select('id, scheduled_at, duration_min, status, branch_id, client_id, procedure_id, professional_id')
      .in('branch_id', unidades)
      .gte('scheduled_at', janelaDoDia(de, fuso).inicio.toISOString())
      .lte('scheduled_at', janelaDoDia(ate, fuso).fim.toISOString())
      .order('scheduled_at').limit(80)
    if (profissionalId) q = q.eq('professional_id', profissionalId)
    if (clienteId) q = q.eq('client_id', clienteId)
    // D2 da 22ª: "em aberto" trazia o concluído (o padrão é "todos menos cancelados").
    q = args.emAberto ? q.in('status', [...EM_ABERTO])
      : args.status?.length ? q.in('status', args.status) : q.neq('status', 'CANCELLED')

    const doPeriodo = (await ler(q, 'ler os agendamentos') as {
      id: string; scheduled_at: string; duration_min: number; status: string
      branch_id: string; client_id: string; procedure_id: string; professional_id: string | null
    }[] | null) ?? []
    // 25/11 (princípio 3): o que começou ANTES do período e ainda o ocupa (o que
    // atravessa a meia-noite, o de vários dias) também acontece nele — sem ele,
    // "os horários da Fulana hoje" a davam como livre.
    const continuam = await osQueContinuamDeAntes(c, janelaDoDia(de, fuso).inicio, janelaDoDia(ate, fuso).fim,
      situacoesQueContinuam(args.emAberto ? [...EM_ABERTO] : args.status?.length ? args.status : null),
      x => {
        let q2 = x.in('branch_id', unidades)
        if (profissionalId) q2 = q2.eq('professional_id', profissionalId)
        if (clienteId) q2 = q2.eq('client_id', clienteId)
        return q2
      })
    const idsQueContinuam = new Set(continuam.map(x => x.id))
    const linhas = [...continuam, ...doPeriodo.filter(l => !idsQueContinuam.has(l.id))]

    const [clientes, procs, profs, nomesDasUnidades, fusos] = await Promise.all([
      nomesPorId(c, 'clients', linhas.map(l => l.client_id)),
      nomesPorId(c, 'procedures', linhas.map(l => l.procedure_id)),
      membrosPorId(c, linhas.map(l => l.professional_id)),
      nomesPorId(c, 'branches', linhas.map(l => l.branch_id)),
      fusosPorUnidade(c, linhas.map(l => l.branch_id)),
    ])
    const lista = linhas.map(l => ({
      id: l.id,
      // A hora de cada agendamento no relógio da unidade dele.
      quando: quandoLegivel(l.scheduled_at, fusos.get(l.branch_id) ?? fuso),
      duracaoMin: l.duration_min,
      cliente: clientes.get(l.client_id) ?? '—',
      clienteId: l.client_id,
      procedimento: procs.get(l.procedure_id) ?? '—',
      profissional: l.professional_id ? nomeDeQuemAtende(profs.get(l.professional_id)) : 'sem profissional',
      unidade: nomesDasUnidades.get(l.branch_id) ?? '—',
      status: STATUS_DO_AGENDAMENTO[l.status] ?? l.status,
      href: rota(c, `/agenda/${l.id}`),
      // 25/11: começou antes do período e continua nele ("quando" é o início real).
      ...(idsQueContinuam.has(l.id) ? { continuaDeAntes: true } : {}),
    }))
    // A31 da 21ª: quem tem o acesso desativado e ainda tem agendamento, dito — com o caminho.
    const desativados = [...new Set(linhas.map(l => l.professional_id).filter((id): id is string => !!id && profs.get(id)?.ativo === false))]
      .map(id => profs.get(id)!.name)
    const avisos = [
      ...(desativados.length ? [`${desativados.join(', ')} ${desativados.length === 1 ? 'está' : 'estão'} com o acesso desativado: estes agendamentos seguem no nome ${desativados.length === 1 ? 'dessa pessoa' : 'delas'}. Para passá-los a quem atende, troque quem atende em cada um — na agenda, ou pedindo aqui.`] : []),
      ...(doPeriodo.length === 80 ? ['Mostrando os 80 primeiros.'] : []),
    ]
    // A32 da 23ª (princípio 3): o item dizia só "10:00 · Bianca Lopes" numa
    // lista de 17 a 19/11 nas duas unidades. O dia vai quando o período tem
    // mais de um; a unidade, quando a pessoa alcança mais de uma.
    const variosDias = de !== ate
    const variasUnidades = (await idsDasUnidades(c, null)).length > 1
    return {
      dados: { periodo, ...(entendido ? { entendido } : {}), procurouEm, total: lista.length, agendamentos: lista, ...(avisos.length ? { aviso: avisos.join(' ') } : {}) },
      cartao: lista.length ? {
        // A29 da 19ª: o período em dd/mm, como o dia (era "2026-11-16 a 2026-12-16").
        tipo: 'links', titulo: `Agenda · ${de === ate ? quandoLegivel(janelaDoDia(de, fuso).inicio, fuso).split(' às')[0] : periodoLegivel(de, ate)}`,
        itens: lista.slice(0, 12).map(a => ({
          texto: `${textoDoQuando(a, variosDias)} · ${a.cliente}`,
          detalhe: [a.procedimento, a.profissional, ...(variasUnidades ? [a.unidade] : []), a.status].join(' · '),
          href: a.href,
        })),
      } : undefined,
    }
  },
}

/**
 * A MINHA AGENDA (a vista pessoal, SM2 — CLAUDE.md §11), no Copilot desde a
 * revisão de 24/11 (docs/catalogo/copilot.md, Q03): quem atende e não tem a
 * Agenda pergunta pelos horários DELA. Só lê, e só os dela — o filtro é o id
 * dela (`vistaPessoal`), nunca um nome do pedido. Nas unidades ao alcance dela;
 * sem datas, de hoje a 30 dias (como "os agendamentos de quem atende", CJ-09).
 */
export const minhaAgenda: FerramentaDeLeitura<{ de?: string; ate?: string; unidade?: string; emAberto?: boolean }> = {
  nome: 'minha_agenda',
  tipo: 'leitura',
  recurso: 'agenda',
  // Só quem tem a vista: quem atende sem a Agenda (com ela, é `agendamentos`).
  pode: ctx => vistaPessoal(ctx, 'agenda') !== null,
  descricao: 'A Minha agenda: só os agendamentos DESTA pessoa (ela atende e não tem a Agenda) num dia ou período (até 31 dias), com cliente, procedimento, unidade e status. Sem datas, de hoje a 30 dias. "Em aberto" é emAberto: true (sem o concluído, o cancelado e a falta). Só lê: a agenda dos outros não vem, e agendar, remarcar e cancelar pedem a Agenda. O dela que começou antes do período e ainda o ocupa também vem, com o início real e continuaDeAntes: true. Na resposta, diga o período lido ("periodo").',
  parametros: z.object({
    de: DATA.optional().describe('Primeiro dia (AAAA-MM-DD). Padrão: hoje.'),
    ate: DATA.optional().describe('Último dia (AAAA-MM-DD). Padrão: o mesmo de "de"; sem datas, 30 dias depois de hoje.'),
    unidade: z.string().max(80).optional(),
    emAberto: z.boolean().optional(),
  }),
  async executar(c, args) {
    const eu = vistaPessoal(c.ctx, 'agenda')
    if (!eu) return { dados: { erro: 'A Minha agenda é de quem atende e não tem a Agenda.' } }
    const u = await resolverUnidade(c, args.unidade, { paraLer: true })
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    if (!unidades.length) return { dados: { agendamentos: [] } }
    const procurouEm = await ondeProcurou(c, unidades)
    const fuso = await fusoDe(c, u.unidade?.id ?? (unidades.length === 1 ? unidades[0] : null))
    const hoje = hojeNoFuso(fuso)
    const de = args.de ?? hoje
    const ate = args.ate ?? (args.de ? de : maisDias(de, 30))
    if (ate < de) return { dados: { erro: '"ate" antes de "de".' } }
    const dias = (janelaDoDia(ate, fuso).fim.getTime() - janelaDoDia(de, fuso).inicio.getTime()) / 86_400_000
    if (dias > 31.5) return { dados: { erro: 'Período de no máximo 31 dias.' } }
    const periodo = de === ate ? `${de === hoje ? 'hoje, ' : ''}${diaLegivel(de)}` : `de ${periodoLegivel(de, ate)}`

    let q = c.admin.from('appointments')
      .select('id, scheduled_at, duration_min, status, branch_id, client_id, procedure_id')
      .eq('professional_id', eu)
      .in('branch_id', unidades)
      .gte('scheduled_at', janelaDoDia(de, fuso).inicio.toISOString())
      .lte('scheduled_at', janelaDoDia(ate, fuso).fim.toISOString())
      .order('scheduled_at').limit(80)
    q = args.emAberto ? q.in('status', [...EM_ABERTO]) : q.neq('status', 'CANCELLED')
    const doPeriodo = (await ler(q, 'ler a minha agenda') as {
      id: string; scheduled_at: string; duration_min: number; status: string; branch_id: string; client_id: string; procedure_id: string
    }[] | null) ?? []
    // 25/11: o dela que começou antes do período e ainda o ocupa também vem.
    const continuam = await osQueContinuamDeAntes(c, janelaDoDia(de, fuso).inicio, janelaDoDia(ate, fuso).fim,
      situacoesQueContinuam(args.emAberto ? [...EM_ABERTO] : null),
      x => x.eq('professional_id', eu).in('branch_id', unidades))
    const idsQueContinuam = new Set(continuam.map(x => x.id))
    const linhas = [...continuam, ...doPeriodo.filter(l => !idsQueContinuam.has(l.id))]

    const [clientes, procs, nomesDasUnidades, fusos] = await Promise.all([
      nomesPorId(c, 'clients', linhas.map(l => l.client_id)),
      nomesPorId(c, 'procedures', linhas.map(l => l.procedure_id)),
      nomesPorId(c, 'branches', linhas.map(l => l.branch_id)),
      fusosPorUnidade(c, linhas.map(l => l.branch_id)),
    ])
    const lista = linhas.map(l => ({
      id: l.id,
      quando: quandoLegivel(l.scheduled_at, fusos.get(l.branch_id) ?? fuso),
      duracaoMin: l.duration_min,
      cliente: clientes.get(l.client_id) ?? '—',
      procedimento: procs.get(l.procedure_id) ?? '—',
      unidade: nomesDasUnidades.get(l.branch_id) ?? '—',
      status: STATUS_DO_AGENDAMENTO[l.status] ?? l.status,
      href: rota(c, `/agenda/${l.id}`),
      ...(idsQueContinuam.has(l.id) ? { continuaDeAntes: true } : {}),
    }))
    const variosDias = de !== ate
    const variasUnidades = unidades.length > 1
    return {
      dados: { periodo, procurouEm, total: lista.length, agendamentos: lista, ...(doPeriodo.length === 80 ? { aviso: 'Mostrando os 80 primeiros.' } : {}) },
      cartao: lista.length ? {
        tipo: 'links', titulo: `Minha agenda · ${de === ate ? quandoLegivel(janelaDoDia(de, fuso).inicio, fuso).split(' às')[0] : periodoLegivel(de, ate)}`,
        itens: lista.slice(0, 12).map(a => ({
          texto: `${textoDoQuando(a, variosDias)} · ${a.cliente}`,
          detalhe: [a.procedimento, ...(variasUnidades ? [a.unidade] : []), a.status].join(' · '),
          href: a.href,
        })),
      } : undefined,
    }
  },
}

/** O nome de quem atende na lista; com o acesso desativado, dito (A31 da 21ª). */
function nomeDeQuemAtende(m: { name: string; ativo: boolean } | undefined): string {
  if (!m) return '—'
  return m.ativo ? m.name : `${m.name} (acesso desativado)`
}

/** O que a leitura de agenda pega de cada agendamento. */
const COLUNAS = 'id, scheduled_at, duration_min, status, completed_at, branch_id, client_id, procedure_id, professional_id'
type LinhaQueContinua = {
  id: string; scheduled_at: string; duration_min: number; status: string; completed_at: string | null
  branch_id: string; client_id: string; procedure_id: string; professional_id: string | null
}
type ConsultaDaAgenda = ReturnType<ReturnType<ContextoDaFerramenta['admin']['from']>['select']>

/**
 * As situações em que um agendamento CONTINUA de antes: as pedidas (ou, sem
 * pedido, todas), sem o cancelado e a falta — eles não ocupam nada fora do
 * dia deles (a regra do desenho, `trechoDoAgendamentoNoDia`).
 */
function situacoesQueContinuam(pedidas: readonly string[] | null): string[] {
  return (pedidas ?? STATUS).filter(s => s !== 'CANCELLED' && s !== 'NO_SHOW')
}

const POR_PAGINA = 1000

/**
 * Os agendamentos que começaram ANTES do período e ainda ocupam o início dele
 * (25/11; princípio 3). O procedimento não tem duração máxima: a lista pelo
 * início deixava de fora o atendimento que continua de ontem, e o Copilot dava
 * a pessoa como livre. A consulta é a de quem pode ocupar (`podemOcuparDesde`,
 * a régua do choque), em páginas — o "de qualquer duração" traz os longos de
 * antes, e nada se corta calado (a página seguinte parte do último início lido);
 * o que de fato ainda ocupa o período decide `ocupaOPeriodo` (lib/metrics).
 */
async function osQueContinuamDeAntes(
  c: ContextoDaFerramenta, inicio: Date, fim: Date, situacoes: string[],
  recorte: (q: ConsultaDaAgenda) => ConsultaDaAgenda,
): Promise<LinhaQueContinua[]> {
  if (!situacoes.length) return []
  const antesDoInicio = new Date(inicio.getTime() - 1).toISOString()
  const vistos = new Map<string, LinhaQueContinua>()
  for (let desde: string | null = null, guarda = 0; guarda < 1000; guarda++) {
    let q = recorte(c.admin.from('appointments').select(COLUNAS))
      .or(podemOcuparDesde(inicio.getTime()))
      .lte('scheduled_at', antesDoInicio)
      .in('status', situacoes)
    if (desde) q = q.gte('scheduled_at', desde)
    const pagina = (await ler(q.order('scheduled_at').order('id').limit(POR_PAGINA), 'ler os agendamentos que continuam de antes') as LinhaQueContinua[] | null) ?? []
    let novos = 0
    for (const l of pagina) if (!vistos.has(l.id)) { vistos.set(l.id, l); novos++ }
    if (pagina.length < POR_PAGINA || !novos) break
    desde = pagina[pagina.length - 1]!.scheduled_at
  }
  return [...vistos.values()]
    .filter(l => new Date(l.scheduled_at).getTime() < inicio.getTime() && ocupaOPeriodo(l, inicio, fim))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
}

/** A hora do item no cartão: no dia, só a hora; em vários dias, ou no que continua de antes, o dia também ("desde"). */
function textoDoQuando(a: { quando: string; continuaDeAntes?: boolean }, variosDias: boolean): string {
  if (a.continuaDeAntes) return `desde ${a.quando}`
  return variosDias ? a.quando : (a.quando.split(' às ')[1] ?? a.quando)
}

/** "AAAA-MM-DD" + n dias (a data do calendário, sem fuso). */
function maisDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "16/11" de "2026-11-16". */
const diaLegivel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export const horariosLivres: FerramentaDeLeitura<{ data: string; profissional: string; procedimento?: string; unidade?: string }> = {
  nome: 'horarios_livres',
  tipo: 'leitura',
  modulo: 'agenda', nivel: 'VIEW',
  // D4 da 17ª (princípio 3): dizia "das 8h às 20h", e o modelo leu a grade como
  // a agenda inteira — chamou de "não disponível" um 21:25 que o agendar aceitava.
  descricao: 'SUGESTÕES de horário de UM profissional num dia: uma grade de 30 em 30 min dentro do horário da unidade e do profissional, já sem os ocupados e os bloqueios. Com o procedimento, considera a duração dele. Use para oferecer opções quando a pessoa não disse a hora. A grade não é a agenda inteira: um horário fora dela (21:25, por exemplo) pode estar livre — quando a pessoa pede um horário, chame agendar ou remarcar com ele, que conferem o conflito e dizem se não dá. O profissional vai pelo nome que a pessoa disse: a ferramenta acha entre quem atende na unidade (sem precisar buscar antes) e, sem achar, diz quem atende.',
  parametros: z.object({
    data: DATA,
    profissional: z.string().min(1).max(80).describe('Nome ou id do profissional.'),
    procedimento: z.string().max(80).optional().describe('Nome ou id — para a duração.'),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    const p = await resolverProfissional(c, args.profissional, u.unidade?.id)
    if ('erro' in p) return { dados: { erro: p.erro } }

    const unidadeId = u.unidade?.id ?? p.branch_id ?? c.ctx.branchId
    if (!unidadeId) {
      const todas = await resolverUnidade(c, null, { exigir: true })
      return { dados: { erro: 'erro' in todas ? todas.erro : 'Qual unidade?' } }
    }
    let duracao = 30
    let procedimento: string | null = null
    if (args.procedimento) {
      const pr = await resolverProcedimento(c, args.procedimento, unidadeId)
      if ('erro' in pr) return { dados: { erro: pr.erro } }
      duracao = pr.duration_min || 30
      procedimento = pr.name
    }
    let livres = await computeAvailableSlots(c.admin, unidadeId, p.id, args.data, duracao)
    // Hoje: o que já passou não é livre — no relógio da unidade (F62b), como os horários.
    const fuso = await fusoDe(c, unidadeId)
    const hoje = hojeNoFuso(fuso)
    if (args.data === hoje) {
      const agora = horaAgoraNoFuso(fuso)
      livres = livres.filter(h => h > agora)
    }
    if (args.data < hoje) livres = []
    return {
      dados: { data: args.data, profissional: p.name, profissionalId: p.id, unidadeId, procedimento, duracaoMin: duracao, livres },
      cartao: livres.length ? {
        tipo: 'links', titulo: `Livres · ${p.name} · ${quandoLegivel(janelaDoDia(args.data, fuso).inicio, fuso).split(' às')[0]}`,
        itens: [{ texto: livres.slice(0, 24).join('  ·  ') }],
      } : undefined,
    }
  },
}
