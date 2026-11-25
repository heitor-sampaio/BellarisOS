import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// O primeiro import() das ferramentas carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O Copilot recusa o que a tela recusa — nem mais, nem menos — e em português
 * (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito."; copilot.md: "recusa na mensagem padrão do zod, em inglês" é defeito).
 *
 * 1. O remarcar do agendamento Em atendimento: o `remarcarCore` recusa, mas só
 *    no Confirmar — o cartão aparecia para algo que ia falhar. O preparo recusa
 *    com a MESMA frase do núcleo.
 * 2. Os tamanhos de texto das ferramentas de escrita: o texto que a tela grava
 *    sem limite (a observação do agendamento, o motivo do cancelamento, a
 *    descrição do lançamento, o lote e a observação da entrada, o motivo do
 *    ajuste, a observação e o nome da oportunidade) o Copilot também grava; o
 *    que tem limite na tela ou no registro mantém o número, com a mensagem em
 *    português ("No máximo N caracteres.").
 */

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
const remarcarCore = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/appointments/alteracoes', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/alteracoes')>()),
  agendamentoAoAlcance: async () => ({
    id: 'a1', branch_id: 'b1', status: 'IN_PROGRESS', scheduled_at: '2026-11-25T13:00:00.000Z',
    professional_id: 'u2', duration_min: 60, room_id: null, fuso: 'America/Sao_Paulo',
  }),
  remarcarCore,
}))

/** A recusa do TAMANHO na mensagem padrão do zod ("Too big: expected string to have <=80 characters"). */
const INGLES = /too (big|small)|characters?\b|at (most|least)/i

function admin(tabelas: Record<string, unknown[]>) {
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {}
    let unico = false
    for (const op of ['select', 'eq', 'ilike', 'in', 'is', 'order', 'limit', 'neq', 'not', 'or', 'gt', 'gte', 'lt', 'lte', 'range', 'contains', 'overlaps']) b[op] = () => b
    b.single = () => { unico = true; return b }
    b.maybeSingle = () => { unico = true; return b }
    b.then = (ok: (r: unknown) => unknown) => {
      const linhas = tabelas[tabela] ?? []
      return Promise.resolve({ data: unico ? linhas[0] ?? null : linhas, error: null }).then(ok)
    }
    return b
  }
  return { from }
}

const contexto = () => ({
  ctx: { tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u1', userName: 'Bia', isNetworkAdmin: true, permissions: {} },
  admin: admin({ appointments: [{ client_id: 'c1', procedure_id: 'p1' }], clients: [{ id: 'c1', name: 'Neusa' }], procedures: [{ id: 'p1', name: 'Toxina' }], users: [{ id: 'u2', name: 'Ana' }] }),
  pagina: '/centro/agenda', slugDoPortal: 'centro',
}) as never

describe('remarcar: o Em atendimento se recusa no preparo, com a frase do núcleo', () => {
  const FRASE_DO_NUCLEO = 'Este agendamento está em atendimento agora: não se remarca. Para desistir, use "Cancelar" no atendimento.'
  it('a frase é a do remarcarCore', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../lib/appointments/alteracoes.ts'), 'utf8')
    expect(fonte).toContain(`'${FRASE_DO_NUCLEO}'`)
  })
  it('o cartão não aparece', async () => {
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await remarcar.preparar(contexto(), { agendamento: 'a1', data: '2026-12-01', hora: '10:00' }) as { erro?: string; resumo?: unknown }
    expect(r.erro).toBe(FRASE_DO_NUCLEO)
    expect(r.resumo).toBeUndefined()
    expect(remarcarCore).not.toHaveBeenCalled()
  })
})

type Esquema = { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } } }
const mensagens = (r: ReturnType<Esquema['safeParse']>, campo?: string) =>
  r.success ? [] : r.error!.issues.filter(i => !campo || i.path[0] === campo).map(i => i.message)
const recusa = (r: ReturnType<Esquema['safeParse']>, campo: string) => mensagens(r, campo).join(' | ') || null

describe('os tamanhos de texto: em português, em toda ferramenta de escrita', () => {
  it('nenhum campo de texto recusa o longo nem o vazio com a mensagem do zod', async () => {
    const { FERRAMENTAS } = await import('@/lib/copilot/ferramentas/index')
    const longo = 'x'.repeat(5_000)
    const achadas: string[] = []
    for (const f of FERRAMENTAS.filter(f => f.tipo === 'escrita')) {
      const shape = (f.parametros as unknown as { shape: Record<string, unknown> }).shape
      for (const campo of Object.keys(shape)) {
        for (const valor of [longo, '', [longo], [''], { nome: longo, telefone: longo }, { nome: '', telefone: '' }]) {
          const r = (f.parametros as unknown as Esquema).safeParse({ [campo]: valor })
          // Só a recusa do TAMANHO interessa aqui: o tipo errado (o objeto num texto) é do modelo.
          for (const m of mensagens(r, campo)) if (INGLES.test(m) && !/array to have|received/.test(m)) achadas.push(`${f.nome}.${campo}: ${m}`)
        }
      }
    }
    expect(achadas).toEqual([])
  })
})

