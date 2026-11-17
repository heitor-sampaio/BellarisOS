import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'

/**
 * D1, A13, A14 e A15 da 20ª simulação (2026-11-17), as automações.
 *
 * D1 [3, 6]: a Camila marcou um Peeling para 23/11 às 09:00 e o remarcou para
 * 24/11 às 10:00. O "Lembrete antes do agendamento" seguiu esperando até
 * 22/11 às 09:00 — um dia antes da data ANTIGA: o "Um dia antes" espera pelo
 * dado do fato (`evento.dados.agendadoPara`), e nada mexia na espera. Agora a
 * remarcação reprograma a espera do agendamento: sai um dia antes do horário
 * que vale agora; remarcado para mais cedo, a espera vem junto (ou sai já).
 * A13 [3]: o aviso no celular de quem não tem acesso ao app ficava "enviada:
 * true", num sino que ninguém abre.
 * A14 [3]: o lembrete do agendamento cancelado aparecia "Esperando" até
 * 18/11, como se fosse sair.
 * A15 [1, 3]: o silêncio padrão (21:00–08:00) e a unidade aberta das 07:00
 * às 22:00: a janela de ligar não falava do horário da unidade.
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

// ─── O banco falso ──────────────────────────────────────────────────────────

type Linha = Record<string, unknown>
const banco: Record<string, Linha[]> = {}

/** Lê "a.b", "contexto->evento->>entidadeId" ou "branches.tenant_id" numa linha. */
function valorEm(l: Linha, caminho: string): unknown {
  return caminho.split(/->>|->|\./).reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Linha)[k] : undefined), l)
}

function construtor(tabela: string) {
  const filtros: ((l: Linha) => boolean)[] = []
  let patch: Linha | null = null
  let uma = false
  let ordem: { col: string; asc: boolean } | null = null
  const b: Record<string, unknown> = {}
  const cadeia = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => { fn(...a); return b }
  b.select = cadeia(() => {})
  b.eq = cadeia((c, v) => filtros.push(l => valorEm(l, c as string) === v))
  b.neq = cadeia((c, v) => filtros.push(l => valorEm(l, c as string) !== v))
  b.in = cadeia((c, vs) => filtros.push(l => (vs as unknown[]).includes(valorEm(l, c as string))))
  b.order = cadeia((c, o) => { ordem = { col: c as string, asc: (o as { ascending?: boolean } | undefined)?.ascending !== false } })
  b.limit = cadeia(() => {})
  b.maybeSingle = cadeia(() => { uma = true })
  b.update = cadeia(p => { patch = p as Linha })
  b.then = (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
    const linhas = (banco[tabela] ??= [])
    let casam = linhas.filter(l => filtros.every(f => f(l)))
    if (ordem) {
      const { col, asc } = ordem
      casam = [...casam].sort((x, y) => (Number(x[col]) - Number(y[col])) * (asc ? 1 : -1))
    }
    let r: unknown
    if (patch) {
      for (const l of casam) Object.assign(l, structuredClone(patch))
      r = { data: casam, error: null }
    } else {
      r = { data: uma ? (casam[0] ?? null) : casam, error: null }
    }
    return Promise.resolve(r).then(ok, falhou)
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo',
}))

// ─── D1: a remarcação reprograma a espera ───────────────────────────────────

const lembrete = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'lembrete-antes-do-agendamento')!
const retorno = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'retorno-depois-do-atendimento')!

/** 23/11 às 09:00 em Brasília; o lembrete espera até 22/11 às 09:00. */
const ANTIGO = '2026-11-23T12:00:00.000Z'
const VESPERA_DO_ANTIGO = '2026-11-22T12:00:00.000Z'

