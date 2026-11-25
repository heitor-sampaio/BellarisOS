import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * As correções da auditoria das regras (2026-11-18), agente C — o dinheiro:
 * quem vendeu (itens 1a e 1b), a ordem dos descontos (5), o estorno da venda de
 * crédito (6), o aceite do plano vencido pelo app (7), os limites dos pontos e
 * do voucher no PDV (12) e a forma do pagamento do usado (13). Os de tela e
 * banco estão em `e2e/vendas-auditoria-c-dinheiro.spec.ts`.
 */

const WEB = join(__dirname, '..')
const MIGRATIONS = join(WEB, '..', '..', 'supabase', 'migrations')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const migration = (prefixo: string) => {
  const f = readdirSync(MIGRATIONS).find(n => n.startsWith(prefixo))
  return f ? readFileSync(join(MIGRATIONS, f), 'utf8') : ''
}
const UNIDADE = '11111111-1111-4111-8111-111111111111'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('sem banco neste teste') } }))

// ─── Item 1: comissão sem ninguém escolher (com-06: "Campo vazio não gera comissão para ninguém") ──
describe('item 1b: a venda gravada sem o campo "Quem vendeu" não vai para quem registrou', () => {
  it('sem a equipe, ou sem a chave vendedorId, ninguém vendeu', async () => {
    const { quemVendeu } = await import('@/lib/vendas/equipe-da-venda')
    expect(await quemVendeu('rede', 'quem-registrou', null, UNIDADE)).toEqual({ vendedor: null })
    expect(await quemVendeu('rede', 'quem-registrou', undefined, UNIDADE)).toEqual({ vendedor: null })
    expect(await quemVendeu('rede', 'quem-registrou', {}, UNIDADE)).toEqual({ vendedor: null })
  })
  it('o campo vazio, sem a confirmação, ainda pergunta (r2-ven-12: "nasce sempre vazio")', async () => {
    const { quemVendeu, PERGUNTA_SEM_VENDEDOR } = await import('@/lib/vendas/equipe-da-venda')
    expect(await quemVendeu('rede', 'quem-registrou', { vendedorId: null }, UNIDADE)).toEqual({ pergunta: PERGUNTA_SEM_VENDEDOR })
    expect(await quemVendeu('rede', 'quem-registrou', { vendedorId: null, semVendedor: true }, UNIDADE)).toEqual({ vendedor: null })
  })
})

describe('item 1a: o produto acrescentado na comanda do atendimento nasce sem quem vendeu', () => {
  const sql = migration('20261124000001')
  it('o banco vende os produtos da comanda com quem a tela escolheu — não mais com quem atendeu', () => {
    expect(sql).toContain("where u.id = nullif(p_dados ->> 'vendedor_dos_produtos', '')::uuid")
  })
  it('a action confere quem vendeu os produtos (da equipe, ao alcance; vazio só confirmado)', () => {
    const acao = ler('actions/appointments.ts')
    expect(acao).toContain("formData.get('vendedor_dos_produtos')")
    expect(acao).toContain("formData.get('sem_vendedor_dos_produtos')")
    expect(acao).toMatch(/vendedor_dos_produtos:\s*vendedorDosProdutos/)
  })
  it('a tela do receber mostra "Quem vendeu os produtos" (vazio) e pergunta antes de seguir vazia', () => {
    const tela = ler('components/shared/receber-atendimento.tsx')
    expect(tela).toContain('CampoQuemVendeu')
    expect(tela).toContain('PerguntaDaVenda')
    expect(tela).toContain('name="vendedor_dos_produtos"')
    expect(ler('app/_shared/pdv.tsx')).toContain('equipeDosProdutos')
  })
})

