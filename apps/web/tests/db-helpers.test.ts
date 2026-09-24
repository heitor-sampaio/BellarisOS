import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gravar, ler, tentar, mensagemDoErro, ErroDeBanco } from '@/lib/db'

/**
 * Os três jeitos de terminar uma consulta.
 *
 * O caso que carrega o peso é o do erro: antes deste helper ele não existia
 * para o código — `await admin.from('x').update(...)` grava ou não grava, e o
 * sistema segue igual. O que se prova aqui é que agora falhar CUSTA alguma
 * coisa: uma exceção que diz em português o que não foi feito, ou uma linha no
 * log quando seguir em frente foi uma escolha.
 */

const erro = (code = '42703', message = 'column "x" does not exist') =>
  ({ code, message, details: '', hint: '', name: 'PostgrestError' })

/** Imita o builder do supabase-js, que é thenable e não Promise. */
const consulta = <T>(resposta: { data: T; error: unknown }) => ({
  then: (resolver: (r: unknown) => unknown) => Promise.resolve(resposta).then(resolver),
}) as PromiseLike<{ data: T; error: never }>

let logado: unknown[][] = []
beforeEach(() => {
  logado = []
  vi.spyOn(console, 'error').mockImplementation((...args) => { logado.push(args) })
})
afterEach(() => { vi.restoreAllMocks() })

describe('gravar', () => {
  it('devolve o dado quando dá certo', async () => {
    expect(await gravar(consulta({ data: { id: 'a1' }, error: null }), 'criar a parcela'))
      .toEqual({ id: 'a1' })
  })

  it('erro vira exceção que diz o que não foi feito', async () => {
    await expect(gravar(consulta({ data: null, error: erro() }), 'criar a parcela'))
      .rejects.toThrow('Não consegui criar a parcela.')
  })

  it('a exceção carrega a causa, para o log e para quem quiser o código', async () => {
    const e: ErroDeBanco = await gravar(consulta({ data: null, error: erro('23505', 'duplicate key') }), 'criar a parcela')
      .then(() => { throw new Error('devia ter falhado') }, x => x as ErroDeBanco)
    expect(e).toBeInstanceOf(ErroDeBanco)
    expect(e.causa.code).toBe('23505')
    expect(e.oQue).toBe('criar a parcela')
  })

  it('registra o código na frente da mensagem', async () => {
    await gravar(consulta({ data: null, error: erro() }), 'criar a parcela').catch(() => {})
    expect(String(logado[0]?.[0])).toContain('42703')
  })

  it('data nulo SEM erro passa — ausência não é falha', async () => {
    // `maybeSingle()` de linha que não existe devolve exatamente isto, e
    // tratá-lo como erro faria toda busca sem resultado virar exceção.
    expect(await gravar(consulta({ data: null, error: null }), 'buscar o plano')).toBeNull()
  })
})

describe('ler', () => {
  it('erro na leitura para o fluxo em vez de devolver lista vazia', async () => {
    // O "zero silencioso": sem isto, drift de schema vira "R$ 0,00" na tela.
    await expect(ler(consulta({ data: null, error: erro() }), 'carregar as etapas'))
      .rejects.toThrow('Não consegui carregar as etapas.')
  })

  it('lista vazia é um resultado, não um erro', async () => {
    expect(await ler(consulta({ data: [], error: null }), 'carregar as etapas')).toEqual([])
  })
})

describe('tentar', () => {
  it('falha não sobe, mas deixa rastro e devolve false', async () => {
    const ok = await tentar(consulta({ data: null, error: erro() }), 'guardar o retrato da versão')
    expect(ok).toBe(false)
    expect(logado).toHaveLength(1)
    expect(String(logado[0]?.[0])).toContain('guardar o retrato da versão')
  })

  it('sucesso devolve true e não registra nada', async () => {
    expect(await tentar(consulta({ data: null, error: null }), 'avisar a equipe')).toBe(true)
    expect(logado).toHaveLength(0)
  })
})

describe('mensagemDoErro', () => {
  it('usa a frase do ErroDeBanco', () => {
    expect(mensagemDoErro(new ErroDeBanco('estornar o lançamento', erro() as never)))
      .toBe('Não consegui estornar o lançamento.')
  })

  it('aproveita a mensagem de um Error comum', () => {
    expect(mensagemDoErro(new Error('Forbidden'))).toBe('Forbidden')
  })

  it('mensagem escrita por uma função do banco chega inteira ao usuário', () => {
    // `RAISE EXCEPTION 'Este lançamento já foi estornado.' USING ERRCODE =
    // 'invalid_parameter_value'` é uma frase escrita para ser lida por gente;
    // trocá-la pelo genérico jogaria fora a única explicação que existe.
    const banco = erro('22023', 'Este lançamento já foi estornado.') as never
    expect(mensagemDoErro(new ErroDeBanco('estornar o lançamento', banco)))
      .toBe('Este lançamento já foi estornado.')

    expect(mensagemDoErro(new ErroDeBanco('estornar o lançamento', erro('P0002', 'Lançamento não encontrado.') as never)))
      .toBe('Lançamento não encontrado.')
  })

  it('mensagem técnica do Postgres NÃO vai para a tela', () => {
    // 42703 é coluna que não existe: é defeito nosso, e mostrar o nome da
    // coluna ao usuário não ajuda ninguém e vaza o schema.
    expect(mensagemDoErro(new ErroDeBanco('criar a parcela', erro() as never)))
      .toBe('Não consegui criar a parcela.')
  })

  it('o que não é erro conhecido vira frase genérica, nunca "[object Object]"', () => {
    expect(mensagemDoErro({ algo: 1 })).toBe('Não consegui completar a operação.')
    expect(mensagemDoErro(new Error(''))).toBe('Não consegui completar a operação.')
  })
})
