import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  linhasDaConferencia, conferidoValido, lerConferidoDoCampo, valoresParaFecharDeNovo,
} from '@/lib/financeiro/conferencia-do-fechamento'
import { aindaHojeNaAgenda } from '@/lib/metrics/agenda-do-dia'
import { situacaoDoItemDaComanda, produtosEstornadosEmTexto, pagoJuntoEmTexto, rotuloDoPagamentoDaComanda } from '@/lib/pdv/situacoes'
import { recusaForaDoCampo, recusaDoPagamento, estadoDoPagamento } from '@/components/shared/campos-do-pagamento'
import { faltandoDoCadastro } from '@/lib/documentos/falta-no-cadastro'
import { avisoDoContratoAntesDeVender } from '@/lib/documentos/aviso-da-venda'

/**
 * Os defeitos e atritos do PDV, do caixa, da comissão e dos indicadores na
 * 18ª simulação (2026-11-16). Os de tela e banco estão em
 * `e2e/pdv-caixa-da-18.spec.ts`.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null
const migration = (trecho: string) => {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const nome = readdirSync(pasta).filter(n => n.includes(trecho)).sort().pop()
  return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
}
const hora = (iso: string | null) => iso ? iso.slice(11, 16) : ''

// ─── D2: o produto estornado sai do pago da comanda ─────────────────────────
describe('D2: o produto estornado diz "estornado · voltou ao estoque" e sai do pago', () => {
  const base = { nome: 'Protetor solar FPS 60', quantidade: 2, vendido: true }
  it('a linha do produto estornado diz o estorno e se voltou ao estoque', () => {
    expect(situacaoDoItemDaComanda({ ...base, estornadoEm: '2026-11-16T04:59:00Z', voltouAoEstoque: true }, false))
      .toBe('Produto · estornado · voltou ao estoque')
    expect(situacaoDoItemDaComanda({ ...base, estornadoEm: '2026-11-16T04:59:00Z', voltouAoEstoque: false }, true))
      .toBe('Produto · estornado · não voltou ao estoque')
  })
  it('o vendido e o ainda na comanda seguem como antes', () => {
    expect(situacaoDoItemDaComanda({ ...base, estornadoEm: null, voltouAoEstoque: null }, true)).toBe('Produto · já pago, fora do que falta receber')
    expect(situacaoDoItemDaComanda({ ...base, estornadoEm: null, voltouAoEstoque: null }, false)).toBe('Produto · saiu do estoque da unidade')
    expect(situacaoDoItemDaComanda({ ...base, vendido: false, estornadoEm: null, voltouAoEstoque: null }, true)).toBe('Produto · sai do estoque da unidade ao receber')
  })
  it('a comanda reaberta cita o produto estornado', () => {
    expect(produtosEstornadosEmTexto([
      { ...base, estornadoEm: '2026-11-16T04:59:00Z', voltouAoEstoque: true },
      { ...base, nome: 'Sérum', quantidade: 1, estornadoEm: null, voltouAoEstoque: null },
    ], hora)).toBe('Produto estornado às 04:59 — Protetor solar FPS 60 × 2, voltou ao estoque')
    expect(produtosEstornadosEmTexto([{ ...base, estornadoEm: null, voltouAoEstoque: null }], hora)).toBeNull()
  })
  it('a função da comanda só soma em "já pago" a venda de produto não estornada', () => {
    const sql = migration('pdv_comanda_produto_estornado')
    expect(sql).toMatch(/sum\(ps\.preco_tabela\)[\s\S]{0,300}ps\.estornada_em is null/)
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
  it('a leitura dos itens traz o estorno da venda', () => {
    expect(ler('lib/pdv/itens-da-comanda.ts')).toMatch(/product_sales\([^)]*estornada_em[^)]*produto_voltou/)
  })
})

// ─── D3: o Pix com o registrado negativo se confere ─────────────────────────
describe('D3: a forma com o registrado negativo se confere com o valor negativo', () => {
  it('o servidor aceita o Pix conferido em −R$ 210,00', () => {
    expect(conferidoValido({ PIX: -210 }, ['PIX'])).toEqual({ ok: true, conferido: { PIX: -210 } })
  })
  it('o campo lê "−210,00" (o menos da tela) e "-210,00"', () => {
    expect(lerConferidoDoCampo('−210,00')).toBe(-210)
    expect(lerConferidoDoCampo('-210,00')).toBe(-210)
    expect(lerConferidoDoCampo('  ')).toBeNull()
    expect(Number.isNaN(lerConferidoDoCampo('abc'))).toBe(true)
  })
  it('a tela não recusa o negativo das outras formas, e diz que pode', () => {
    const t = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(t).toContain('lerConferidoDoCampo(')
    expect(t).not.toMatch(/const v = parseDinheiro\(t\)\s*\n\s*if \(!Number\.isFinite\(v\) \|\| v < 0\)/)
    expect(sp(t)).toContain('Saiu mais do que entrou: confira com o sinal de menos')
  })
})

// ─── D5: o extrato diz a base do pagamento de cada lançamento ───────────────
describe('D5: cada lançamento da comissão com a base do pagamento dele', () => {
  it('o extrato lê a base pelo transaction_id do lançamento', () => {
    const sql = migration('comissao_base_do_pagamento')
    expect(sql).toContain('private.comissao_base_do_pagamento(')
    expect(sql).toMatch(/c\.transaction_id/)
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})

// ─── D6: "ainda hoje" não conta o concluído nem o em atendimento ────────────
describe('D6: "ainda hoje" só conta o que ainda vai acontecer', () => {
  it('o concluído adiantado e o em atendimento não contam', () => {
    const agora = new Date('2026-11-16T04:00:00Z')
    expect(aindaHojeNaAgenda([
      { scheduled_at: '2026-11-16T05:00:00Z', status: 'COMPLETED' },
      { scheduled_at: '2026-11-16T06:00:00Z', status: 'IN_PROGRESS' },
      { scheduled_at: '2026-11-16T07:00:00Z', status: 'CONFIRMED' },
      { scheduled_at: '2026-11-16T08:00:00Z', status: 'SCHEDULED' },
    ], agora)).toBe(2)
  })
})

// ─── A1: o "Pago junto" na comanda paga ─────────────────────────────────────
describe('A1: a comanda paga diz o que foi pago junto, e o que cada linha é', () => {
  const pagamentos = [
    { valor: 1411.56, metodo: 'CREDIT_CARD', vezes: 3, doAtendimento: true, vendaDeProduto: false, vendaDeCredito: false },
    { valor: 184.44, metodo: 'CREDIT_CARD', vezes: 3, doAtendimento: false, vendaDeProduto: true, vendaDeCredito: false },
  ]
  it('"Pago junto: atendimento R$ 1.411,56 + produtos R$ 184,44"', () => {
    expect(sp(pagoJuntoEmTexto(pagamentos))).toBe('Pago junto: atendimento R$ 1.411,56 + produtos R$ 184,44 (Crédito 3x)')
  })
  it('em formas diferentes não é "junto"; um pagamento só, também não', () => {
    expect(pagoJuntoEmTexto([pagamentos[0]!, { ...pagamentos[1]!, metodo: 'PIX', vezes: 1 }])).toBeNull()
    expect(pagoJuntoEmTexto([pagamentos[0]!])).toBeNull()
  })
  it('cada linha diz o que é', () => {
    expect(rotuloDoPagamentoDaComanda(pagamentos[0]!)).toBe('Atendimento')
    expect(rotuloDoPagamentoDaComanda(pagamentos[1]!)).toBe('Produto')
  })
  it('quem não estorna lê "o atendimento ou o produto", não "esta comanda"', () => {
    expect(sp(ler('components/shared/pdv/pdv-tela.tsx'))).toContain('Estornar o atendimento ou o produto desta comanda é de quem tem o Financeiro em Gerenciar')
  })
})

// ─── A2: a linha que mudou depois do fechamento vem em branco ───────────────
describe('A2: o "Fechar de novo" não traz o conferido velho da linha que mudou', () => {
  it('a linha que mudou vem em branco; a que não mudou, com o conferido', () => {
    const linhas = linhasDaConferencia({
      formas: [
        { forma: 'CASH', entradas: 1500, saidas: 0, saldo: 1500 },
        { forma: 'PIX', entradas: 300, saidas: 510, saldo: -210 },
      ],
      esperadoDinheiro: 1500,
      ultimo: {
        contado: 1500, esperado: 1500, diferenca: 0, conferido: { PIX: 300 },
        resumo: [{ forma: 'CASH', entradas: 1500, saidas: 0, saldo: 1500 }, { forma: 'PIX', entradas: 300, saidas: 0, saldo: 300 }],
      },
    })
    expect(valoresParaFecharDeNovo(linhas)).toEqual({ CASH: '1500,00' })
  })
  it('a tela usa a regra', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('valoresParaFecharDeNovo(linhas)')
  })
})

// ─── A3: os estornos do dia em linha própria ────────────────────────────────
describe('A3: "Detalhes do dia" diz os estornos do dia numa linha própria', () => {
  it('a soma dos estornos não fica colada no "por quem recebeu"', () => {
    const t = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(t).not.toContain('` e estornos (${brl(estornos.total)})`')
    expect(t).toMatch(/data-estornos-no-resumo[\s\S]{0,200}Estornos do dia: \{brl\(estornos\.total\)\}/)
  })
})

// ─── A4: a forma estornada no mesmo dia continua na tabela ──────────────────
describe('A4: a forma estornada no mesmo dia tem a linha dela', () => {
  it('o débito de R$ 350 estornado hoje: a linha com zero, sem pedir conferência', () => {
    const linhas = linhasDaConferencia({
      formas: [{ forma: 'PIX', entradas: 350, saidas: 0, saldo: 350 }],
      esperadoDinheiro: 0, ultimo: null, estornadoHoje: { DEBIT_CARD: 350, PONTOS: 10 },
    })
    const debito = linhas.find(l => l.forma === 'DEBIT_CARD')
    expect(debito).toMatchObject({ entradas: 0, saidas: 0, registrado: 0, conferivel: false })
    expect(linhas.find(l => l.forma === 'PONTOS')).toBeUndefined()
  })
  it('a página passa o estornado de hoje', () => {
    expect(ler('app/_shared/fechamento-do-dia.tsx')).toContain('estornadoHoje: estornos.mesmoDiaPorForma')
  })
})

// ─── A5: o motivo ao lado do Vender desabilitado ────────────────────────────
describe('A5: o Vender desabilitado diz por quê', () => {
  it('o crediário com entrada e sem a forma: "Escolha a forma da entrada."', () => {
    const e = { ...estadoDoPagamento(null, 'PARCELADO', 'America/Sao_Paulo'), entrada: '300,00', metodo: '' }
    expect(recusaForaDoCampo(e, 1500, 'Escolha a forma da entrada.')).toBe('Escolha a forma da entrada.')
  })
  it('a recusa que o campo da entrada já mostra não se repete ao lado do botão', () => {
    const e = { ...estadoDoPagamento(null, 'PARCELADO', 'America/Sao_Paulo'), entrada: '2.000,00', metodo: 'PIX' }
    const doCampo = recusaDoPagamento(e, 1500)
    expect(doCampo, 'a entrada acima do total').not.toBeNull()
    expect(recusaForaDoCampo(e, 1500, doCampo)).toBeNull()
    expect(recusaForaDoCampo(e, 1500, null)).toBeNull()
  })
  it('as quatro vendas mostram o motivo', () => {
    expect((ler('components/shared/vender.tsx').match(/<MotivoDoBotao /g) ?? []).length).toBe(3)
    expect(ler('components/shared/vender-pacote.tsx')).toContain('<MotivoDoBotao ')
  })
})

// ─── A6: o contrato do pacote avisa ANTES de vender ─────────────────────────
describe('A6: o PDV avisa antes de vender o que o contrato do pacote pede', () => {
  it('o que falta no cadastro, pelas variáveis obrigatórias do modelo', () => {
    const cliente = { name: 'Carla', document: '12345678909', birth_date: '1990-01-01', address: null, address_number: null, city: null }
    const faltando = faltandoDoCadastro(['cliente.nome', 'cliente.cpf', 'cliente.endereco', 'pagamento.valor', 'rede.nome'], cliente)
    expect(faltando.some(f => f.startsWith('Endereço'))).toBe(true)
    expect(faltando).not.toContain('CPF')
    expect(faltando.some(f => /pagamento/i.test(f))).toBe(false)
  })
  it('o aviso diz o contrato e o que falta', () => {
    // PC2 (auditoria de 2026-11-18): o contrato se assina ANTES do pagamento —
    // o aviso não diz mais que "a venda segue" com o cadastro incompleto.
    expect(avisoDoContratoAntesDeVender({ titulo: 'Contrato de pacote', faltando: ['Endereço'] }))
      .toBe('O contrato deste pacote (Contrato de pacote) pede Endereço, que falta no cadastro. A cliente assina o contrato antes do pagamento: complete o cadastro para ele ficar pronto para assinar.')
  })
  it('a venda do pacote mostra o aviso com "Completar o cadastro"', () => {
    const t = ler('components/shared/vender-pacote.tsx')
    expect(t).toContain('data-contrato-pede-cadastro')
    expect(t).toContain('Completar o cadastro')
  })
})