// ─── Item 5: "Desconto, voucher, pontos" (o Heitor, 18/11), em todo lugar ─────
describe('item 5: a ordem dos descontos no atendimento avulso é a da Nova venda', () => {
  it('o voucher em % vale sobre o que sobrou do desconto comercial', async () => {
    const { voucherDepoisDoDesconto } = await import('@/lib/fidelidade/voucher-na-comanda')
    const v = { type: 'DESCONTO_PERCENTUAL', status: 'ATIVO', expires_at: '2999-01-01T00:00:00Z', procedure_id: null, discount_value: 10 }
    // R$ 200 − R$ 20 de desconto = R$ 180; 10% de R$ 180 = R$ 18 (era 10% de R$ 200 = R$ 20).
    expect(voucherDepoisDoDesconto(v, { procedureId: null, preco: 200, itens: 0, descontoVenda: 20 })).toEqual({ desconto: 18 })
  })
  it('o voucher em R$ não passa do que sobrou', async () => {
    const { voucherDepoisDoDesconto } = await import('@/lib/fidelidade/voucher-na-comanda')
    const v = { type: 'DESCONTO_VALOR', status: 'ATIVO', expires_at: '2999-01-01T00:00:00Z', procedure_id: null, discount_value: 100 }
    expect(voucherDepoisDoDesconto(v, { procedureId: null, preco: 100, itens: 0, descontoVenda: 30 })).toEqual({ desconto: 70 })
  })
  it('o de procedimento paga o que sobra do atendimento depois da parte dele no desconto', async () => {
    const { voucherDepoisDoDesconto, parteDosItens } = await import('@/lib/fidelidade/voucher-na-comanda')
    // R$ 100 de atendimento + R$ 50 de produto, R$ 15 de desconto: R$ 10 no atendimento, R$ 5 no produto.
    expect(parteDosItens(15, 100, 50)).toBe(5)
    const v = { type: 'PROCEDIMENTO', status: 'ATIVO', expires_at: '2999-01-01T00:00:00Z', procedure_id: 'p1', discount_value: null }
    expect(voucherDepoisDoDesconto(v, { procedureId: 'p1', preco: 100, itens: 50, descontoVenda: 15 })).toEqual({ desconto: 90 })
  })
  it('a parte dos produtos é a do banco (private.parte_dos_itens)', async () => {
    const { parteDosItens } = await import('@/lib/fidelidade/voucher-na-comanda')
    expect(parteDosItens(0, 100, 50)).toBe(0)
    expect(parteDosItens(10, 0, 50)).toBe(10)
    expect(parteDosItens(10, 100, 0)).toBe(0)
    expect(parteDosItens(10, 100, 50)).toBe(3.33)
    expect(parteDosItens(1, 1, 2)).toBe(0.67)
  })
  it('o que sai no receber se lista na mesma ordem: desconto, voucher, pontos', async () => {
    const { oQueSaiNoReceber } = await import('@/lib/pdv/situacoes')
    expect(oQueSaiNoReceber({ voucher: { nome: 'V', desconto: 10 }, desconto: 5, pontos: { pontos: 100, desconto: 2 } }).map(l => l.chave))
      .toEqual(['desconto', 'voucher', 'pontos'])
  })
  it('a action e a tela usam a mesma conta: o desconto primeiro, o voucher depois', () => {
    const acao = ler('actions/appointments.ts')
    expect(acao).toContain('voucherDepoisDoDesconto(')
    const tela = ler('components/shared/receber-atendimento.tsx')
    expect(tela).toContain('voucherDepoisDoDesconto(')
    expect(tela).toContain('total={price}')
  })
  it('o banco confere o voucher sobre o total menos o desconto comercial', () => {
    const sql = migration('20261124000001')
    expect(sql).toContain('round((v_total - v_dvenda) * v_voucher.discount_value / 100, 2)')
    expect(sql).toContain('least(v_voucher.discount_value, v_total - v_dvenda)')
  })
})

// ─── Item 6: o estorno da venda de crédito nunca devolve o concedido ──────────
describe('item 6: o estorno da venda de crédito devolve só o crédito VENDIDO que sobrou', () => {
  it('o crédito concedido (fora o bônus desta venda) não entra no que volta', () => {
    const sql = migration('20261124000002')
    expect(sql).toContain("pg_get_functiondef('public.credito_estornar_venda(")
    expect(sql).toContain('c.concedido and c.credito_vendido_id is distinct from p_venda')
    expect(sql).toContain("'concedido_fica'")
  })
  it('a janela diz o concedido que fica com a cliente', () => {
    expect(ler('components/shared/estornar-venda-de-credito.tsx')).toContain('data-concedido-fica')
  })
})

// ─── Item 7: o aceite do plano vencido pelo app só avisa ─────────────────────
describe('item 7: a validade da proposta é só informação, também no app', () => {
  it('a action não recusa o plano vencido', () => {
    expect(ler('actions/plano-da-cliente.ts')).not.toContain('Esta proposta venceu')
  })
  it('a página avisa e mantém o "Aceitar o plano"', async () => {
    const { avisoDaPropostaVencida } = await import('@/lib/plano-de-tratamento/validade')
    // CA1 (o Heitor, 13/11, "Concordo"; a revisão de 24/11, Q06): o nome da rede no lugar de "a equipe".
    expect(avisoDaPropostaVencida('10/11/2026', { faleCom: 'fale com Estética Bella' })).toBe('Proposta vencida em 10/11/2026: os valores podem ter mudado. Na dúvida, fale com Estética Bella antes de aceitar.')
    const pagina = ler('app/[slug]/cliente/planos/[id]/page.tsx')
    expect(pagina).toContain('avisoDaPropostaVencida(')
    expect(pagina.match(/<AceitarPlano /g)?.length).toBe(1)
    expect(pagina).not.toContain('fale com a equipe para atualizar o plano')
  })
})

// ─── Item 13: a forma do pagamento do usado nasce vazia ──────────────────────
describe('item 13: "Estornar o pagamento inteiro" não escolhe a forma do usado', () => {
  it('a forma, as vezes e a bandeira do usado ficam vazias, como toda forma (A37)', async () => {
    const { comOPagamentoInteiro, ESCOLHA_INICIAL } = await import('@/components/shared/escolha-da-devolucao')
    // O pagamento estornado era Crédito 3x VISA: nada disso vem para o usado.
    const e = comOPagamentoInteiro(ESCOLHA_INICIAL)
    expect(e).toEqual({ ...ESCOLHA_INICIAL, comoEstornar: 'INTEIRO' })
  })
  it('o que já foi escolhido não se desfaz', async () => {
    const { comOPagamentoInteiro, ESCOLHA_INICIAL } = await import('@/components/shared/escolha-da-devolucao')
    const e = comOPagamentoInteiro({ ...ESCOLHA_INICIAL, novoMetodo: 'PIX' })
    expect(e.novoMetodo).toBe('PIX')
    expect(e.comoEstornar).toBe('INTEIRO')
  })
})
