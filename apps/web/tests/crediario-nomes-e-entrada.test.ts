import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { ROTULO_DO_CREDIARIO, limiteDoCrediarioEmTexto, rotuloDoMeioNoCrediario } from '@/lib/financeiro/parcelas-do-crediario'
import { recusaDoPagamento, type EstadoDoPagamento } from '@/components/shared/campos-do-pagamento'

// A23 da 14ª simulação (F75): a configuração dizia "Crediário da clínica" e o
// Vender, "Entrada + parcelas" — a Wanda e a Débora não ligavam um ao outro; a
// lista das parcelas parava em 6x sem dizer por quê; e o "Meio de pagamento *"
// era exigido com a entrada vazia, quando nada se recebe agora.
describe('os nomes do crediário (A23 da 14ª)', () => {
  it('um nome só, que liga à configuração', () => {
    expect(ROTULO_DO_CREDIARIO).toBe('Crediário (entrada + parcelas)')
    expect(limiteDoCrediarioEmTexto(6)).toBe('até 6x, o limite da clínica')
  })
  it('o meio é o da entrada, e sem entrada não precisa', () => {
    expect(rotuloDoMeioNoCrediario(true)).toBe('Meio de pagamento da entrada *')
    expect(rotuloDoMeioNoCrediario(false)).toMatch(/sem entrada, não precisa/)
  })
})

describe('o crediário sem entrada não pede o meio (A23 da 14ª)', () => {
  const venc = '2026-12-10T15:00:00.000Z'
  it('o servidor aceita sem meio quando não há entrada, e recusa com entrada', () => {
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: '', entrada: 0, parcelas: 3, primeiroVencimento: venc }).success).toBe(true)
    const comEntrada = EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: '', entrada: 100, parcelas: 3, primeiroVencimento: venc })
    expect(comEntrada.success).toBe(false)
  })
  it('sem entrada, só as parcelas — sem meio, como o D6 da 6ª', () => {
    const l = lancamentosDoPagamento(300, { forma: 'PARCELADO', metodo: '' as never, entrada: 0, parcelas: 3, primeiroVencimento: venc }, 'Pacote')
    expect(l).toHaveLength(3)
    expect(l.every(x => x.payment_method === null && !x.is_paid)).toBe(true)
  })
  it('a tela também: sem entrada, sem recusa; com entrada, pede o meio da entrada', () => {
    const base: EstadoDoPagamento = { forma: 'PARCELADO', metodo: '', vezes: 1, entrada: '', parcelas: 3, data: '2026-12-10', vencimento: '', bandeira: '', maquininha: '' }
    expect(recusaDoPagamento(base, 300)).toBeNull()
    expect(recusaDoPagamento({ ...base, entrada: '100' }, 300)).toBe('Escolha o meio de pagamento da entrada.')
  })
})

// A trava: nenhuma tela escreve o nome velho à mão — é ROTULO_DO_CREDIARIO.
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
