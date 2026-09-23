import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O emissor de eventos.
 *
 * Duas garantias valem teste, e são as duas que, quebradas, falham em silêncio:
 *
 *  - **nunca lançar** — um erro aqui derrubaria a ação que chamou, e o preço de
 *    perder um evento é muito menor que o de impedir um agendamento;
 *  - **o 23505 não é erro** — é a chave de idempotência barrando uma
 *    repetição, e tratá-lo como falha encheria o log justamente no caminho que
 *    funcionou.
 */

const insert = vi.fn()
/** O que o insert encadeado devolve — trocado por teste. */
let resultadoDoInsert: { data: { id: string } | null; error: { code: string; message: string } | null } =
  { data: { id: 'ev1' }, error: null }
// O insert encadeia `.select('id').maybeSingle()`: o emissor precisa do id do
// fato recém-gravado para entregá-lo ao motor de automações.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert }) }),
}))

// O despacho roda em `after()` e puxa a árvore das automações — fora do
// escopo deste teste, que é sobre o REGISTRO do fato.
const despacharEvento = vi.fn()
vi.mock('@/lib/automacoes/executar', () => ({ despacharEvento }))

const { emitirEvento, atorDoContexto, ATOR_SISTEMA, camposAlterados } =
  await import('@/lib/events/emitir')

beforeEach(() => {
  insert.mockReset()
  despacharEvento.mockReset()
  insert.mockReturnValue({
    select: () => ({ maybeSingle: async () => resultadoDoInsert }),
  })
  resultadoDoInsert = { data: { id: 'ev1' }, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('emitirEvento', () => {
  it('deriva a entidade do prefixo do nome', async () => {
    await emitirEvento('agendamento.confirmado', { tenantId: 't', entidadeId: 'a1' })
    expect(insert.mock.calls[0]![0]).toMatchObject({
      nome: 'agendamento.confirmado',
      entidade: 'agendamento',
      entidade_id: 'a1',
    })
  })

  it('sem ator declarado, o fato é do sistema', async () => {
    await emitirEvento('agendamento.criado', { tenantId: 't' })
    expect(insert.mock.calls[0]![0]).toMatchObject({ ator_tipo: 'sistema', origem: 'app' })
  })

  it('carrega ator e origem quando vêm', async () => {
    await emitirEvento('agendamento.criado', {
      tenantId: 't',
      ator: { id: 'u1', nome: 'Ana', tipo: 'usuario' },
      origem: 'webhook',
    })
    expect(insert.mock.calls[0]![0]).toMatchObject({
      ator_id: 'u1', ator_nome: 'Ana', ator_tipo: 'usuario', origem: 'webhook',
    })
  })

  it('erro de banco não derruba quem chamou', async () => {
    resultadoDoInsert = { data: null, error: { code: '42P01', message: 'tabela sumiu' } }
    await expect(
      emitirEvento('agendamento.criado', { tenantId: 't' }),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('exceção inesperada também não derruba', async () => {
    insert.mockImplementation(() => { throw new Error('rede caiu') })
    await expect(
      emitirEvento('agendamento.criado', { tenantId: 't' }),
    ).resolves.toBeUndefined()
  })

  it('repetição barrada pela chave não vira erro no log', async () => {
    resultadoDoInsert = { data: null, error: { code: '23505', message: 'duplicate key' } }
    await emitirEvento('agendamento.confirmado', {
      tenantId: 't', chave: 'agendamento.confirmado:a1',
    })
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('atorDoContexto', () => {
  it('monta o ator de quem está logado', () => {
    expect(atorDoContexto({ internalUserId: 'u1', userName: 'Ana' }))
      .toEqual({ id: 'u1', nome: 'Ana', tipo: 'usuario' })
  })

  it('nome vazio vira nulo, não string vazia', () => {
    expect(atorDoContexto({ internalUserId: 'u1', userName: '' }).nome).toBeNull()
  })

  it('sistema é o ator de quem não é gente', () => {
    expect(ATOR_SISTEMA.tipo).toBe('sistema')
  })
})

describe('camposAlterados', () => {
  it('lista só o que mudou', () => {
    expect(camposAlterados(
      { nome: 'Ana', telefone: '1111' },
      { nome: 'Ana', telefone: '2222' },
    )).toEqual(['telefone'])
  })

  it('ignora updated_at', () => {
    // Ele muda em toda alteração e apareceria sempre, tornando `alterou`
    // inútil para decidir se a automação dispara.
    expect(camposAlterados(
      { nome: 'Ana', updated_at: 'x' },
      { nome: 'Ana', updated_at: 'y' },
    )).toEqual([])
  })

  it('null e undefined são a mesma ausência', () => {
    expect(camposAlterados({ email: null }, { email: undefined })).toEqual([])
  })

  it('compara valor, não referência', () => {
    expect(camposAlterados({ tags: ['a'] }, { tags: ['a'] })).toEqual([])
    expect(camposAlterados({ tags: ['a'] }, { tags: ['b'] })).toEqual(['tags'])
  })
})
