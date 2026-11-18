import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A35 da 22ª, a resposta do Heitor (2026-11-18: "Também ao arrastar um"):
 *
 * - mover UM cartão pela tela (o arraste, o "Mover para a etapa" do menu, o
 *   "Mover para outro funil", o seletor de etapa do painel do inbox, o
 *   Ganhou/Perdeu/Reabrir do inbox e a etapa do modal) pergunta "Mover dispara
 *   a automação “X”. Disparar?" quando há automação ligada ouvindo aquela
 *   mudança; "Não" move sem disparar. Sem automação, move direto.
 * - a pergunta cita só as automações cujo gatilho CASA com aquela mudança (o
 *   funil e a etapa de destino, os filtros do gatilho) — a mesma régua do
 *   despacho (`gatilhoCasa`), não toda automação inscrita no evento.
 */

const raiz = path.resolve(__dirname, '..')
const ler = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

// ─── O banco falso ──────────────────────────────────────────────────────────

type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }
const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: null, error: null })

function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in', 'or', 'order', 'limit', 'range', 'overlaps', 'contains', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) =>
    Promise.resolve(responder(p)).then(ok, falhou)
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/auth', () => ({
  temRecurso: (ctx: { plano?: { funcionalidades: string[] } | null }, chave: string) =>
    !ctx.plano || ctx.plano.funcionalidades.includes(chave),
  ownerFilter: () => null,
}))

const gatilho = (filtro?: unknown) => ({
  nos: [{ id: 'g', tipo: 'gatilho.evento', config: { evento: 'lead.etapa_mudou', ...(filtro ? { filtro } : {}) } }],
  ligacoes: [],
})
const SO_PARA_PROPOSTA = { juncao: 'e', regras: [{ campo: 'evento.dados.etapaNome', operador: 'igual', valor: 'Proposta' }] }
const SO_NO_FUNIL_POS = { juncao: 'e', regras: [{ campo: 'evento.dados.funilNome', operador: 'igual', valor: 'Pós-venda' }] }
const SO_DA_INDICACAO = { juncao: 'e', regras: [{ campo: 'lead.origem', operador: 'igual', valor: 'INDICACAO' }] }

const LEAD = {
  id: 'l1', branch_id: 'b1', name: 'Ana', phone: '5541999990000', email: null, client_id: null,
  source: 'INSTAGRAM', owner_id: null, crm_stage_id: 'e-contato', tags: [], value: null,
  crm_stages: { name: 'Em contato' },
}

function bancoCom(automacoes: { id: string; nome: string; gatilhos: string[]; grafo: unknown }[]) {
  return (p: Pedido): Resultado => {
    if (p.tabela === 'crm_stages') {
      return { data: { id: 'e-proposta', name: 'Proposta', outcome: 'OPEN', crm_funnels: { name: 'Vendas' } }, error: null }
    }
    if (p.tabela === 'automations') return { data: automacoes, error: null }
    if (p.tabela === 'leads') {
      const unico = p.ops.some(o => o.op === 'maybeSingle')
      return { data: unico ? LEAD : [LEAD], error: null }
    }
    return { data: null, error: null }
  }
}

const ctx = { tenantId: 't1', internalUserId: 'u1', userName: 'Bia', plano: null, suporte: null } as never

