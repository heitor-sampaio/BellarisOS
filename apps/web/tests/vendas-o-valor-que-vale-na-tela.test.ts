import { describe, it, expect } from 'vitest'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * O valor que vale, na tela (princípio 3 — "O que a tela mostra é o que vale na
 * conta"; princípio 4 — "vale zero e a tela avisa"; princípio 7 — um nome só):
 * - a lista dos planos propostos com o desconto do plano;
 * - a comanda da venda devolvida em parte vale o vendido menos o devolvido (PR-08);
 * - "Venda direta", o nome do produto, em todo lugar;
 * - a linha de comissão de cada produto diz o produto e a regra que valeu nele;
 * - o DRE avisa a venda no cartão sem taxa cadastrada (0%).
 */

const WEB = nodePath.join(__dirname, '..')
const MIGRATIONS = nodePath.join(WEB, '..', '..', 'supabase', 'migrations')
const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), 'utf8')
const migrations = () => nodeFs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const ultimaCom = (trecho: string) => {
  const achou = migrations().filter(f => nodeFs.readFileSync(nodePath.join(MIGRATIONS, f), 'utf8').includes(trecho))
  return achou.length ? { nome: achou.at(-1)!, sql: nodeFs.readFileSync(nodePath.join(MIGRATIONS, achou.at(-1)!), 'utf8') } : null
}
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

