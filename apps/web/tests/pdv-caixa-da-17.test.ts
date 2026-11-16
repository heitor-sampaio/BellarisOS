import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasDaConferencia, movimentoDepoisDoFechamento, textoDoMovimentoDepois } from '@/lib/financeiro/conferencia-do-fechamento'
import { filtroDosMembrosDaUnidade, membroAlcancaAUnidade } from '@/lib/unidades/do-membro'
import { formasDaComandaEmTexto, descontosDaComanda, estornoAnteriorEmTexto, valorNaLista, type ComandaDoPdv } from '@/lib/pdv/situacoes'

/**
 * Os defeitos e atritos do PDV, do caixa e da venda na 17ª simulação
 * (2026-11-15). Os de tela e banco estão em `e2e/pdv-atritos-da-17.spec.ts`.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

// ─── O banco de mentira (só o que estas leituras pedem) ─────────────────────
type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }
const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: [], error: null })
function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'in', 'is', 'or', 'order', 'range', 'limit', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(p)).then(ok, falhou)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
beforeEach(() => { pedidos.length = 0; responder = () => ({ data: [], error: null }) })
const oOr = (tabela: string) => pedidos.filter(p => p.tabela === tabela)
  .flatMap(p => p.ops.filter(o => o.op === 'or').map(o => String(o.args[0])))

const SAVASSI = '11111111-1111-4111-8111-111111111111'
const PAMPULHA = '22222222-2222-4222-8222-222222222222'

// ─── D1: quem tem duas unidades vende (e aparece) na que não é a principal ──
describe('D1: as unidades do membro são a principal E as outras', () => {
  it('o filtro dos membros de uma unidade traz a rede, a principal e as outras', () => {
    expect(filtroDosMembrosDaUnidade(SAVASSI))
      .toBe(`branch_id.is.null,branch_id.eq.${SAVASSI},outras_unidades.cs.{${SAVASSI}}`)
  })
  it('a pessoa da Pampulha (principal) com a Savassi nas outras alcança a Savassi', () => {
    const tania = { branch_id: PAMPULHA, outras_unidades: [SAVASSI] }
    expect(membroAlcancaAUnidade(tania, SAVASSI)).toBe(true)
    expect(membroAlcancaAUnidade(tania, PAMPULHA)).toBe(true)
    expect(membroAlcancaAUnidade({ branch_id: PAMPULHA, outras_unidades: [] }, SAVASSI)).toBe(false)
    expect(membroAlcancaAUnidade({ branch_id: null, outras_unidades: null }, SAVASSI)).toBe(true)
  })
  it('"Quem vendeu" lê as outras unidades de quem é da equipe', async () => {
    const { equipeDaVenda } = await import('@/lib/vendas/equipe-da-venda')
    await equipeDaVenda('rede', SAVASSI)
    expect(oOr('users')[0]).toContain(`outras_unidades.cs.{${SAVASSI}}`)
  })
  it('o servidor aceita quem tem a unidade nas outras (era "é de outra unidade")', async () => {
    const { recusaDoMembroDaVenda } = await import('@/lib/vendas/equipe-da-venda')
    const tania = '33333333-3333-4333-8333-333333333333'
    responder = p => p.tabela === 'users'
      ? { data: { id: tania, branch_id: PAMPULHA, outras_unidades: [SAVASSI], is_active: true, atende_em: [] }, error: null }
      : { data: [], error: null }
    expect(await recusaDoMembroDaVenda('rede', tania, SAVASSI, { papel: 'Quem vendeu' })).toBeNull()
    responder = p => p.tabela === 'users'
      ? { data: { id: tania, branch_id: PAMPULHA, outras_unidades: [], is_active: true, atende_em: [] }, error: null }
      : { data: [], error: null }
    expect(await recusaDoMembroDaVenda('rede', tania, SAVASSI, { papel: 'Quem vendeu' })).toBe('Quem vendeu: é de outra unidade.')
  })
  it('"quem estorna" e os outros "quem tem o módulo" leem as outras unidades', async () => {
    const { quemDesfazNoCaixa } = await import('@/lib/equipe/quem-desfaz')
    responder = p => ({ data: p.tabela === 'role_permissions' ? [{ role_id: 'cargo' }] : [], error: null })
    await quemDesfazNoCaixa('rede', SAVASSI)
    expect(oOr('users')[0]).toContain(`outras_unidades.cs.{${SAVASSI}}`)
  })
  it('os outros caminhos que leem "quem é da unidade" sobre users usam o mesmo filtro', () => {
    for (const f of ['lib/notifications/interessados.ts', 'lib/automacoes/acoes.ts']) {
      expect(ler(f), f).toContain('filtroDosMembrosDaUnidade(')
    }
  })
})

// ─── D2: o "Fechar de novo" não diz "Bateu" com movimento depois ─────────────
describe('D2: com movimento depois do fechamento, a linha não diz a diferença antiga', () => {
  const ultimo = {
    contado: 0, diferenca: 0, esperado: 0, conferido: { PIX: 100 },
    resumo: [{ forma: 'PIX', entradas: 100, saidas: 0, saldo: 100 }],
  }
  it('o dinheiro: fechou com R$ 0 e entrou R$ 200 depois — a conferir, não "Bateu"', () => {
    const linhas = linhasDaConferencia({
      formas: [{ forma: 'CASH', entradas: 200, saidas: 0, saldo: 200 }, { forma: 'PIX', entradas: 100, saidas: 0, saldo: 100 }],
      esperadoDinheiro: 200, ultimo,
    })
    const dinheiro = linhas.find(l => l.forma === 'CASH')!
    expect(dinheiro.registrado).toBe(200)
    expect(dinheiro.diferenca).toBeNull()
    expect(dinheiro.mudouDepois).toBe(true)
    expect(dinheiro.registradoNoFechamento).toBe(0)
    expect(dinheiro.conferido).toBe(0)
    // O Pix não mudou: a diferença do fechamento vale.
    const pix = linhas.find(l => l.forma === 'PIX')!
    expect(pix.mudouDepois).toBe(false)
    expect(pix.diferenca).toBe(0)
  })
  it('a outra forma: conferida em R$ 100 e agora R$ 300 — a conferir', () => {
    const linhas = linhasDaConferencia({
      formas: [{ forma: 'PIX', entradas: 300, saidas: 0, saldo: 300 }], esperadoDinheiro: 0, ultimo,
    })
    const pix = linhas.find(l => l.forma === 'PIX')!
    expect(pix.diferenca).toBeNull()
    expect(pix.mudouDepois).toBe(true)
    expect(pix.registradoNoFechamento).toBe(100)
  })
  it('a tela diz "a conferir" e o conferido de antes, com a hora', () => {
    const tela = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(tela).toContain('mudouDepois')
    expect(tela).toContain('a conferir')
  })
})

// ─── A3: o aviso diz o movimento de fato ─────────────────────────────────────
describe('A3: o aviso diz se entrou ou saiu, e quanto', () => {
  const retrato = [{ forma: 'PIX', entradas: 300, saidas: 0, saldo: 300 }, { forma: 'TOTAL', entradas: 300, saidas: 0, saldo: 300 }]
  it('só saiu (a comissão paga no Pix)', () => {
    const m = movimentoDepoisDoFechamento([{ forma: 'PIX', entradas: 300, saidas: 80, saldo: 220 }], retrato)
    expect(m).toEqual({ entrou: 0, saiu: 80 })
    expect(sp(textoDoMovimentoDepois(m, '21:23'))).toBe('Houve movimento depois do fechamento das 21:23 (saiu R$ 80,00): confira e feche de novo.')
  })
  it('entrou e saiu', () => {
    const m = movimentoDepoisDoFechamento([
      { forma: 'PIX', entradas: 300, saidas: 80, saldo: 220 }, { forma: 'CASH', entradas: 200, saidas: 0, saldo: 200 },
    ], retrato)
    expect(m).toEqual({ entrou: 200, saiu: 80 })
    expect(sp(textoDoMovimentoDepois(m, '21:23'))).toBe('Houve movimento depois do fechamento das 21:23 (entrou R$ 200,00 e saiu R$ 80,00): confira e feche de novo.')
  })
  it('o estorno de um pagamento do dia tira das entradas: saiu', () => {
    const m = movimentoDepoisDoFechamento([{ forma: 'PIX', entradas: 50, saidas: 0, saldo: 50 }], retrato)
    expect(m).toEqual({ entrou: 0, saiu: 250 })
  })
  it('sem diferença no retrato, a frase não inventa número', () => {
    expect(textoDoMovimentoDepois({ entrou: 0, saiu: 0 }, '21:23')).toBe('Houve movimento depois do fechamento das 21:23: confira e feche de novo.')
  })
})

// ─── D3, A1, A2: a comanda paga diz as formas, os descontos e o estorno ─────
const comanda = (mais: Partial<ComandaDoPdv>): ComandaDoPdv => ({
  id: 'c', numero: 1, origem: 'ATENDIMENTO', abertaEm: '2026-11-15T23:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl', cliente: 'Marta', agendamentoId: 'ag', procedimento: 'Limpeza', profissional: 'Sofia', agendadoPara: null,
  atendimento: 'COMPLETED', valor: 340, paga: true, pagaEm: '2026-11-16T00:09:00Z', recebido: 340, forma: 'PIX', estornada: false,
  planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 1, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...mais,
})

describe('D3: a comanda paga em duas formas diz as duas', () => {
  it('"Pix R$ 220,00 + Débito R$ 120,00"', () => {
    expect(sp(formasDaComandaEmTexto(comanda({
      formas: [{ forma: 'PIX', vezes: 1, valor: 220 }, { forma: 'DEBIT_CARD', vezes: 1, valor: 120 }],
    })))).toBe('Pix R$ 220,00 + Débito R$ 120,00')
  })
  it('uma forma só: só o nome dela (com as vezes)', () => {
    expect(formasDaComandaEmTexto(comanda({ forma: 'CREDIT_CARD', formas: [{ forma: 'CREDIT_CARD', vezes: 3, valor: 1160 }] }))).toBe('Crédito 3x')
    expect(formasDaComandaEmTexto(comanda({ forma: 'PIX', formas: [] }))).toBe('Pix')
  })
  it('a migration junta as formas dos lançamentos vivos do atendimento e dos produtos', () => {
    const sql = ler('../../supabase/migrations/20261117610001_pdv_comanda_formas_descontos_e_estorno.sql')
    expect(sql).toContain('formas jsonb')
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })
})

describe('A1: a comanda paga mostra o desconto e o voucher, e a lista o que foi pago', () => {
  it('as linhas do desconto, do voucher e dos pontos', () => {
    expect(descontosDaComanda(comanda({ desconto: 30 }))).toEqual([{ chave: 'desconto', rotulo: 'Desconto', valor: 30 }])
    expect(descontosDaComanda(comanda({ fidelidade: 40, voucher: 'Voucher R$ 40' })))
      .toEqual([{ chave: 'voucher', rotulo: 'Voucher “Voucher R$ 40”', valor: 40 }])
    expect(descontosDaComanda(comanda({ fidelidade: 16 }))).toEqual([{ chave: 'pontos', rotulo: 'Pontos', valor: 16 }])
    expect(descontosDaComanda(comanda({ paga: false, desconto: 30 }))).toEqual([])
  })
  it('a lista mostra o pago da comanda do atendimento paga, e o valor nas outras', () => {
    expect(valorNaLista(comanda({ valor: 280, recebido: 250 }))).toBe(250)
    expect(valorNaLista(comanda({ paga: false, valor: 280, recebido: null }))).toBe(280)
    expect(valorNaLista(comanda({ origem: 'VENDA', valor: 1100, recebido: 100, emAberto: 1000 }))).toBe(1100)
  })
})

describe('A2: a comanda reaberta diz o estorno anterior; a paga tem "Estornar"', () => {
  it('"Estornada às 21:20 — R$ 250,00, Pix, com R$ 30,00 de desconto"', () => {
    const hora = () => '21:20'
    expect(sp(estornoAnteriorEmTexto(comanda({
      paga: false, estornoAnterior: { quando: '2026-11-16T00:20:00Z', valor: 250, forma: 'PIX', vezes: 1, desconto: 30, fidelidade: 0, voucher: null },
    }), hora))).toBe('Estornada às 21:20 — R$ 250,00, Pix, com R$ 30,00 de desconto')
    expect(sp(estornoAnteriorEmTexto(comanda({
      paga: false, estornoAnterior: { quando: '2026-11-16T00:20:00Z', valor: 220, forma: 'DEBIT_CARD', vezes: 1, desconto: 0, fidelidade: 40, voucher: 'V40' },
    }), hora))).toBe('Estornada às 21:20 — R$ 220,00, Débito, com o voucher “V40” (R$ 40,00)')
    expect(estornoAnteriorEmTexto(comanda({ paga: false }), hora)).toBeNull()
  })
  it('a comanda paga tem o "Estornar" de quem estorna (podeEstornar), com a janela de sempre', () => {
    expect(ler('app/_shared/pdv.tsx')).toContain('podeEstornar(ctx)')
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('AcoesDoLancamentoDaFicha')
  })
})

// ─── A4 e A5 ─────────────────────────────────────────────────────────────────
describe('A4: as parcelas desta venda, uma linha por parcela, com o "Receber" ao lado', () => {
  it('a lista compacta não quebra a linha da parcela', () => {
    const tela = ler('components/shared/pdv/parcelas-em-aberto.tsx')
    expect(tela).toContain('compacta')
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/<ParcelasEmAberto[^>]*compacta/)
  })
})

describe('A5: a Entrada do crediário fecha no formato do dinheiro', () => {
  it('ao sair do campo, "100" vira "100,00"', () => {
    expect(ler('components/shared/campos-do-pagamento.tsx')).toMatch(/aria-label="Entrada"[\s\S]{0,400}onBlur=\{[\s\S]{0,200}formatDinheiroCampo/)
  })
})