function montar(novo: string) {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.appointments = [{ id: 'ag1', scheduled_at: novo, status: 'CONFIRMED', branches: { tenant_id: 't1' } }]
  banco.automations = [
    { id: 'auto-lem', tenant_id: 't1', grafo: lembrete.grafo() },
    { id: 'auto-ret', tenant_id: 't1', grafo: retorno.grafo() },
  ]
  const contexto = () => ({
    evento: {
      id: 'ev1', nome: 'agendamento.criado', entidade: 'agendamento', entidadeId: 'ag1',
      dados: { agendamentoId: 'ag1', clienteId: 'cl1', agendadoPara: ANTIGO },
      ator: 'Camila', atorTipo: 'cliente', origem: 'app', quando: '2026-11-16T13:00:00.000Z',
    },
    passos: { um_dia_antes: { esperando: 'até', campo: 'evento.dados.agendadoPara', ate: VESPERA_DO_ANTIGO } },
  })
  banco.automation_runs = [
    // O lembrete: a espera "Um dia antes" já guardou o passo seguinte ("Se").
    { id: 'run-lem', tenant_id: 't1', automation_id: 'auto-lem', status: 'esperando', simulacao: false,
      no_atual: 'n_lem_se', rodar_apos: VESPERA_DO_ANTIGO, contexto: contexto() },
    // Uma espera de DURAÇÃO do mesmo agendamento: a remarcação não a mexe.
    { id: 'run-ret', tenant_id: 't1', automation_id: 'auto-ret', status: 'esperando', simulacao: false,
      no_atual: 'n_ret_msg', rodar_apos: '2026-12-16T13:00:00.000Z', contexto: contexto() },
  ]
  banco.automation_run_steps = [
    { id: 's1', run_id: 'run-lem', ordem: 1, no_id: 'n_lem_criado', tipo: 'gatilho.evento', status: 'ok', resumo: {} },
    { id: 's2', run_id: 'run-lem', ordem: 2, no_id: 'n_lem_espera', tipo: 'espera.ate', status: 'esperando',
      resumo: { esperando: 'até', campo: 'evento.dados.agendadoPara', ate: VESPERA_DO_ANTIGO } },
    { id: 's3', run_id: 'run-ret', ordem: 1, no_id: 'n_ret_espera', tipo: 'espera.duracao', status: 'esperando',
      resumo: { esperando: '30 dias', ate: '2026-12-16T13:00:00.000Z' } },
  ]
}

const run = (id: string) => banco.automation_runs!.find(r => r.id === id)!
const dadosDo = (id: string) => ((run(id).contexto as Linha).evento as Linha).dados as Linha