// ─── D8: os planos propostos com o desconto do plano ───────────────────────
describe('a lista dos planos propostos diz o valor com o desconto combinado', () => {
  it('a lista lê o combinado e usa a conta das outras listas (totalDoPlanoNaLista)', () => {
    const t = ler('app/_shared/lista-de-checkout.tsx')
    expect(t).toMatch(/desconto_combinado_tipo, desconto_combinado_valor/)
    expect(t).toMatch(/totalDoPlanoNaLista\(/)
    expect(t).toMatch(/combinadoDoPlano\(/)
  })
})

// ─── D9: a comanda da venda devolvida em parte ──────────────────────────────
describe('a comanda da venda devolvida em parte vale o vendido menos o devolvido (PR-08)', () => {
  it('a linha da comanda diz o que foi devolvido', async () => {
    const { linhaDaComanda } = await import('@/lib/pdv/linha-da-comanda')
    const l = linhaDaComanda({ tipo: 'PRODUTO', quantidade: 3, precoUnitario: 130, total: 390, itens: 1, devolvido: { valor: 130, itens: '1× Sérum' } })
    expect(l.devolvido).toEqual({ valor: 130, itens: '1× Sérum' })
    // A linha continua dizendo o vendido.
    expect(l.quantidade).toBe(3)
    expect(sp(l.detalhe)).toBe('3 × R$ 130,00')
    // Sem devolução, nada.
    expect(linhaDaComanda({ tipo: 'PRODUTO', quantidade: 1, precoUnitario: 130, total: 130, itens: 1 }).devolvido).toBeUndefined()
    expect(linhaDaComanda({ tipo: 'PRODUTO', quantidade: 1, precoUnitario: 130, total: 130, itens: 1, devolvido: { valor: 0, itens: null } }).devolvido).toBeUndefined()
  })
  it('a leitura da linha traz o devolvido da venda e dos itens', () => {
    const t = ler('lib/pdv/linha-da-comanda-leitura.ts')
    expect(t).toMatch(/valor_devolvido/)
    expect(t).toMatch(/devolvidas/)
  })
  it('a tela mostra a linha do devolvido e o item pelo vendido', () => {
    const t = ler('components/shared/pdv/pdv-tela.tsx')
    expect(t).toMatch(/data-devolvido-da-venda/)
    expect(t).toMatch(/\(e\.valorDoAtendimento \?\? c\.valor\) \+ descontoDaVenda \+ devolvidoDaVenda/)
  })
  it('o banco: o valor da comanda da venda de produto é o preço menos o devolvido', () => {
    const m = ultimaCom('pdv_comandas')!
    expect(m.nome >= '20261205200001').toBe(true)
    expect(m.sql).toContain('ps.price - coalesce(ps.valor_devolvido, 0)')
    expect(m.sql).toContain("when 'VENDA' then coalesce(s.v_valor, 0)")
    expect(m.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
    expect(m.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

// ─── A12: "Venda direta", um nome só ────────────────────────────────────────
describe('"Venda direta" é o nome do uso do produto em toda tela', () => {
  it('Configurações → Comissões e a venda de produto não dizem "Revenda"', () => {
    const c = ler('components/admin/settings-comissoes.tsx')
    expect(c).not.toMatch(/uso “Revenda”/)
    expect(c).toMatch(/Nenhum produto de venda direta ativo/)
    expect(ler('actions/produtos.ts')).not.toMatch(/não é de revenda/)
  })
  it('as recusas do banco dizem "Venda direta"', () => {
    // A frase que a comanda já diz (comanda_acrescentar_item): uma só.
    const m = ultimaCom('não é de Venda direta: marque o uso e o preço de venda no cadastro.')
    expect(m, 'nenhuma migration troca a recusa do banco').not.toBeNull()
    expect(m!.sql).toContain("'public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure")
    expect(m!.sql).toContain("'public.produto_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,jsonb)'::regprocedure")
    expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('o Copilot fala "Venda direta", o nome da tela (a chave gravada REVENDA fica)', () => {
    const c = ler('lib/copilot/ferramentas/gestao-escrita.ts')
    expect(c).not.toMatch(/produto de revenda/i)
    expect(c).toMatch(/produto de Venda direta ou insumo cadastrado no Estoque/)
  })
})

// ─── A13: a linha de comissão de cada produto ───────────────────────────────
const linha: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-10T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 15,
  status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-10T13:00:00Z', cliente: 'Damiana', procedimento: '2× Sérum + 1× Protetor',
  origem: 'PRODUTO', preco: 150, regraTipo: 'PERCENTAGE', regraValor: 10, pacote: null, descontaTaxa: false, descontaInsumos: false,
  previsto: null, baseComPontos: 'PRECO', plano: null, base: 150, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: 'ITEM',
}
describe('a comissão de cada produto diz o produto e a regra que valeu nele', () => {
  it('o título é o produto da linha', async () => {
    const { tituloDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(tituloDoLancamento({ ...linha, itemDoProduto: { nome: 'Sérum', quantidade: 2 } })).toBe('Venda de produto: 2× Sérum')
    // Sem o item (a regra sobre o total), a venda inteira.
    expect(tituloDoLancamento(linha)).toBe('Venda de produto: 2× Sérum + 1× Protetor')
  })
  it('o percentual é do vendido; o fixo, por unidade', async () => {
    const { regraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(regraDoLancamento({ ...linha, itemDoProduto: { nome: 'Sérum', quantidade: 2 } }, 'Rúbia')).toBe('10% do vendido — do produto')
    expect(sp(regraDoLancamento({ ...linha, regraTipo: 'FIXED_AMOUNT', regraValor: 5, itemDoProduto: { nome: 'Protetor', quantidade: 1 } }, 'Rúbia')))
      .toBe('R$ 5,00 por unidade — do produto')
    expect(sp(regraDoLancamento({ ...linha, regraTipo: 'FIXED_AMOUNT', regraValor: 10, itemDoProduto: { nome: 'Protetor', quantidade: 2 } }, 'Rúbia')))
      .toBe('R$ 5,00 por unidade × 2 — do produto')
    expect(regraDoLancamento({ ...linha, regraValor: 5, regraDe: 'CLINICA', itemDoProduto: { nome: 'Sérum', quantidade: 2 } }, 'Rúbia'))
      .toBe('5% do vendido — da rede')
  })
  it('o CSV diz o produto da linha na coluna do procedimento', async () => {
    const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
    const csv = csvDoExtrato([{ ...linha, itemDoProduto: { nome: 'Sérum', quantidade: 2 } }], new Map([['p1', 'Rúbia']]), new Map([['b1', 'Glória']]))
    const l = csv.slice(1).split('\r\n')[1]!
    expect(l).toContain(';2× Sérum;')
    expect(l).toContain('10% do vendido — do produto')
  })
  it('a leitura do extrato liga cada linha ao item da venda', () => {
    const t = ler('lib/comissoes/leitura.ts')
    expect(t).toMatch(/itemDoProduto:/)
    expect(t).toMatch(/from\('product_sale_items'\)/)
  })
})

// ─── A14: o DRE avisa a venda no cartão sem taxa ────────────────────────────
describe('o DRE avisa a venda no cartão sem taxa cadastrada (0%)', () => {
  const debito = [{ metodo: 'DEBIT_CARD', vezes: 1, bandeira: null, vendas: 2, valor: 1000 }]
  it('o texto diz a forma, as vendas e o valor, e que valeu 0%', async () => {
    const { avisoDoDreSemTaxa } = await import('@/lib/financeiro/vendas-sem-taxa')
    expect(sp(avisoDoDreSemTaxa(debito))).toBe(
      'Sem taxa da maquininha cadastrada, a taxa destas vendas é R$ 0,00 (0%) no DRE: Débito: 2 vendas, R$ 1.000,00. Cadastre a taxa em Configurações → Comissões e taxas.')
    expect(avisoDoDreSemTaxa([])).toBeNull()
  })
  it('o CSV do DRE leva o aviso', async () => {
    const { csvDoDre } = await import('@/lib/financeiro/csv-da-contadora')
    const csv = csvDoDre({
      periodo: 'Novembro de 2026', receita: 1000, despesaOperacional: 0, insumos: 0, taxas: 0, comissoes: 0, lucro: 1000,
      compras: { total: 0, linhas: [] }, perdas: null, semTaxa: debito,
    })
    const l = csv.slice(1).split('\r\n').map(x => sp(x))
    expect(l).toContain('Taxas da maquininha;0,00')
    expect(l.some(x => x?.startsWith('Sem taxa da maquininha cadastrada (vale 0%);Débito: 2 vendas, R$ 1.000,00'))).toBe(true)
  })
  it('a tela do DRE mostra o aviso e o leva ao CSV', () => {
    const t = ler('components/admin/reports-bi-view.tsx')
    expect(t).toMatch(/data-dre-sem-taxa/)
    expect(t).toMatch(/avisoDoDreSemTaxa\(/)
    expect(t).toMatch(/semTaxa: p\.vendasSemTaxa/)
    expect(ler('components/admin/reports-bi-section.tsx')).toMatch(/vendasSemTaxa=\{/)
  })
})
