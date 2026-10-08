import 'server-only'
import { z } from 'zod/v4'
import { ownerFilter } from '@/lib/auth'
import { computeAvailableSlots } from '@/lib/appointments/core'
import { ler } from '@/lib/db'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import {
  DATA, UUID, STATUS_DO_AGENDAMENTO, hojeEmBrasilia, idsDasUnidades, janelaDoDia, nomesPorId, quandoLegivel,
  resolverProcedimento, resolverProfissional, resolverUnidade, rota,
} from '@/lib/copilot/ferramentas/comum'

/**
 * As leituras da AGENDA. Escopo "só os meus" (ownerFilter) vale aqui como na
 * tela: o profissional que só vê a própria agenda só lê a própria agenda.
 */

const STATUS = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const

export const agendamentos: FerramentaDeLeitura<{
  de?: string; ate?: string; profissional?: string; unidade?: string; status?: (typeof STATUS)[number][]; cliente?: string
}> = {
  nome: 'agendamentos',
  tipo: 'leitura',
  modulo: 'agenda', nivel: 'VIEW',
  descricao: 'Lista os agendamentos de um dia ou período (até 31 dias), com cliente, procedimento, profissional e status. Filtros opcionais: profissional (nome ou id), unidade, status, cliente (id). Sem datas, é hoje.',
  parametros: z.object({
    de: DATA.optional().describe('Primeiro dia (AAAA-MM-DD). Padrão: hoje.'),
    ate: DATA.optional().describe('Último dia (AAAA-MM-DD). Padrão: o mesmo de "de".'),
    profissional: z.string().max(80).optional(),
    unidade: z.string().max(80).optional(),
    status: z.array(z.enum(STATUS)).max(6).optional().describe('SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW. Padrão: todos menos cancelados.'),
    cliente: UUID.optional().describe('Id do cliente (use buscar antes).'),
  }),
  async executar(c, args) {
    const de = args.de ?? hojeEmBrasilia()
    const ate = args.ate ?? de
    if (ate < de) return { dados: { erro: '"ate" antes de "de".' } }
    const dias = (janelaDoDia(ate).fim.getTime() - janelaDoDia(de).inicio.getTime()) / 86_400_000
    if (dias > 31.5) return { dados: { erro: 'Período de no máximo 31 dias.' } }

    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    if (!unidades.length) return { dados: { agendamentos: [] } }

    let profissionalId = ownerFilter(c.ctx, 'agenda')
    if (args.profissional) {
      const p = await resolverProfissional(c, args.profissional, u.unidade?.id)
      if ('erro' in p) return { dados: { erro: p.erro } }
      if (profissionalId && p.id !== profissionalId) return { dados: { erro: 'O seu cargo só vê a sua própria agenda.' } }
      profissionalId = p.id
    }

    let q = c.admin.from('appointments')
      .select('id, scheduled_at, duration_min, status, branch_id, client_id, procedure_id, professional_id')
      .in('branch_id', unidades)
      .gte('scheduled_at', janelaDoDia(de).inicio.toISOString())
      .lte('scheduled_at', janelaDoDia(ate).fim.toISOString())
      .order('scheduled_at').limit(80)
    if (profissionalId) q = q.eq('professional_id', profissionalId)
    if (args.cliente) q = q.eq('client_id', args.cliente)
    q = args.status?.length ? q.in('status', args.status) : q.neq('status', 'CANCELLED')

    const linhas = (await ler(q, 'ler os agendamentos') as {
      id: string; scheduled_at: string; duration_min: number; status: string
      branch_id: string; client_id: string; procedure_id: string; professional_id: string | null
    }[] | null) ?? []

    const [clientes, procs, profs, filiais] = await Promise.all([
      nomesPorId(c, 'clients', linhas.map(l => l.client_id)),
      nomesPorId(c, 'procedures', linhas.map(l => l.procedure_id)),
      nomesPorId(c, 'users', linhas.map(l => l.professional_id)),
      nomesPorId(c, 'branches', linhas.map(l => l.branch_id)),
    ])
    const lista = linhas.map(l => ({
      id: l.id,
      quando: quandoLegivel(l.scheduled_at),
      duracaoMin: l.duration_min,
      cliente: clientes.get(l.client_id) ?? '—',
      clienteId: l.client_id,
      procedimento: procs.get(l.procedure_id) ?? '—',
      profissional: l.professional_id ? (profs.get(l.professional_id) ?? '—') : 'sem profissional',
      unidade: filiais.get(l.branch_id) ?? '—',
      status: STATUS_DO_AGENDAMENTO[l.status] ?? l.status,
      href: rota(c, `/agenda/${l.id}`),
    }))
    return {
      dados: { periodo: de === ate ? de : `${de} a ${ate}`, total: lista.length, agendamentos: lista, ...(linhas.length === 80 ? { aviso: 'Mostrando os 80 primeiros.' } : {}) },
      cartao: lista.length ? {
        tipo: 'links', titulo: `Agenda · ${de === ate ? quandoLegivel(janelaDoDia(de).inicio).split(' às')[0] : `${de} a ${ate}`}`,
        itens: lista.slice(0, 12).map(a => ({ texto: `${a.quando.split(' às ')[1] ?? a.quando} · ${a.cliente}`, detalhe: `${a.procedimento} · ${a.profissional} · ${a.status}`, href: a.href })),
      } : undefined,
    }
  },
}

export const horariosLivres: FerramentaDeLeitura<{ data: string; profissional: string; procedimento?: string; unidade?: string }> = {
  nome: 'horarios_livres',
  tipo: 'leitura',
  modulo: 'agenda', nivel: 'VIEW',
  descricao: 'Horários livres de UM profissional num dia (de 30 em 30 min, das 8h às 20h), já sem os ocupados. Com o procedimento, considera a duração dele. Use antes de agendar ou remarcar.',
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
    if (dono && p.id !== dono) return { dados: { erro: 'O seu cargo só vê a sua própria agenda.' } }

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
    // Hoje: o que já passou não é livre.
    if (args.data === hojeEmBrasilia()) {
      const agora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
      livres = livres.filter(h => h > agora)
    }
    if (args.data < hojeEmBrasilia()) livres = []
    return {
      dados: { data: args.data, profissional: p.name, profissionalId: p.id, unidadeId, procedimento, duracaoMin: duracao, livres },
      cartao: livres.length ? {
        tipo: 'links', titulo: `Livres · ${p.name} · ${quandoLegivel(janelaDoDia(args.data).inicio).split(' às')[0]}`,
        itens: [{ texto: livres.slice(0, 24).join('  ·  ') }],
      } : undefined,
    }
  },
}
