import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'

/**
 * O que a lista de execuções e o passo a passo dizem (princípios 3 e 7).
 *
 * - D7 (RX-05): o "Retorno depois do atendimento" espera 30 dias a partir da
 *   CONCLUSÃO; a lista dizia "Vai reconferir em 08:00: o atendimento já foi
 *   concluído." — o motivo de cair servia à automação cujo gatilho É a
 *   conclusão. Ali ela segue ("Segue em … às …").
 * - A16 (RX-04): a versão atual dizia "no ar" com a automação em rascunho.
 * - A17 (RX-05/RX-06): o detalhe mostrava "acao.mensagem: fetch failed",
 *   "canal: push · enviada: true" e "gatilho: agendamento.concluido".
 * - A28: a execução dizia "Concluída" quando a condição deu "Não".
 * - D6 (AX-06) e D15 (princípio 4): a mensagem que não saiu — sem conversa
 *   aberta, ou com uma variável sem o dado — dizia "Concluída".
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

// ─── D7: a frase da espera quando o gatilho é a própria situação ────────────

describe('D7: a espera da automação cujo gatilho é a situação do agendamento', () => {
  it('o "Retorno depois do atendimento" (gatilho: atendimento concluído) segue, não "vai reconferir"', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({
      retomaEm: '2026-12-26T11:00:00.000Z', situacaoDoAgendamento: 'COMPLETED', gatilho: 'agendamento.concluido',
    }, 'America/Sao_Paulo')).toBe('Segue em 26/12 às 08:00.')
  })
  it('a automação do cancelamento (gatilho: agendamento cancelado) também segue', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({
      retomaEm: '2026-11-27T11:00:00.000Z', situacaoDoAgendamento: 'CANCELLED', gatilho: 'agendamento.cancelado',
    }, 'America/Sao_Paulo')).toBe('Segue em 27/11 às 08:00.')
  })
  it('o lembrete (gatilho: agendamento criado) do atendimento já concluído continua dizendo que vai reconferir', async () => {
    const { fraseDaEspera } = await import('@/lib/automacoes/frase-da-espera')
    expect(fraseDaEspera({
      retomaEm: '2026-11-27T11:00:00.000Z', situacaoDoAgendamento: 'COMPLETED', gatilho: 'agendamento.criado',
    }, 'America/Sao_Paulo')).toBe('Vai reconferir em 27/11 às 08:00: o atendimento já foi concluído.')
  })
  it('a lista leva o gatilho de cada execução', () => {
    expect(fonte('actions/automacoes.ts')).toMatch(/gatilho:\s/)
  })
})

// ─── A16: o rótulo da versão atual segue a situação da automação ────────────

describe('A16: a versão atual diz a situação da automação', () => {
  it('ligada: "no ar"; rascunho e desligada: não está no ar', async () => {
    const { rotuloDaVersaoAtual } = await import('@/lib/automacoes/em-portugues')
    expect(rotuloDaVersaoAtual('ATIVA')).toBe('no ar')
    expect(rotuloDaVersaoAtual('RASCUNHO')).toBe('atual · rascunho, não está no ar')
    expect(rotuloDaVersaoAtual('PAUSADA')).toBe('atual · desligada, não está no ar')
  })
  it('o painel de versões usa a situação que o editor tem', () => {
    expect(fonte('components/admin/automacoes/painel-de-versoes.tsx')).toMatch(/rotuloDaVersaoAtual\(status\)/)
    expect(fonte('components/admin/automacoes/editor.tsx')).toMatch(/<PainelDeVersoes[\s\S]{0,200}status=\{status\}/)
  })
})

// ─── A17: o passo a passo em português ──────────────────────────────────────

describe('A17: o detalhe da execução em português', () => {
  it('o erro do envio: o que não deu certo, sem "fetch failed"', async () => {
    const { erroDaExecucao, descreverResumo } = await import('@/lib/automacoes/em-portugues')
    expect(erroDaExecucao('acao.mensagem: fetch failed'))
      .toBe('Mandar mensagem: não conseguiu mandar a mensagem (o número não respondeu).')
    expect(descreverResumo('acao.mensagem', { erro: 'fetch failed' }))
      .toBe('Não conseguiu mandar a mensagem (o número não respondeu).')
    // O erro que já é frase segue como está, com o nome do passo.
    expect(erroDaExecucao('acao.notificar_equipe: Nenhuma pessoa escolhida para avisar.'))
      .toBe('Avisar a equipe: Nenhuma pessoa escolhida para avisar.')
  })
  it('o envio: "Aviso no celular: enviado", "WhatsApp: enviada"', async () => {
    const { descreverResumo } = await import('@/lib/automacoes/em-portugues')
    expect(descreverResumo('acao.mensagem', { enviada: true, canal: 'push' })).toBe('Aviso no celular: enviado')
    expect(descreverResumo('acao.mensagem', { enviada: true, canal: 'whatsapp', conversaId: 'c1', texto: 'Oi, Ana!' }))
      .toBe('WhatsApp: enviada · “Oi, Ana!”')
  })
  it('o gatilho pelo nome do catálogo de eventos', async () => {
    const { descreverResumo } = await import('@/lib/automacoes/em-portugues')
    expect(descreverResumo('gatilho.evento', { gatilho: 'agendamento.concluido' })).toBe('Atendimento concluído')
    expect(descreverResumo('gatilho.agenda', { gatilho: 'agenda' })).toBe('No horário marcado')
  })
  it('nada de "chave: valor" com o nome do campo do código', async () => {
    const { descreverResumo } = await import('@/lib/automacoes/em-portugues')
    expect(descreverResumo('acao.notificar_equipe', { avisados: 2, alvo: 'cargo' })).toBe('Avisou 2 pessoas')
    expect(descreverResumo('acao.mover_etapa', { movido: true, de: 'Novo', para: 'Em negociação' })).toBe('Moveu de “Novo” para “Em negociação”')
    expect(descreverResumo('acao.anotar', { anotado: true, leadId: 'l1' })).toBe('Anotou na linha do tempo')
    expect(descreverResumo('buscar.clientes', { encontrados: 3, abertas: 3 })).toBe('Achou 3 clientes')
    expect(descreverResumo('acao.mensagem', { adiado: 'Silêncio até 08:00. A mensagem espera o horário.' }))
      .toBe('Silêncio até 08:00. A mensagem espera o horário.')
  })
  it('o painel usa as frases (sem o descrever de pares)', () => {
    const painel = fonte('components/admin/automacoes/painel-de-execucoes.tsx')
    expect(painel).toMatch(/descreverResumo\(/)
    expect(painel).toMatch(/erroDaExecucao\(/)
    expect(painel).not.toMatch(/`\$\{k\}: \$\{/)
  })
})

// ─── A28, D6 e D15: o fim da execução que não fez o que o fluxo pedia ───────

type Linha = Record<string, unknown>
const banco: Record<string, Linha[]> = {}

function construtor(tabela: string) {
  const filtros: [string, unknown][] = []
  let patch: Linha | null = null
  let inserir: Linha | Linha[] | null = null
  let contarSo = false
  let uma = false
  const b: Record<string, unknown> = {}
  const encadear = (op: string) => (...args: unknown[]) => {
    if (op === 'eq') filtros.push([args[0] as string, args[1]])
    if (op === 'update') patch = args[0] as Linha
    if (op === 'insert') inserir = args[0] as Linha | Linha[]
    if (op === 'select' && (args[1] as { head?: boolean } | undefined)?.head) contarSo = true
    if (op === 'maybeSingle' || op === 'single') uma = true
    return b
  }
  for (const op of ['select', 'eq', 'in', 'contains', 'gte', 'lte', 'neq', 'is', 'order', 'limit', 'maybeSingle', 'single', 'update', 'insert']) {
    b[op] = encadear(op)
  }
  b.then = (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
    const linhas = (banco[tabela] ??= [])
    const casam = linhas.filter(l => filtros.every(([c, v]) => l[c] === v))
    let r: unknown
    if (inserir) {
      const novas = (Array.isArray(inserir) ? inserir : [inserir]).map(l => ({ id: `id-${linhas.length + 1}`, ...l }))
      linhas.push(...novas)
      r = { data: uma ? novas[0] : novas, error: null }
    } else if (patch) {
      for (const l of casam) Object.assign(l, patch)
      r = { data: null, error: null }
    } else if (contarSo) {
      r = { count: casam.length, error: null }
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
vi.mock('@/lib/redes/bloqueio', () => ({ redeEstaBloqueada: async () => false }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', () => ({ redeTemRecurso: async () => true }))
vi.mock('@/lib/automacoes/acoes', () => ({ notificarEquipe: vi.fn(), anotarNaLinhaDoTempo: vi.fn() }))
vi.mock('@/lib/automacoes/acoes-crm', () => ({
  moverDeEtapa: vi.fn(), marcarDesfecho: vi.fn(), adicionarTagAoCliente: vi.fn(), removerTagDoCliente: vi.fn(), definirResponsavel: vi.fn(),
}))
const mandarMensagem = vi.fn<(...a: unknown[]) => Promise<{ resumo: Record<string, unknown> }>>(async () => ({ resumo: { enviada: true, canal: 'whatsapp' } }))
vi.mock('@/lib/automacoes/acoes-mensagem', () => ({ mandarMensagem: (...a: unknown[]) => mandarMensagem(...a) }))

const SEM_LIMITES = { silencioDe: '', silencioAte: '', tetoPorClienteDia: null }

function montar(grafo: unknown, contexto: Linha) {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.automations = [{ id: 'auto1', nome: 'Faltou', grafo, status: 'ATIVA', limites: SEM_LIMITES }]
  banco.automation_run_steps = []
  banco.automation_runs = [{
    id: 'run1', tenant_id: 't1', automation_id: 'auto1', evento_id: 'ev1', no_atual: 'g1',
    tentativas: 0, profundidade: 0, simulacao: false, status: 'esperando', contexto,
  }]
}
const run = () => banco.automation_runs![0]!
const fim = () => (run().contexto as Linha).fimDaExecucao as { rotulo: string; motivo: string } | undefined

const doFato = (nome: string, dados: Linha) => ({
  evento: { id: 'ev1', nome, entidade: 'agendamento', entidadeId: 'ag1', dados, ator: 'Sirlene', atorTipo: 'membro', origem: 'app', quando: '2026-11-26T12:00:00.000Z' },
})

const mensagem = (config: Linha) => ({
  nos: [
    { id: 'g1', tipo: 'gatilho.evento', nome: 'Faltou', pos: { x: 0, y: 0 }, config: { evento: 'agendamento.nao_compareceu' } },
    { id: 'm1', tipo: 'acao.mensagem', nome: 'Avisar a cliente', pos: { x: 260, y: 0 }, config },
  ],
  ligacoes: [{ id: 'l1', de: 'g1', para: 'm1' }],
})

describe('A28: a condição que deu "Não" para o fluxo e a lista diz', () => {
  beforeEach(() => mandarMensagem.mockClear())

  it('o "Retorno" de outro procedimento: a execução termina com "Parou: a condição não valeu"', async () => {
    const retorno = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'retorno-depois-do-atendimento')!
    const grafo = retorno.grafo()
    const se = grafo.nos.find(n => n.tipo === 'condicao.se')!
    ;(se.config as { grupo: { regras: Linha[] } }).grupo.regras[0]!.valor = 'Botox'
    montar(grafo, doFato('agendamento.concluido', { procedimentoNome: 'Peeling', clienteId: 'cl1' }))
    run().no_atual = 'n_ret_concluido'
    const { executarRun } = await import('@/lib/automacoes/executar')
    expect(await executarRun('run1'), 'a execução segue "ok" no banco').toBe('ok')
    expect(fim()).toEqual({ rotulo: 'Parou', motivo: 'A condição “Se o procedimento” não valeu.' })
  })
})

describe('D6 e D15: a mensagem que não saiu não é "Concluída"', () => {
  beforeEach(() => mandarMensagem.mockClear())

  it('sem conversa aberta (e sem a opção do aviso no celular): "Não mandou", com o motivo', async () => {
    mandarMensagem.mockResolvedValueOnce({ resumo: {
      enviada: false, motivo: 'Este cliente não tem conversa aberta no WhatsApp. A automação não abre conversa nova.',
    } })
    montar(mensagem({ canal: 'whatsapp', texto: 'Oi, {{cliente.nome}}!' }), {
      ...doFato('agendamento.nao_compareceu', { clienteId: 'cl1' }), cliente: { id: 'cl1', nome: 'Judite' },
    })
    const { executarRun } = await import('@/lib/automacoes/executar')
    expect(await executarRun('run1')).toBe('ok')
    expect(fim()).toEqual({
      rotulo: 'Não mandou', motivo: 'Este cliente não tem conversa aberta no WhatsApp. A automação não abre conversa nova.',
    })
  })

  it('a opção "Para quem não tem conversa aberta" vai ao envio', async () => {
    montar(mensagem({ canal: 'whatsapp', texto: 'Oi, {{cliente.nome}}!', semConversa: 'aviso_no_celular' }), {
      ...doFato('agendamento.nao_compareceu', { clienteId: 'cl1' }), cliente: { id: 'cl1', nome: 'Judite' },
    })
    const { executarRun } = await import('@/lib/automacoes/executar')
    await executarRun('run1')
    expect(mandarMensagem).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      expect.objectContaining({ canal: 'whatsapp', semConversa: 'aviso_no_celular', texto: 'Oi, Judite!' }))
    expect(fim(), 'a mensagem saiu: nada a dizer além de "Concluída"').toBeUndefined()
  })

  it('a variável sem o dado: a mensagem não sai em branco, e a execução diz o que faltou (princípio 4)', async () => {
    montar(mensagem({ canal: 'whatsapp', texto: '{{cliente.nome}}, sentimos sua falta hoje.' }), {
      ...doFato('agendamento.nao_compareceu', { clienteId: 'cl1' }), cliente: { id: 'cl1', nome: null },
    })
    const { executarRun } = await import('@/lib/automacoes/executar')
    expect(await executarRun('run1')).toBe('ok')
    expect(mandarMensagem).not.toHaveBeenCalled()
    const passo = banco.automation_run_steps!.find(p => p.tipo === 'acao.mensagem')!
    expect(passo.resumo).toMatchObject({ enviada: false })
    expect(String((passo.resumo as Linha).motivo)).toBe('Faltou o dado de {{cliente.nome}}: a mensagem não saiu.')
    expect(fim()?.rotulo).toBe('Não mandou')
  })

  it('a lista de execuções leva o fim, e o painel o mostra no lugar de "Concluída"', () => {
    expect(fonte('actions/automacoes.ts')).toMatch(/fimDaExecucao/)
    const painel = fonte('components/admin/automacoes/painel-de-execucoes.tsx')
    expect(painel).toMatch(/ex\.fim/)
    expect(painel).toMatch(/data-fim-da-execucao/)
  })

  it('a execução filha da busca não herda o fim da mãe', () => {
    expect(fonte('lib/automacoes/executar.ts')).toMatch(/fimDaExecucao: undefined/)
  })
})
