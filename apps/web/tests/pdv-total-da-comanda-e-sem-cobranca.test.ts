import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  valorNaLista, rotuloDoTotalDaComanda, valeNoRecebido, separarAsQueNaoValem, tituloDoPdv, type ComandaDoPdv,
} from '@/lib/pdv/situacoes'

/**
 * O que a lista e a comanda do PDV somam (princípio 3: "o que a tela mostra é
 * o que vale na conta") e o título de quem entra pelo Fechamento (princípio 7).
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

const comanda = (mais: Partial<ComandaDoPdv>): ComandaDoPdv => ({
  id: 'c', numero: 1, origem: 'ATENDIMENTO', abertaEm: '2026-11-24T14:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl', cliente: 'Juliana', agendamentoId: 'ag', procedimento: 'Limpeza', profissional: 'Paula', agendadoPara: null,
  atendimento: 'COMPLETED', valor: 200, paga: true, pagaEm: '2026-11-24T15:00:00Z', recebido: 200, forma: 'PIX', estornada: false,
  planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...mais,
})

describe('a comanda do atendimento no crediário mostra o total dela, não só a entrada', () => {
  it('o item de R$ 200 com R$ 100 de entrada e R$ 100 em aberto: a lista e o total dizem R$ 200', () => {
    const c = comanda({ recebido: 100, emAberto: 100, parcelasEmAberto: 2, forma: 'CREDIARIO' })
    expect(valorNaLista(c)).toBe(200)
    expect(rotuloDoTotalDaComanda(c, { temDescontos: false })).toBe('Total')
  })
  it('no "a receber" (nada entrou), o total é o da comanda, não R$ 0', () => {
    expect(valorNaLista(comanda({ recebido: 0, emAberto: 200, forma: 'A_RECEBER' }))).toBe(200)
  })
  it('com desconto e nada em aberto, segue o "Total pago" do que foi pago (A1 da 17ª)', () => {
    const c = comanda({ valor: 280, recebido: 250, desconto: 30 })
    expect(valorNaLista(c)).toBe(250)
    expect(rotuloDoTotalDaComanda(c, { temDescontos: true })).toBe('Total pago')
  })
  it('com desconto e parte em aberto, é o total (o pago se diz ao lado), nunca "Total pago"', () => {
    const c = comanda({ valor: 280, recebido: 100, emAberto: 150, desconto: 30 })
    expect(valorNaLista(c)).toBe(250)
    expect(rotuloDoTotalDaComanda(c, { temDescontos: true })).toBe('Total')
  })
  it('a reaberta com parte já paga diz "Falta receber"', () => {
    expect(rotuloDoTotalDaComanda(comanda({ paga: false, recebido: null, jaPago: 50 }), { temDescontos: false })).toBe('Falta receber')
  })
  it('a tela usa a mesma conta da lista no total da comanda', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toContain('rotuloDoTotalDaComanda(')
    expect(tela).not.toMatch(/totalPago \? c\.recebido!/)
  })
})

describe('em "Todas", o cancelado e o estornado não somam como se valessem', () => {
  it('a comanda sem cobrança (cancelada, falta, sessão do pacote) e a estornada ficam fora do recebido', () => {
    expect(valeNoRecebido(comanda({}))).toBe(true)
    expect(valeNoRecebido(comanda({ paga: false, recebido: null }))).toBe(true)
    expect(valeNoRecebido(comanda({ paga: false, canceladaEm: '2026-11-24T16:00:00Z', canceladaMotivo: 'Atendimento cancelado' }))).toBe(false)
    expect(valeNoRecebido(comanda({ paga: false, canceladaEm: '2026-11-24T16:00:00Z', canceladaMotivo: 'Sessão do pacote' }))).toBe(false)
    expect(valeNoRecebido(comanda({ origem: 'VENDA', estornada: true }))).toBe(false)
  })
  it('a lista as separa, na ordem em que vieram', () => {
    const a = comanda({ id: 'a' })
    const b = comanda({ id: 'b', paga: false, canceladaEm: '2026-11-24T16:00:00Z', canceladaMotivo: 'Atendimento cancelado', valor: 1600 })
    const c = comanda({ id: 'c', paga: false, recebido: null })
    const { valem, foraDoRecebido } = separarAsQueNaoValem([a, b, c])
    expect(valem.map(x => x.id)).toEqual(['a', 'c'])
    expect(foraDoRecebido.map(x => x.id)).toEqual(['b'])
  })
  it('a tela mostra o grupo à parte, com o valor riscado', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toContain('separarAsQueNaoValem(')
    expect(tela).toContain('data-comandas-fora-do-recebido')
    expect(tela).toMatch(/data-valor-fora-do-recebido[\s\S]{0,200}line-through/)
  })
})

describe('o Fechamento do dia tem o título dele', () => {
  it('quem entra pelo Fechamento lê "Fechamento do dia"; nas comandas, "PDV"', () => {
    expect(tituloDoPdv('comandas')).toBe('PDV')
    expect(tituloDoPdv('fechar')).toMatch(/^Fechamento do dia/)
    // O Fechamento mora dentro do PDV (CX4): o título diz onde se está.
    expect(tituloDoPdv('fechar')).toContain('PDV')
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('{tituloDoPdv(vista)}')
  })
})

describe('o valor em reais do total não quebra em duas linhas', () => {
  it('o total da comanda do PDV e o "Total:" do plano ficam numa linha', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    const total = tela.slice(tela.indexOf('data-total-da-comanda'), tela.indexOf('data-total-da-comanda') + 700)
    expect(total).toMatch(/<b[^>]*whiteSpace: 'nowrap'/)
    const plano = ler('components/branch/checkout-wizard.tsx')
    expect(plano).toMatch(/whiteSpace: 'nowrap'[^>]*>Total: \{fmtBRL\(contaDesc\.liquido\)\}/)
    expect(plano).toMatch(/whiteSpace: 'nowrap'[^>]*>\s*\{fmtBRL\(valorAgora\)\}/)
  })
})

describe('a comanda do plano no crediário diz a forma da entrada (A15 da 26ª, ainda aberto no plano)', () => {
  it('as formas do que já entrou valem também para a comanda do PLANO', () => {
    const pasta = join(RAIZ, 'supabase', 'migrations')
    const corpo = readdirSync(pasta).filter(f => f >= '20261202200001' && f < '20261202300000')
      .map(f => readFileSync(join(pasta, f), 'utf8').replace(/\r/g, '')).join('\n')
    expect(corpo).toContain(`where s.origem in ('VENDA', 'PLANO') and coalesce(s.v_forma, '') <> 'A_RECEBER'`)
    expect(corpo).toContain('or t.treatment_plan_id = s.treatment_plan_id)')
    expect(corpo).toContain(`notify pgrst, 'reload schema';`)
  })
})
