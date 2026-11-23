import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta da agenda carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D3, A27, A28, A29 e A30 da 19ª simulação (2026-11-16), o Copilot.
 *
 * D3 [3]: o Vítor perguntou duas coisas, e a resposta parou no meio de um link
 * (`…Azaleia Meireles](/admin/agenda/b4815201-cf`), sem aviso: o stream acabou
 * sem `response.completed`, e o aviso de corte só saía com
 * `response.incomplete`. O link sem fechamento aparecia cru.
 * A27 [3]: "Quais os agendamentos da Tereza?" procurou uma profissional
 * Tereza; a Tereza é cliente. A ferramenta procura nos dois, ou pergunta.
 * A28 [3]: recarregada a página, o "Continuar a conversa anterior" levava à
 * conversa mais nova, não à do cartão pendente.
 * A29 [3]: o cartão dizia "Agenda · 2026-11-16 a 2026-12-16".
 * A30 [3]: "Por favor, confirme o cartão no sistema para concluir" — o prompt
 * pedia "uma frase curta", sem dar a frase.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

// ─── D3 ─────────────────────────────────────────────────────────────────────

function respostaSSE(eventos: Record<string, unknown>[]): Response {
  const corpo = eventos.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(corpo)); c.close() },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const AVISO = '(A resposta foi cortada. Peça a continuação, se precisar.)'

describe('D3: a resposta que acaba sem "concluída" diz que foi cortada', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('o stream que termina sem response.completed leva o aviso de corte, também à tela', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_text.delta', delta: 'Os agendamentos: [Azaleia Meireles](/admin/agenda/b4815201-cf' },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const pedacos: string[] = []
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [], aoTexto: p => pedacos.push(p) })
    expect(r.texto.endsWith(AVISO)).toBe(true)
    expect(pedacos.join('')).toBe(r.texto)
  })

  it('a resposta concluída não leva aviso', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-teste')
    vi.stubGlobal('fetch', async () => respostaSSE([
      { type: 'response.output_text.delta', delta: 'Tudo certo.' },
      { type: 'response.completed', response: { output: [], usage: { input_tokens: 10, output_tokens: 3 } } },
    ]))
    const { perguntarAoModelo } = await import('@/lib/copilot/openai')
    const r = await perguntarAoModelo({ instrucoes: '', itens: [], ferramentas: [] })
    expect(r.texto).toBe('Tudo certo.')
  })
})

describe('D3: o link sem fechamento vira texto, sem o pedaço "](/…"', () => {
  it('no fim do parágrafo', async () => {
    const { blocosDoTexto } = await import('@/lib/copilot/texto')
    const b = blocosDoTexto('Achei 1 agendamento em [Azaleia Meireles](/admin/agenda/b4815201-cf')
    expect(b).toEqual([{ tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: 'Achei 1 agendamento em Azaleia Meireles' }] }])
  })
  it('o link fechado continua link', async () => {
    const { blocosDoTexto } = await import('@/lib/copilot/texto')
    const b = blocosDoTexto('Em [Meireles](/admin/agenda/1) e [Aldeota](/admin/agenda/2')
    expect(b[0]).toEqual({ tipo: 'paragrafo', trechos: [
      { tipo: 'texto', texto: 'Em ' },
      { tipo: 'link', texto: 'Meireles', href: '/admin/agenda/1' },
      { tipo: 'texto', texto: ' e Aldeota' },
    ] })
  })
})

// ─── A27 e A29: a ferramenta da agenda ──────────────────────────────────────

const UNIDADES = [{ id: 'b-ald', name: 'Azaleia Aldeota' }, { id: 'b-mei', name: 'Azaleia Meireles' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Fortaleza',
  fusoDaRede: async () => 'America/Fortaleza',
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Sabrina', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: 'b-ald', unidades: ['b-ald', 'b-mei'], role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}

/** O cliente do Supabase falso: cada tabela devolve o seu, e os `.eq` da agenda ficam guardados. */
function adminFalso(dados: { users?: unknown[]; clientes?: unknown[]; appointments?: unknown[] }) {
  const eqs: { tabela: string; coluna: string; valor: unknown }[] = []
  const porTabela: Record<string, unknown[]> = { users: dados.users ?? [], appointments: dados.appointments ?? [] }
  const admin = {
    from(tabela: string) {
      const encadeia: unknown = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: porTabela[tabela] ?? [], error: null })
          if (prop === 'eq') return (coluna: string, valor: unknown) => { eqs.push({ tabela, coluna, valor }); return encadeia }
          return () => encadeia
        },
      })
      return encadeia
    },
    rpc: async (nome: string) => ({ data: nome === 'buscar_clientes' ? dados.clientes ?? [] : [], error: null }),
  }
  return { c: { ctx: ctx(), admin: admin as never, pagina: '/aldeota/agenda', slugDoPortal: 'aldeota' }, eqs }
}

const CAIO = { id: 'u-caio', name: 'Dr. Caio Lima', branch_id: null }
const TEREZA = { id: 'c-tereza', name: 'Tereza Gomes', phone: null }

