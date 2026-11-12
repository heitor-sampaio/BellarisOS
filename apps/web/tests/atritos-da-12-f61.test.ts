import { describe, it, expect } from 'vitest'
import { descricaoDoLancamento, jaPodeTrocar } from '@/lib/fidelidade/formato'
import { textoDosPontosDoEstorno } from '@/lib/fidelidade/pontos-do-estorno'
import { medidaNoPlural, quantidadeComMedida } from '@/lib/estoque/medidas'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'
import { nomeDoPlanoNoApp, descontoDoPlanoNoApp } from '@/lib/plano-de-tratamento/nome'
import { csvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'
import { csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'
import { nomeDaBandeira } from '@/lib/financeiro/formas'

/**
 * A F61 — os atritos de caixa, financeiro, estoque e portal da 12ª simulação
 * (2026-11-11). As contas puras que as telas usam.
 */

describe('A41: o extrato de pontos não repete o título na descrição', () => {
  it('a descrição igual ao rótulo some; a diferente fica', () => {
    expect(descricaoDoLancamento('BONUS', 'Indicação de Carla Duarte')).toBeNull()
    expect(descricaoDoLancamento('ESTORNO_GANHO', 'Estorno da indicação de Carla (o pagamento dela foi estornado)')).toBeNull()
    expect(descricaoDoLancamento('GANHO', 'Limpeza de pele')).toBe('Limpeza de pele')
    expect(descricaoDoLancamento('GANHO', '  ')).toBeNull()
    expect(descricaoDoLancamento('AJUSTE', null)).toBeNull()
  })
})

describe('A53: com pontos suficientes, "você já pode trocar"', () => {
  it('só quando o saldo alcança o custo', () => {
    expect(jaPodeTrocar(780, 500)).toBe('Você já pode trocar: peça na recepção.')
    expect(jaPodeTrocar(500, 500)).toBe('Você já pode trocar: peça na recepção.')
    expect(jaPodeTrocar(280, 500)).toBeNull()
  })
})

describe('A30: o estorno diz os pontos que saem', () => {
  const base = { ligada: true, cliente: 'Carla', ganhos: 180, usados: 0, saldo: 380, premio: null }
  it('os pontos do pagamento, com o saldo de depois', () => {
    expect(textoDosPontosDoEstorno(base)).toBe('Saem 180 pontos de Carla, os que este pagamento deu: o saldo dela vai de 380 a 200 pontos.')
  })
  it('e o prêmio de quem indicou', () => {
    expect(textoDosPontosDoEstorno({ ...base, premio: { indicadora: 'Ana', pontos: 200, voucher: null, voucherUsado: false, passaParaOutro: false } }))
      .toBe('Saem 180 pontos de Carla, os que este pagamento deu: o saldo dela vai de 380 a 200 pontos. E saem os 200 pontos do prêmio de Ana pela indicação de Carla.')
  })
  it('o prêmio que passa para outro pagamento dela', () => {
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 0, premio: { indicadora: 'Ana', pontos: 200, voucher: null, voucherUsado: false, passaParaOutro: true } }))
      .toBe('O prêmio de Ana pela indicação de Carla (200 pontos) passa para o outro pagamento de Carla: sai e volta, e fica um só.')
  })
  it('o voucher do prêmio, ativo ou já usado', () => {
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 0, premio: { indicadora: 'Ana', pontos: 0, voucher: 'Limpeza grátis', voucherUsado: false, passaParaOutro: false } }))
      .toBe('O voucher “Limpeza grátis” de Ana, prêmio pela indicação de Carla, é cancelado.')
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 0, premio: { indicadora: 'Ana', pontos: 0, voucher: 'Limpeza grátis', voucherUsado: true, passaParaOutro: false } }))
      .toBe('O voucher “Limpeza grátis” de Ana, prêmio pela indicação de Carla, já foi usado: fica como foi.')
  })
  it('os pontos usados voltam; o saldo negativo se diz', () => {
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 50, usados: 100, saldo: 20 }))
      .toBe('Saem 50 pontos de Carla, os que este pagamento deu, e voltam os 100 pontos usados nele: o saldo dela vai de 20 a 70 pontos.')
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 180, saldo: 100 }))
      .toBe('Saem 180 pontos de Carla, os que este pagamento deu: o saldo dela vai de 100 a −80 pontos (fica negativo).')
  })
  it('com a fidelidade desligada, ou sem pontos, nada', () => {
    expect(textoDosPontosDoEstorno({ ...base, ligada: false })).toBeNull()
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 0 })).toBeNull()
  })
})