describe('D1: a remarcação reprograma o lembrete que espera aquele agendamento', () => {
  beforeEach(() => vi.useRealTimers())

  it('remarcado para mais tarde: o lembrete sai um dia antes do horário NOVO', async () => {
    montar('2026-11-24T13:00:00.000Z') // 24/11 às 10:00
    const { reprogramarEsperasDoAgendamento } = await import('@/lib/automacoes/remarcacao')
    await reprogramarEsperasDoAgendamento('t1', 'ag1', new Date('2026-11-16T14:00:00.000Z'))
    expect(run('run-lem').rodar_apos, 'um dia antes de 24/11 às 10:00').toBe('2026-11-23T13:00:00.000Z')
    expect(dadosDo('run-lem').agendadoPara, 'o texto e o silêncio leem o horário de agora').toBe('2026-11-24T13:00:00.000Z')
    const passo = banco.automation_run_steps!.find(s => s.id === 's2')!
    expect((passo.resumo as Linha).ate, 'o passo a passo diz a espera nova').toBe('2026-11-23T13:00:00.000Z')
  })

  it('remarcado para mais cedo: a espera vem junto', async () => {
    montar('2026-11-20T12:00:00.000Z') // 20/11 às 09:00
    const { reprogramarEsperasDoAgendamento } = await import('@/lib/automacoes/remarcacao')
    await reprogramarEsperasDoAgendamento('t1', 'ag1', new Date('2026-11-16T14:00:00.000Z'))
    expect(run('run-lem').rodar_apos).toBe('2026-11-19T12:00:00.000Z')
  })

  it('remarcado para daqui a menos de um dia: o lembrete sai já (C57b), não depois do atendimento', async () => {
    montar('2026-11-17T12:00:00.000Z') // amanhã às 09:00
    const { reprogramarEsperasDoAgendamento } = await import('@/lib/automacoes/remarcacao')
    const agora = new Date('2026-11-16T14:00:00.000Z')
    await reprogramarEsperasDoAgendamento('t1', 'ag1', agora)
    expect(run('run-lem').rodar_apos).toBe(agora.toISOString())
  })

  it('a espera de duração (o retorno 30 dias depois) não muda', async () => {
    montar('2026-11-24T13:00:00.000Z')
    const { reprogramarEsperasDoAgendamento } = await import('@/lib/automacoes/remarcacao')
    await reprogramarEsperasDoAgendamento('t1', 'ag1', new Date('2026-11-16T14:00:00.000Z'))
    expect(run('run-ret').rodar_apos).toBe('2026-12-16T13:00:00.000Z')
  })

  it('o agendamento de outra rede não mexe em nada', async () => {
    montar('2026-11-24T13:00:00.000Z')
    const { reprogramarEsperasDoAgendamento } = await import('@/lib/automacoes/remarcacao')
    await reprogramarEsperasDoAgendamento('t2', 'ag1', new Date('2026-11-16T14:00:00.000Z'))
    expect(run('run-lem').rodar_apos).toBe(VESPERA_DO_ANTIGO)
  })

  it('toda remarcação passa por ela (o evento de remarcado chama)', () => {
    const emissor = fonte('lib/events/agendamento.ts')
    expect(emissor).toMatch(/reprogramarEsperasDoAgendamento\(/)
  })
})

// ─── A13: o aviso no celular de quem não tem acesso ao app ──────────────────

vi.mock('@/lib/notifications/notify', () => ({ notifyClient: vi.fn(async () => {}) }))
vi.mock('@/lib/contatos/conversa-de-whatsapp', () => ({ conversaDeWhatsappDaCliente: async () => null }))
vi.mock('@/lib/inbox/enviar', () => ({ enviarNaConversa: vi.fn() }))
vi.mock('@/lib/events/conversa', () => ({ emitirEventoDeConversa: vi.fn() }))

describe('A13: o aviso no celular diz quando fica só no sino', () => {
  const ator = { tenantId: 't1', automacaoId: 'a1', nome: 'Lembrete', profundidade: 0 }

  it('a cliente sem acesso ao app: "Guardado no sino", não "enviada"', async () => {
    for (const k of Object.keys(banco)) delete banco[k]
    banco.tenants = [{ id: 't1', name: 'Ateliê Dália' }]
    banco.clients = [{ id: 'cl-rita', tenant_id: 't1', auth_id: null }]
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-rita' } }, { canal: 'push', texto: 'Oi, Rita!' })
    expect(r.resumo.enviada).toBe(false)
    expect(String(r.resumo.motivo)).toMatch(/sino/)
    expect(String(r.resumo.motivo)).toMatch(/não tem acesso ao app/)
  })

  it('a cliente com acesso: enviada', async () => {
    for (const k of Object.keys(banco)) delete banco[k]
    banco.tenants = [{ id: 't1', name: 'Ateliê Dália' }]
    banco.clients = [{ id: 'cl-camila', tenant_id: 't1', auth_id: 'auth-camila' }]
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-camila' } }, { canal: 'push', texto: 'Oi, Camila!' })
    expect(r.resumo.enviada).toBe(true)
  })
})

// ─── A14: a execução que espera diz quando segue, e se o agendamento caiu ───

describe('A14: a frase da execução que espera', () => {
  it('o agendamento cancelado: vai reconferir, e diz por quê', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({ retomaEm: '2026-11-18T12:00:00.000Z', situacaoDoAgendamento: 'CANCELLED' }, 'America/Sao_Paulo'))
      .toBe('Vai reconferir em 18/11 às 09:00: o agendamento foi cancelado.')
  })
  it('o agendamento de pé: segue na data', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({ retomaEm: '2026-11-22T12:00:00.000Z', situacaoDoAgendamento: 'CONFIRMED' }, 'America/Sao_Paulo'))
      .toBe('Segue em 22/11 às 09:00.')
  })
  it('sem data de retomada, nada a dizer', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({ retomaEm: null, situacaoDoAgendamento: null }, 'America/Sao_Paulo')).toBeNull()
  })
  it('o passo da espera diz a data em português (era "esperando: até · campo: … · ate: 2026-…")', async () => {
    const { esperaDoPasso } = await import('@/lib/automacoes/frase-da-espera')
    expect(esperaDoPasso({ esperando: 'até', campo: 'evento.dados.agendadoPara', ate: '2026-11-22T12:00:00.000Z' }, 'America/Sao_Paulo'))
      .toBe('Esperando até 22/11 às 09:00')
    expect(esperaDoPasso({ resultado: 'sim' }, 'America/Sao_Paulo')).toBeNull()
  })
  it('a lista de execuções e o passo a passo usam as frases', () => {
    const painel = fonte('components/admin/automacoes/painel-de-execucoes.tsx')
    expect(painel).toMatch(/fraseDaEspera\(/)
    expect(painel).toMatch(/esperaDoPasso\(/)
    expect(fonte('actions/automacoes.ts')).toMatch(/situacaoDoAgendamento/)
  })
})