describe('A27: "da Tereza" procura também entre as clientes', () => {
  it('não há quem atende com o nome, há a cliente: lista os agendamentos dela, e diz como entendeu', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, eqs } = adminFalso({ users: [CAIO], clientes: [TEREZA] })
    const r = await agendamentos.executar(c, { de: '2026-11-16', ate: '2026-12-16', profissional: 'Tereza' })
    expect((r.dados as { erro?: string }).erro).toBeUndefined()
    expect(eqs).toContainEqual({ tabela: 'appointments', coluna: 'client_id', valor: 'c-tereza' })
    expect(eqs.some(e => e.tabela === 'appointments' && e.coluna === 'professional_id')).toBe(false)
    expect(JSON.stringify(r.dados)).toContain('a cliente Tereza Gomes')
  })

  it('o nome é de quem atende E de uma cliente: pergunta qual', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c } = adminFalso({ users: [CAIO, { id: 'u-tereza', name: 'Tereza Prado', branch_id: null }], clientes: [TEREZA] })
    const r = await agendamentos.executar(c, { profissional: 'Tereza' })
    const erro = (r.dados as { erro?: string }).erro ?? ''
    expect(erro).toContain('Tereza Prado')
    expect(erro).toContain('Tereza Gomes')
    expect(erro).toMatch(/Qual\?/)
  })

  it('o cliente pelo nome (não só o id)', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, eqs } = adminFalso({ users: [CAIO], clientes: [TEREZA] })
    const r = await agendamentos.executar(c, { cliente: 'Tereza' })
    expect((r.dados as { erro?: string }).erro).toBeUndefined()
    expect(eqs).toContainEqual({ tabela: 'appointments', coluna: 'client_id', valor: 'c-tereza' })
  })

  it('a descrição diz que "da Fulana" pode ser cliente', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    expect(agendamentos.descricao).toMatch(/cliente ou quem atende/i)
  })
})

describe('A29: o período do cartão em dd/mm', () => {
  it('periodoLegivel', async () => {
    const { periodoLegivel } = await import('@/lib/copilot/ferramentas/datas')
    expect(periodoLegivel('2026-11-16', '2026-12-16')).toBe('16/11 a 16/12/2026')
    expect(periodoLegivel('2026-12-28', '2027-01-03')).toBe('28/12/2026 a 03/01/2027')
  })
  it('o cartão da agenda', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const linha = { id: 'a1', scheduled_at: '2026-11-20T13:00:00Z', duration_min: 30, status: 'SCHEDULED', branch_id: 'b-ald', client_id: 'c-tereza', procedure_id: 'p1', professional_id: null }
    const { c } = adminFalso({ appointments: [linha] })
    const r = await agendamentos.executar(c, { de: '2026-11-16', ate: '2026-12-16' })
    expect((r.cartao as { titulo?: string } | undefined)?.titulo).toBe('Agenda · 16/11 a 16/12/2026')
  })
})

// ─── A28: o cartão pendente depois de recarregar ────────────────────────────

describe('A28: o "Continuar" leva à conversa do cartão a confirmar', () => {
  it('a lista diz qual conversa tem cartão pendente (no prazo)', async () => {
    const { listarConversas } = await import('@/lib/copilot/conversa')
    const filtros: { tabela: string; metodo: string; args: unknown[] }[] = []
    const admin = {
      from(tabela: string) {
        const encadeia: unknown = new Proxy({}, {
          get(_, prop: string) {
            if (prop === 'then') {
              const data = tabela === 'copilot_conversas'
                ? [{ id: 'c-nova', titulo: 'Outra pergunta', atualizada_em: '2026-11-16T12:10:00Z' }, { id: 'c-cartao', titulo: 'Agendar a Tereza', atualizada_em: '2026-11-16T12:00:00Z' }]
                : [{ conversa_id: 'c-cartao' }]
              return (ok: (v: unknown) => void) => ok({ data, error: null })
            }
            return (...args: unknown[]) => { filtros.push({ tabela, metodo: prop, args }); return encadeia }
          },
        })
        return encadeia
      },
    }
    const lista = await listarConversas(admin as never, ctx())
    expect(lista.map(c => [c.id, c.cartaoPendente])).toEqual([['c-nova', false], ['c-cartao', true]])
    expect(filtros).toContainEqual({ tabela: 'copilot_acoes', metodo: 'eq', args: ['status', 'pendente'] })
    expect(filtros.some(f => f.tabela === 'copilot_acoes' && f.metodo === 'gt' && f.args[0] === 'expira_em')).toBe(true)
  })

  it('a escolha e o rótulo', async () => {
    const { conversaParaContinuar, rotuloDoContinuar } = await import('@/lib/copilot/continuar')
    const nova = { id: 'c-nova', titulo: 'Outra pergunta', atualizadaEm: '', cartaoPendente: false }
    const doCartao = { id: 'c-cartao', titulo: 'Agendar a Tereza', atualizadaEm: '', cartaoPendente: true }
    expect(conversaParaContinuar([nova, doCartao])).toBe(doCartao)
    expect(conversaParaContinuar([nova])).toBe(nova)
    expect(conversaParaContinuar([])).toBeNull()
    expect(rotuloDoContinuar(doCartao)).toBe('Continuar a conversa com um cartão a confirmar: Agendar a Tereza')
    expect(rotuloDoContinuar(nova)).toBe('Continuar a conversa anterior: Outra pergunta')
  })

  it('o painel usa a escolha e o rótulo', () => {
    const f = fonte('components/copilot/copilot.tsx')
    expect(f).toMatch(/conversaParaContinuar\(/)
    expect(f).toMatch(/rotuloDoContinuar\(/)
  })
})

// ─── A30: a frase depois do cartão ──────────────────────────────────────────

describe('A30: o prompt dá a frase depois do cartão', () => {
  it('"Confira e confirme no cartão abaixo."', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), {
      rede: 'Azaleia', unidade: 'Azaleia Aldeota', unidades: ['Azaleia Aldeota', 'Azaleia Meireles'],
      pagina: '/aldeota/agenda', slugDoPortal: 'aldeota', fuso: 'America/Fortaleza',
    })
    expect(texto).toContain('“Confira e confirme no cartão abaixo.”')
    expect(texto).not.toContain('uma frase curta dizendo que o cartão está pronto')
  })
})
