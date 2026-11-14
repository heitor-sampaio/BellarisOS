import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { ROTULO_DO_CREDIARIO, limiteDoCrediarioEmTexto } from '@/lib/financeiro/parcelas-do-crediario'
import { recusaDoPagamento, montarPagamento, type EstadoDoPagamento } from '@/components/shared/campos-do-pagamento'
import { valoresDoPagamento } from '@/lib/checkout/pagamento'
import { rotuloDaForma } from '@/lib/financeiro/formas'

// A23 da 14ª simulação (F75): a configuração dizia "Crediário da clínica" e o
// Vender, "Entrada + parcelas" — a Wanda e a Débora não ligavam um ao outro; a
// lista das parcelas parava em 6x sem dizer por quê. PDV8 (o Heitor, 13/11:
// "sempre tem que ter forma de pagamento, o crediario é uma forma de
// pagamento"): o Crediário é um bloco ao lado dos meios, e só a ENTRADA pede
// a forma dela.
describe('os nomes do crediário (A23 da 14ª, PDV8)', () => {
  it('um nome só — o do bloco, ao lado de Pix, Dinheiro, Débito e Crédito', () => {
    expect(ROTULO_DO_CREDIARIO).toBe('Crediário')
    expect(rotuloDaForma('CREDIARIO')).toBe('Crediário')
    expect(limiteDoCrediarioEmTexto(6)).toBe('até 6x, o limite da clínica')
  })
})

describe('o crediário sem entrada não tem meio; com entrada, a forma dela (PDV8)', () => {
  const venc = '2026-12-10T15:00:00.000Z'
  it('o servidor aceita sem meio quando não há entrada, e recusa com entrada', () => {
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 3, primeiroVencimento: venc }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', entrada: 0, parcelas: 3, primeiroVencimento: venc }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: null, entrada: 100, parcelas: 3, primeiroVencimento: venc }).success).toBe(false)
    // O texto vazio saiu: o meio é um meio ou é nulo.
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: '', entrada: 0, parcelas: 3, primeiroVencimento: venc }).success).toBe(false)
  })
  it('o a receber não tem meio — o servidor recusa o que vier com um', () => {
    expect(EntradaDoPagamento.safeParse({ forma: 'A_RECEBER', vencimento: null }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ forma: 'A_RECEBER', metodo: 'PIX', vencimento: null }).success).toBe(false)
  })
  it('sem entrada, só as parcelas — sem meio, como o D6 da 6ª', () => {
    const l = lancamentosDoPagamento(300, { forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 3, primeiroVencimento: venc }, 'Pacote')
    expect(l).toHaveLength(3)
    expect(l.every(x => x.payment_method === null && !x.is_paid)).toBe(true)
  })
  it('a tela também: sem entrada, sem recusa; com entrada, pede a forma da entrada; o à vista, a forma', () => {
    const base: EstadoDoPagamento = { forma: 'PARCELADO', metodo: '', vezes: 1, entrada: '', parcelas: 3, data: '2026-12-10', vencimento: '', bandeira: '', maquininha: '' }
    expect(recusaDoPagamento(base, 300)).toBeNull()
    expect(recusaDoPagamento({ ...base, entrada: '100' }, 300)).toBe('Escolha a forma da entrada.')
    expect(recusaDoPagamento({ ...base, forma: 'AVISTA' }, 300)).toBe('Escolha a forma de pagamento.')
    expect(recusaDoPagamento({ ...base, forma: 'A_RECEBER' }, 300)).toBeNull()
  })
  it('montar: o crediário sem entrada vai sem meio, mesmo que um tenha ficado escolhido; o a receber, sem meio', () => {
    const base: EstadoDoPagamento = { forma: 'PARCELADO', metodo: 'PIX', vezes: 1, entrada: '', parcelas: 3, data: '2026-12-10', vencimento: '', bandeira: '', maquininha: '' }
    expect(montarPagamento(base)).toMatchObject({ forma: 'PARCELADO', metodo: null, entrada: 0 })
    expect(montarPagamento({ ...base, entrada: '50' })).toMatchObject({ forma: 'PARCELADO', metodo: 'PIX', entrada: 50 })
    expect(montarPagamento({ ...base, forma: 'A_RECEBER' })).toEqual({ forma: 'A_RECEBER', vencimento: null })
  })
  it('o contrato diz "no crediário" — a forma nunca fica vazia', () => {
    expect(valoresDoPagamento({ forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 2, primeiroVencimento: venc }, 400)['pagamento.metodo']).toBe('no crediário')
    expect(valoresDoPagamento({ forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 2, primeiroVencimento: venc }, 400)['pagamento.metodo'])
      .toBe('no crediário, com a entrada no Pix')
    expect(valoresDoPagamento({ forma: 'A_RECEBER', vencimento: null }, 400)['pagamento.metodo']).toBe('a receber')
  })
})

// A trava: nenhuma tela escreve o nome velho à mão.
describe('nenhuma tela diz "Entrada + parcelas" por conta própria (A23 da 14ª)', () => {
  const raiz = join(__dirname, '..')
  const arquivos: string[] = []
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n)
      if (statSync(c).isDirectory()) andar(c)
      else if (n.endsWith('.tsx')) arquivos.push(c)
    }
  }
  andar(join(raiz, 'components')); andar(join(raiz, 'app'))
  it('o literal só em comentário', () => {
    const fora = arquivos.filter(f => readFileSync(f, 'utf8').split('\n')
      .some(l => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(l) && /['"`]Entrada \+ parcelas['"`]/.test(l)))
    expect(fora).toEqual([])
  })
})