describe('o gatilho casa: a régua única do despacho e da pergunta', () => {
  beforeEach(() => { pedidos.length = 0; responder = () => ({ data: null, error: null }) })

  it('sem filtro casa; com filtro, só o fato que passa', async () => {
    const { gatilhoCasa } = await import('@/lib/automacoes/gatilho-casa')
    const evento = {
      id: 'previa', nome: 'lead.etapa_mudou', entidade: 'lead', entidadeId: 'l1',
      dados: { etapaNome: 'Proposta', funilNome: 'Vendas' }, atorNome: 'Bia', atorTipo: 'usuario', origem: 'app',
      ocorridoEm: '2026-11-18T12:00:00.000Z', branchId: 'b1',
    }
    expect(await gatilhoCasa(gatilho() as never, evento, 't1')).toBe(true)
    expect(await gatilhoCasa(gatilho(SO_PARA_PROPOSTA) as never, evento, 't1')).toBe(true)
    expect(await gatilhoCasa(gatilho(SO_NO_FUNIL_POS) as never, evento, 't1')).toBe(false)
    expect(await gatilhoCasa({ nos: [], ligacoes: [] } as never, evento, 't1')).toBe(false)
  })

  it('o despacho usa a mesma régua', () => {
    const executar = ler('lib/automacoes/executar.ts')
    expect(executar).toMatch(/import \{ gatilhoCasa \} from '\.\/gatilho-casa'/)
    expect(executar).toMatch(/await gatilhoCasa\(/)
  })
})

describe('o fato previsto do movimento', () => {
  it('é o retrato do card já na etapa de destino, com a de origem', async () => {
    const { eventoPrevistoDoMovimento } = await import('@/lib/crm/automacoes-do-movimento')
    const e = eventoPrevistoDoMovimento('lead.etapa_mudou' as never, LEAD, { id: 'e-proposta', nome: 'Proposta', desfecho: 'OPEN', funilNome: 'Vendas' }, 'Bia')
    expect(e).toMatchObject({
      nome: 'lead.etapa_mudou', entidade: 'lead', entidadeId: 'l1', branchId: 'b1', atorNome: 'Bia', origem: 'app',
      dados: { nome: 'Ana', funilNome: 'Vendas', etapaNome: 'Proposta', desfecho: 'OPEN', deEtapaNome: 'Em contato', origemDoLead: 'INSTAGRAM' },
    })
  })
})

describe('as automações que a mudança dispara', () => {
  beforeEach(() => { pedidos.length = 0 })

  it('só as que casam com o destino e os filtros — não toda automação inscrita', async () => {
    responder = bancoCom([
      { id: 'a1', nome: 'Boas-vindas da proposta', gatilhos: ['lead.etapa_mudou'], grafo: gatilho(SO_PARA_PROPOSTA) },
      { id: 'a2', nome: 'Pós-venda', gatilhos: ['lead.etapa_mudou'], grafo: gatilho(SO_NO_FUNIL_POS) },
      { id: 'a3', nome: 'Só indicação', gatilhos: ['lead.etapa_mudou'], grafo: gatilho(SO_DA_INDICACAO) },
      { id: 'a4', nome: 'Avisar o dono', gatilhos: ['lead.etapa_mudou'], grafo: gatilho() },
    ])
    const { automacoesQueOMovimentoDispara } = await import('@/lib/crm/automacoes-do-movimento')
    expect(await automacoesQueOMovimentoDispara(ctx, [LEAD], 'e-proposta')).toEqual(['Boas-vindas da proposta', 'Avisar o dono'])
  })

  it('o card que já está na etapa não dispara nada', async () => {
    responder = bancoCom([{ id: 'a4', nome: 'Avisar o dono', gatilhos: ['lead.etapa_mudou'], grafo: gatilho() }])
    const { automacoesQueOMovimentoDispara } = await import('@/lib/crm/automacoes-do-movimento')
    expect(await automacoesQueOMovimentoDispara(ctx, [{ ...LEAD, crm_stage_id: 'e-proposta' }], 'e-proposta')).toEqual([])
  })

  it('sem as automações no plano, ou na sessão de suporte, nada dispara (e não pergunta)', async () => {
    responder = bancoCom([{ id: 'a4', nome: 'Avisar o dono', gatilhos: ['lead.etapa_mudou'], grafo: gatilho() }])
    const { automacoesQueOMovimentoDispara } = await import('@/lib/crm/automacoes-do-movimento')
    const semPlano = { ...(ctx as object), plano: { funcionalidades: ['oportunidades'] } } as never
    const suporte = { ...(ctx as object), suporte: { sessaoId: 's1' } } as never
    expect(await automacoesQueOMovimentoDispara(semPlano, [LEAD], 'e-proposta')).toEqual([])
    expect(await automacoesQueOMovimentoDispara(suporte, [LEAD], 'e-proposta')).toEqual([])
  })
})

describe('todo caminho de mover UM cartão pela tela pergunta', () => {
  const acoes = ler('actions/leads.ts')
  const inbox = ler('actions/inbox.ts')

  it('as actions: a pergunta do card, e o "Não" chega ao núcleo', () => {
    expect(acoes).toMatch(/export async function automacoesAoMoverOCard\(/)
    expect(acoes).toMatch(/export async function updateLeadStage\([\s\S]*?disparar = true[\s\S]*?semDespachar: !disparar/)
    // O modal muda a etapa pelo updateLead: emite o movimento (não emitia) e respeita o "Não".
    expect(acoes).toMatch(/_disparar/)
    expect(acoes).toMatch(/function updateLead[\s\S]*?EVENTOS\.LEAD_ETAPA_MUDOU[\s\S]*?export async function updateLeadStage/)
    expect(inbox).toMatch(/export async function automacoesAoDefinirSituacao\(/)
    expect(inbox).toMatch(/export async function definirSituacaoOportunidade\([\s\S]*?disparar = true[\s\S]*?semDespachar: !disparar/)
    // O "Mover as N" da etapa também usa a régua nova.
    expect(acoes).toMatch(/automacoesQueOMovimentoDispara/)
  })

  it('as telas: o quadro, o menu, outro funil, o painel do inbox e o modal', () => {
    const quadro = ler('components/branch/crm-board.tsx')
    expect(quadro).toMatch(/usePerguntaDasAutomacoes/)
    expect(quadro).toMatch(/function moverPara[\s\S]*?perguntar\(/)
    expect(quadro).toMatch(/function moverParaFunil[\s\S]*?perguntar\(/)
    const painel = ler('components/admin/inbox-lead-panel.tsx')
    expect(painel).toMatch(/usePerguntaDasAutomacoes/)
    expect(painel).toMatch(/automacoesAoDefinirSituacao/)
    expect(painel).toMatch(/function mudarEtapa[\s\S]*?perguntar\(/)
    const modal = ler('components/branch/crm-lead-modal.tsx')
    expect(modal).toMatch(/usePerguntaDasAutomacoes/)
    expect(modal).toMatch(/name="_disparar"/)
    const pergunta = ler('components/branch/pergunta-das-automacoes.tsx')
    expect(pergunta).toMatch(/perguntaDasAutomacoes\(/)
    expect(pergunta).toMatch(/>Sim</)
    expect(pergunta).toMatch(/>Não</)
  })
})