// ─── A15: o silêncio e o horário da unidade ─────────────────────────────────

describe('A15: a janela de ligar diz a unidade que atende no silêncio', () => {
  const SILENCIO = { silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: 3 }
  const DAS_7_AS_22 = { dias: { 1: [{ de: '07:00', ate: '22:00' }], 2: [{ de: '07:00', ate: '22:00' }] } }
  const DAS_8_AS_20 = { dias: { 1: [{ de: '08:00', ate: '20:00' }] } }

  it('a unidade aberta das 07:00 às 22:00 cai no silêncio', async () => {
    const { silencioNoHorarioDasUnidades } = await import('@/lib/automacoes/antes-de-ligar')
    expect(silencioNoHorarioDasUnidades(SILENCIO, [{ nome: 'Ateliê Dália', horario: DAS_7_AS_22 }]))
      .toBe('Ateliê Dália atende das 07:00 às 22:00: parte desse horário está no silêncio.')
  })
  it('a unidade das 08:00 às 20:00 (ou sem horário cadastrado, o padrão) não', async () => {
    const { silencioNoHorarioDasUnidades } = await import('@/lib/automacoes/antes-de-ligar')
    expect(silencioNoHorarioDasUnidades(SILENCIO, [{ nome: 'A', horario: DAS_8_AS_20 }, { nome: 'B', horario: null }])).toBeNull()
  })
  it('sem silêncio, nada a dizer', async () => {
    const { silencioNoHorarioDasUnidades } = await import('@/lib/automacoes/antes-de-ligar')
    expect(silencioNoHorarioDasUnidades({ silencioDe: null, silencioAte: null, tetoPorClienteDia: 3 }, [{ nome: 'A', horario: DAS_7_AS_22 }])).toBeNull()
  })
  it('duas unidades no silêncio, uma frase', async () => {
    const { silencioNoHorarioDasUnidades } = await import('@/lib/automacoes/antes-de-ligar')
    expect(silencioNoHorarioDasUnidades(SILENCIO, [
      { nome: 'Tulipa Nazaré', horario: DAS_7_AS_22 },
      { nome: 'Tulipa Umarizal', horario: { dias: { 3: [{ de: '06:00', ate: '20:00' }] } } },
    ])).toBe('Tulipa Nazaré (07:00 às 22:00) e Tulipa Umarizal (06:00 às 20:00) atendem em parte do silêncio.')
  })
  it('a janela "Ligar a automação?" mostra a frase', () => {
    const editor = fonte('components/admin/automacoes/editor.tsx')
    expect(editor).toMatch(/silencioNoHorarioDasUnidades\(/)
  })
})
