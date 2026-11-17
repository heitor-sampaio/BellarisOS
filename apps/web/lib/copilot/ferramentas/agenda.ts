import 'server-only'
import { z } from 'zod/v4'
import { ownerFilter } from '@/lib/auth'
import { computeAvailableSlots } from '@/lib/appointments/core'
import { ler } from '@/lib/db'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, UUID, STATUS_DO_AGENDAMENTO, fusoDe, fusosPorUnidade, hojeNoFuso, horaAgoraNoFuso, idsDasUnidades, janelaDoDia, membroDesativado, membrosPorId, nomesPorId, ondeProcurou,
  quandoLegivel,
  resolverCliente, resolverProcedimento, resolverProfissional, resolverUnidade, rota,
} from '@/lib/copilot/ferramentas/comum'
import { periodoLegivel } from '@/lib/copilot/ferramentas/datas'

/**
 * As leituras da AGENDA. Escopo "só os meus" (ownerFilter) vale aqui como na
 * tela: o profissional que só vê a própria agenda só lê a própria agenda.
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
  descricao: 'Lista os agendamentos de um dia ou período (até 31 dias), com cliente, procedimento, profissional e status. Filtros opcionais: profissional (nome ou id), unidade, status, cliente (nome, telefone ou id). "Os agendamentos da Fulana" pode ser de uma cliente ou quem atende: passe o nome em um dos dois — a ferramenta procura nos dois e, se o nome for dos dois, pergunta qual. Sem datas: com a cliente ou quem atende, de hoje em diante (30 dias); sem nenhum dos dois, só hoje. "Em aberto" (o que ainda vai acontecer ou está acontecendo) é emAberto: true — sem o concluído, o cancelado e a falta. Na resposta, diga o período lido ("periodo") — "Encontrei 1" sem o período parece o total. Sem unidade, procura em todas as unidades da pessoa; "procurouEm" diz quais — ao não encontrar, diga onde procurou.',
  parametros: z.object({
    de: DATA.optional().describe('Primeiro dia (AAAA-MM-DD). Padrão: hoje.'),
    ate: DATA.optional().describe('Último dia (AAAA-MM-DD). Padrão: o mesmo de "de"; com a cliente ou quem atende e sem datas, 30 dias depois de hoje.'),
    profissional: z.string().max(80).optional(),
    unidade: z.string().max(80).optional(),
    status: z.array(z.enum(STATUS)).max(7).optional().describe('SCHEDULED, CONFIRMED, ARRIVED (chegou), IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW. Padrão: todos menos cancelados.'),
    emAberto: z.boolean().optional().describe('true para "em aberto": agendado, confirmado, chegou e em atendimento (sem o concluído, o cancelado e a falta). Vence "status".'),
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
    let profissionalId = ownerFilter(c.ctx, 'agenda')
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
        if (profissionalId && desativado.id !== profissionalId) return { dados: { erro: 'A sua permissão só vê a sua própria agenda.' } }
        profissionalId = desativado.id
        deQuemAtende = true
      } else if ('erro' in p) {
        if (!cliente) return { dados: { erro: cl && 'erro' in cl && cl.erro.startsWith('Mais de um') ? cl.erro : p.erro } }
        clienteId = cliente.id
        entendido = `Ninguém que atende se chama "${args.profissional}": estes são os agendamentos da cliente ${cliente.name}.`
      } else {
        if (profissionalId && p.id !== profissionalId) return { dados: { erro: 'A sua permissão só vê a sua própria agenda.' } }
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

    const linhas = (await ler(q, 'ler os agendamentos') as {
      id: string; scheduled_at: string; duration_min: number; status: string
      branch_id: string; client_id: string; procedure_id: string; professional_id: string | null
    }[] | null) ?? []

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
    }))
    // A31 da 21ª: quem tem o acesso desativado e ainda tem agendamento, dito — com o caminho.
    const desativados = [...new Set(linhas.map(l => l.professional_id).filter((id): id is string => !!id && profs.get(id)?.ativo === false))]
      .map(id => profs.get(id)!.name)
    const avisos = [
      ...(desativados.length ? [`${desativados.join(', ')} ${desativados.length === 1 ? 'está' : 'estão'} com o acesso desativado: estes agendamentos seguem no nome ${desativados.length === 1 ? 'dessa pessoa' : 'delas'}. Para passá-los a quem atende, troque quem atende em cada um — na agenda, ou pedindo aqui.`] : []),
      ...(linhas.length === 80 ? ['Mostrando os 80 primeiros.'] : []),
    ]
    return {
      dados: { periodo, ...(entendido ? { entendido } : {}), procurouEm, total: lista.length, agendamentos: lista, ...(avisos.length ? { aviso: avisos.join(' ') } : {}) },
      cartao: lista.length ? {
        // A29 da 19ª: o período em dd/mm, como o dia (era "2026-11-16 a 2026-12-16").
        tipo: 'links', titulo: `Agenda · ${de === ate ? quandoLegivel(janelaDoDia(de, fuso).inicio, fuso).split(' às')[0] : periodoLegivel(de, ate)}`,
        itens: lista.slice(0, 12).map(a => ({ texto: `${a.quando.split(' às ')[1] ?? a.quando} · ${a.cliente}`, detalhe: `${a.procedimento} · ${a.profissional} · ${a.status}`, href: a.href })),
      } : undefined,
    }
  },
}

/** O nome de quem atende na lista; com o acesso desativado, dito (A31 da 21ª). */
function nomeDeQuemAtende(m: { name: string; ativo: boolean } | undefined): string {
  if (!m) return '—'
  return m.ativo ? m.name : `${m.name} (acesso desativado)`
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
    const dono = ownerFilter(c.ctx, 'agenda')
    if (dono && p.id !== dono) return { dados: { erro: 'A sua permissão só vê a sua própria agenda.' } }

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