describe('A49: a embalagem no plural', () => {
  it('a partir de 2, o plural; as siglas ficam', () => {
    expect(medidaNoPlural('frasco', 3)).toBe('frascos')
    expect(medidaNoPlural('frasco', 1)).toBe('frasco')
    expect(medidaNoPlural('frasco', 1.5)).toBe('frasco')
    expect(medidaNoPlural('refil', 27)).toBe('refis')
    expect(medidaNoPlural('par', 2)).toBe('pares')
    expect(medidaNoPlural('seringa', 2)).toBe('seringas')
    expect(medidaNoPlural('ml', 500)).toBe('ml')
    expect(medidaNoPlural('un', 5)).toBe('un')
    expect(medidaNoPlural('cx', 5)).toBe('cx')
    expect(medidaNoPlural('frasco', -3)).toBe('frascos')
  })
  it('a quantidade com a medida', () => {
    expect(quantidadeComMedida(27, 'frasco')).toBe('27 frascos')
    expect(quantidadeComMedida(13500, 'ml')).toBe('13.500 ml')
    expect(quantidadeComMedida(2.68, 'frasco')).toBe('2,68 frascos')
  })
  it('o saldo como na prateleira, no plural', () => {
    expect(saldoNaPrateleira(1084, 100, 'refil', 'g')).toBe('10 refis fechados + 1 aberto com 84 g')
    expect(saldoNaPrateleira(300, 100, 'frasco', 'ml')).toBe('3 frascos')
  })
})

describe('A55: o plano no app diz o nome que a clínica deu e o desconto', () => {
  it('o nome, senão "Plano de tratamento"', () => {
    expect(nomeDoPlanoNoApp('Manchas — laser')).toBe('Manchas — laser')
    expect(nomeDoPlanoNoApp(null)).toBe('Plano de tratamento')
    expect(nomeDoPlanoNoApp('  ')).toBe('Plano de tratamento')
  })
  it('o desconto, só quando há', () => {
    expect(descontoDoPlanoNoApp(70)?.replace(/ /g, ' ')).toBe('Com desconto de R$ 70,00')
    expect(descontoDoPlanoNoApp(0)).toBeNull()
    expect(descontoDoPlanoNoApp(null)).toBeNull()
  })
})

describe('A44: o CSV com bandeira, desconto, profissional e unidade', () => {
  it('as colunas novas, e o fornecedor e a nota opcionais', () => {
    const csv = csvDosLancamentos([
      { data: '2026-11-10T15:00:00Z', descricao: 'Plano — entrada', cliente: 'Patrícia', categoria: 'Procedimento', tipo: 'INCOME',
        forma: 'CREDIT_CARD', vezes: 6, bandeira: 'VISA', situacao: 'PAGO', valor: 630, desconto: 70, profissional: 'Bianca', unidade: 'Acácia Adrianópolis' },
    ])
    const l = csv.slice(1).split('\r\n')
    expect(l[0]).toBe('Data;Descrição;Cliente;Unidade;Profissional;Quem vendeu;Categoria;Tipo;Forma;Bandeira;Situação;Valor;Conta no caixa;Desconto;Taxa da maquininha;Líquido;Vencimento;Pago em;Fornecedor (se informado);Nota fiscal (se informada)')
    expect(l[1]).toBe('10/11/2026;Plano — entrada;Patrícia;Acácia Adrianópolis;Bianca;;Procedimento;Receita;Crédito 6x;Visa;Pago;630,00;Sim;70,00;;;;;;')
  })
  it('o Fechamento: cada bandeira do cartão, e se o dia foi fechado', () => {
    const base = {
      dia: '2026-11-10', unidade: 'Acácia',
      formas: [{ forma: 'CREDIT_CARD:6', entradas: 1230, saidas: 0, saldo: 1230, lancamentos: 2 }],
      total: { entradas: 1230, saidas: 0, saldo: 1230, lancamentos: 2 }, esperadoDinheiro: 0, estornos: [],
      bandeiras: [
        { forma: 'CREDIT_CARD:6', bandeira: 'VISA', entradas: 630, saidas: 0 },
        { forma: 'CREDIT_CARD:6', bandeira: 'MASTERCARD', entradas: 600, saidas: 0 },
      ],
    }
    const aberto = csvDoFechamento({ ...base, fechado: null })
    expect(aberto).toContain('Cartão de crédito 6x · Visa;630,00;0,00;630,00')
    expect(aberto).toContain('Cartão de crédito 6x · Mastercard;600,00;0,00;600,00')
    expect(aberto).toContain('Situação do dia;Ainda não fechado')
    const fechado = csvDoFechamento({ ...base, fechado: { quem: 'Cláudia', quando: '2026-11-11T04:51:00Z', diferenca: 0 } })
    expect(fechado).toContain('Situação do dia;Fechado por Cláudia em 11/11/2026 às 01:51;Bateu')
  })
  it('o nome da bandeira, e a que não foi informada', () => {
    expect(nomeDaBandeira('VISA')).toBe('Visa')
    expect(nomeDaBandeira(null)).toBe('Bandeira não informada')
  })
})

describe('A40: o brinde da fidelidade nas perdas', () => {
  it('o motivo tem nome', async () => {
    const { rotuloDoMotivo } = await import('@/lib/estoque/perda')
    expect(rotuloDoMotivo('BRINDE')).toBe('Brinde da fidelidade')
  })
})