describe('o texto que a tela grava sem limite, o Copilot grava', () => {
  const longo = 'x'.repeat(2_000)
  it('agendar: a observação (a janela "+ Agendar" não limita) e o nome da cliente nova', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const base = { procedimento: 'Toxina', profissional: 'Ana', data: '2026-12-01', hora: '10:00' }
    expect(recusa(agendar.parametros.safeParse({ ...base, cliente: 'Neusa', observacao: longo }), 'observacao')).toBeNull()
    const novo = agendar.parametros.safeParse({ ...base, clienteNovo: { nome: 'N'.repeat(300), telefone: '81999990000' } })
    expect(recusa(novo, 'clienteNovo')).toBeNull()
    expect(recusa(agendar.parametros.safeParse({ ...base, clienteNovo: { nome: 'N', telefone: '81999990000' } }), 'clienteNovo')).toBe('Informe o nome de quem será atendido.')
  })
  it('cancelar: o motivo (a tela pede só que exista)', async () => {
    const { cancelar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const id = '00000000-0000-4000-8000-000000000001'
    expect(recusa(cancelar.parametros.safeParse({ agendamento: id, motivo: longo }), 'motivo')).toBeNull()
    expect(recusa(cancelar.parametros.safeParse({ agendamento: id, motivo: 'X' }), 'motivo')).toBeNull()
    expect(recusa(cancelar.parametros.safeParse({ agendamento: id, motivo: '' }), 'motivo')).toBe('Informe o motivo do cancelamento.')
  })
  it('cadastrar e corrigir a cliente: o nome (a ficha pede 2 letras, sem teto)', async () => {
    const { cadastrarCliente, atualizarContato } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    expect(recusa(cadastrarCliente.parametros.safeParse({ nome: 'N'.repeat(300), telefone: '81999990000' }), 'nome')).toBeNull()
    expect(recusa(cadastrarCliente.parametros.safeParse({ nome: 'N', telefone: '81999990000' }), 'nome')).toBe('Informe o nome do cliente.')
    expect(recusa(atualizarContato.parametros.safeParse({ cliente: 'Ana', nome: 'N'.repeat(300) }), 'nome')).toBeNull()
  })
  it('a tag: o nome da tag tem 60 na tela (Configurações → Tags)', async () => {
    const { marcarTags } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    expect(recusa(marcarTags.parametros.safeParse({ cliente: 'Ana', adicionar: ['T'.repeat(61)] }), 'adicionar')).toBe('No máximo 60 caracteres.')
  })
  it('lançar: a descrição (o Novo lançamento pede só que exista)', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { tipo: 'despesa', valor: 10, categoria: 'Outro', vencimento: '2026-12-01' }
    expect(recusa(lancar.parametros.safeParse({ ...base, descricao: longo }), 'descricao')).toBeNull()
    expect(recusa(lancar.parametros.safeParse({ ...base, descricao: 'X' }), 'descricao')).toBeNull()
    expect(recusa(lancar.parametros.safeParse({ ...base, descricao: '' }), 'descricao')).toBe('Descrição é obrigatória.')
  })
  it('a entrada: o lote e a observação sem teto; a marca e o fornecedor 120, a nota 60, como a janela', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { produto: 'Luva', quantidade: 1 }
    expect(recusa(entradaDeEstoque.parametros.safeParse({ ...base, lote: 'L'.repeat(300) }), 'lote')).toBeNull()
    expect(recusa(entradaDeEstoque.parametros.safeParse({ ...base, observacao: longo }), 'observacao')).toBeNull()
    expect(recusa(entradaDeEstoque.parametros.safeParse({ ...base, fornecedor: 'F'.repeat(121) }), 'fornecedor')).toBe('No máximo 120 caracteres.')
    expect(recusa(entradaDeEstoque.parametros.safeParse({ ...base, marca: 'M'.repeat(121) }), 'marca')).toBe('No máximo 120 caracteres.')
    expect(recusa(entradaDeEstoque.parametros.safeParse({ ...base, notaFiscal: 'N'.repeat(61) }), 'notaFiscal')).toBe('No máximo 60 caracteres.')
  })
  it('o ajuste: o motivo (a janela pede só que exista)', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { produto: 'Luva', novoSaldo: 1 }
    expect(recusa(ajusteDeEstoque.parametros.safeParse({ ...base, motivo: longo }), 'motivo')).toBeNull()
    expect(recusa(ajusteDeEstoque.parametros.safeParse({ ...base, motivo: 'X' }), 'motivo')).toBeNull()
    expect(recusa(ajusteDeEstoque.parametros.safeParse({ ...base, motivo: '' }), 'motivo')).toBe('Motivo do ajuste é obrigatório.')
  })
  it('a oportunidade: a observação e o nome sem teto; a origem no limite do registro', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { email: 'ana@exemplo.com' }
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: 'Ana', observacao: longo }), 'observacao')).toBeNull()
    // `leads.name` virou text, como na ficha (20261208000001; o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito.").
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: 'A'.repeat(256) }), 'nome')).toBeNull()
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: '' }), 'nome')).toBe('Nome é obrigatório.')
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, nome: 'Ana', origem: 'O'.repeat(61) }), 'origem')).toBe('No máximo 60 caracteres (o limite do registro).')
  })
})
