import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Os atritos da 23ª simulação (2026-11-17) no PDV, no caixa, no Financeiro,
 * nas comissões, no estoque e na Auditoria. Cada bloco diz o atrito e o
 * princípio que o resolve.
 */

const WEB = path.resolve(__dirname, '..')
const fonte = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8')

describe('A4 [7]: a "Maquininha" vazia de fábrica se preenche, não ganha uma segunda', () => {
  const fabrica = { id: 'm1', nome: 'Maquininha', valores: { 'DEBIT_CARD/1': '', 'CREDIT_CARD/1': '0' }, maxVezes: '', porBandeira: {}, arquivada: false }

  it('a única, de fábrica e sem taxa, é a que o "Adicionar" preenche', async () => {
    const { vaziaDeFabrica } = await import('@/lib/financeiro/maquininha-de-fabrica')
    expect(vaziaDeFabrica([fabrica])?.id).toBe('m1')
  })

  it('com taxa, com outro nome, com outra maquininha (até arquivada) ou sem gravar, cria outra', async () => {
    const { vaziaDeFabrica } = await import('@/lib/financeiro/maquininha-de-fabrica')
    expect(vaziaDeFabrica([{ ...fabrica, valores: { 'DEBIT_CARD/1': '1,2' } }])).toBeNull()
    expect(vaziaDeFabrica([{ ...fabrica, nome: 'Stone' }])).toBeNull()
    expect(vaziaDeFabrica([{ ...fabrica, maxVezes: '6' }])).toBeNull()
    expect(vaziaDeFabrica([{ ...fabrica, porBandeira: { VISA: { prazo: '', valores: { 'DEBIT_CARD/1': '1' } } } }])).toBeNull()
    expect(vaziaDeFabrica([fabrica, { ...fabrica, id: 'm2', nome: 'Stone', arquivada: true }])).toBeNull()
    expect(vaziaDeFabrica([{ ...fabrica, id: null }])).toBeNull()
  })

  it('o "+ Adicionar maquininha" da tela de Taxas passa por ela', () => {
    const tela = fonte('components', 'admin', 'settings-comissoes.tsx')
    const adicionar = tela.slice(tela.indexOf('function adicionarMaquininha'), tela.indexOf('function descartarANova'))
    expect(adicionar).toMatch(/vaziaDeFabrica\(lista\)/)
  })
})

describe('A8 [3]: o SKU que ainda não existe diz que é gerado ao salvar', () => {
  it('o campo não mostra "OUT-NNN" como se fosse um valor', () => {
    const modal = fonte('components', 'branch', 'stock-product-modal.tsx')
    expect(modal).not.toMatch(/-NNN/)
    expect(modal).toMatch(/Gerado ao salvar/)
  })
})

describe('A12 [3]: a venda com parcelas a receber, o topo a cita e leva a ela', () => {
  it('"2 vendas com parcelas a receber" (era "2 com valor a receber", ao lado de "0 comandas abertas")', async () => {
    const { textoDasComValorEmAberto } = await import('@/lib/pdv/situacoes')
    expect(textoDasComValorEmAberto(1)).toBe('1 venda com parcelas a receber')
    expect(textoDasComValorEmAberto(2)).toBe('2 vendas com parcelas a receber')
    expect(textoDasComValorEmAberto(0)).toBeNull()
  })

  it('o topo é um link para "Fechadas hoje", onde elas estão', () => {
    const tela = fonte('components', 'shared', 'pdv', 'pdv-tela.tsx')
    expect(tela).toMatch(/data-com-valor-em-aberto[^>]*href=|href=[^>]*data-com-valor-em-aberto/)
  })
})

describe('A11 [3]: sem comanda aberta nesta unidade e com nas outras, o vazio diz onde estão', () => {
  it('"Nenhuma comanda aberta em Afonso Pena." e o caminho para a outra', async () => {
    const { vazioDasAbertas } = await import('@/lib/pdv/situacoes')
    expect(vazioDasAbertas('Afonso Pena', [{ id: 'b1', nome: 'Centro', abertas: 1 }])).toBe('Nenhuma comanda aberta em Afonso Pena.')
    // Sem outras com comanda, o texto de sempre.
    expect(vazioDasAbertas('Afonso Pena', [])).toBe('Nenhuma comanda aberta. Ela nasce quando um atendimento é iniciado e tem o que cobrar.')
  })

  it('a tela usa o vazio e mostra as outras como botão dentro dele', () => {
    const tela = fonte('components', 'shared', 'pdv', 'pdv-tela.tsx')
    expect(tela).toContain('vazioDasAbertas(')
    expect(tela).toContain('data-abertas-nas-outras-no-vazio')
  })
})

describe('A10 [3]: o total da comanda segue o voucher, o desconto e os pontos escolhidos no Receber', () => {
  it('as linhas do que sai: o voucher, o desconto e os pontos (os rótulos da comanda paga); sem nada, nenhuma', async () => {
    const { oQueSaiNoReceber } = await import('@/lib/pdv/situacoes')
    expect(oQueSaiNoReceber({ voucher: { nome: 'Voucher R$ 30', desconto: 30 }, desconto: 0, pontos: { pontos: 0, desconto: 0 } }))
      .toEqual([{ chave: 'voucher', rotulo: 'Voucher “Voucher R$ 30”', valor: 30 }])
    expect(oQueSaiNoReceber({ voucher: null, desconto: 15, pontos: { pontos: 200, desconto: 20 } }).map(l => l.chave)).toEqual(['desconto', 'pontos'])
    expect(oQueSaiNoReceber({ voucher: null, desconto: 0, pontos: { pontos: 0, desconto: 0 } })).toEqual([])
  })

  it('o Receber conta à comanda o que sai, e o total dela o mostra', () => {
    const form = fonte('components', 'shared', 'receber-atendimento.tsx')
    expect(form).toContain('aoMudarOQueSai')
    const tela = fonte('components', 'shared', 'pdv', 'pdv-tela.tsx')
    expect(tela).toContain('aoMudarOQueSai=')
    expect(tela).toContain('data-sai-no-receber')
  })
})

describe('A13 [3]: o estorno da venda de produto diz o valor da VENDA, com as formas', () => {
  const sp = (s: string) => s.replace(/[  ]/g, ' ')
  it('Pix R$ 200 + Dinheiro R$ 100: R$ 300,00, e as duas formas', async () => {
    const { vendaDoEstornoEmTexto } = await import('@/lib/financeiro/reabertura-do-estorno')
    const v = vendaDoEstornoEmTexto([
      { valor: 200, pago: true, metodo: 'PIX', vezes: null },
      { valor: 100, pago: true, metodo: 'CASH', vezes: null },
    ])
    expect(v.total).toBe(300)
    expect(sp(v.texto)).toBe('A venda inteira: R$ 300,00 (Pix R$ 200,00 e Dinheiro R$ 100,00).')
  })

  it('com parte a receber, diz o pago e o a receber', async () => {
    const { vendaDoEstornoEmTexto } = await import('@/lib/financeiro/reabertura-do-estorno')
    const v = vendaDoEstornoEmTexto([
      { valor: 150, pago: true, metodo: 'PIX', vezes: null },
      { valor: 150, pago: false, metodo: null, vezes: null },
    ])
    expect(sp(v.texto)).toBe('A venda inteira: R$ 300,00 (Pix R$ 150,00; R$ 150,00 a receber).')
  })

  it('a janela pergunta a venda ao banco e mostra o valor dela, não o da linha clicada', () => {
    const janela = fonte('components', 'shared', 'confirmar-estorno.tsx')
    expect(janela).toContain('vendaDoEstorno(')
    expect(janela).toContain('data-venda-do-estorno')
    expect(fonte('actions', 'financial.ts')).toMatch(/export async function vendaDoEstorno\(/)
  })
})

describe('A14 [3]: a parcela com uma parte paga diz o total, o pago e o que falta', () => {
  const sp = (s: string) => s.replace(/[  ]/g, ' ')
  it('"1/3 · R$ 150,00 · pago R$ 50,00, falta R$ 100,00" (era "1/3 · R$ 100,00")', async () => {
    const { valorDaParcelaEmTexto } = await import('@/lib/pdv/situacoes')
    expect(sp(valorDaParcelaEmTexto({ valor: 100, pago: 50, numero: 1, total: 3 }))).toBe('1/3 · R$ 150,00 · pago R$ 50,00, falta R$ 100,00')
    // Sem nada pago, como era.
    expect(sp(valorDaParcelaEmTexto({ valor: 150, pago: 0, numero: 1, total: 3 }))).toBe('1/3 · R$ 150,00')
    expect(sp(valorDaParcelaEmTexto({ valor: 300, pago: 0, numero: null, total: null }))).toBe('A receber · R$ 300,00')
  })

  it('a leitura soma o pago da MESMA parcela (o grupo e o número), e a lista usa o texto', () => {
    expect(fonte('lib', 'pdv', 'parcelas-da-cliente.ts')).toContain('parcela_grupo')
    expect(fonte('components', 'shared', 'pdv', 'parcelas-em-aberto.tsx')).toContain('valorDaParcelaEmTexto(')
  })
})

describe('A15 [3, 7]: sem estoque, o Vender desliga com o motivo e aponta a Entrada', () => {
  it('diz o que falta, produto a produto; com estoque, nada', async () => {
    const { faltaDeEstoqueNaVenda } = await import('@/lib/vendas/falta-de-estoque')
    expect(faltaDeEstoqueNaVenda([{ nome: 'Óleo corporal', quantidade: 1, disponivel: 0, unidade: 'frasco' }]))
      .toBe('Sem estoque de Óleo corporal nesta unidade.')
    expect(faltaDeEstoqueNaVenda([{ nome: 'Óleo corporal', quantidade: 3, disponivel: 1, unidade: 'frasco' }]))
      .toBe('Só há 1 frasco de Óleo corporal nesta unidade.')
    expect(faltaDeEstoqueNaVenda([{ nome: 'Sérum', quantidade: 2, disponivel: 8, unidade: 'un' }])).toBeNull()
  })

  it('a venda de produto usa a falta no botão e leva à Entrada no Estoque', () => {
    const tela = fonte('components', 'shared', 'vender.tsx')
    expect(tela).toContain('faltaDeEstoqueNaVenda(')
    expect(tela).toContain('data-falta-de-estoque')
    expect(tela).toMatch(/disabled=\{[^}]*!!falta/)
  })
})

describe('A17 [3]: o número grande do "A receber da cliente" é o em aberto; o do período vai abaixo', () => {
  it('o rótulo diz "em aberto"', async () => {
    const { ROTULO_DO_A_RECEBER_DA_CLIENTE } = await import('@/lib/financeiro/abas')
    expect(ROTULO_DO_A_RECEBER_DA_CLIENTE).toBe('A receber da cliente · em aberto')
  })

  it('as duas telas põem o em aberto no número grande e o período na nota', () => {
    const hub = fonte('components', 'branch', 'financial-hub.tsx')
    const cartaoHub = hub.slice(hub.indexOf('const cartaoAReceber'), hub.indexOf('const cartaoDaOperadora'))
    expect(cartaoHub).toMatch(/curr=\{aReceberEmAberto\}/)
    expect(cartaoHub).toContain('noTopoOEmAberto')
    const rede = fonte('components', 'admin', 'admin-financial-view.tsx')
    const cartaoRede = rede.slice(rede.indexOf('const cartaoAReceber'), rede.indexOf('const cartaoDaOperadora'))
    expect(cartaoRede).toMatch(/value=\{fmtBRL\(aReceberEmAberto\)\}/)
    expect(cartaoRede).toContain('noTopoOEmAberto')
    const nota = fonte('components', 'shared', 'nota-do-vencimento.tsx')
    expect(nota).toContain('data-vence-no-periodo')
  })
})

describe('A20 [3]: o CSV de comissões não diz "Desconto 0,00" como se não houvesse voucher', () => {
  it('a coluna diz que é o desconto que saiu da BASE (com a base cheia, o voucher não sai)', async () => {
    const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
    const cab = csvDoExtrato([], new Map(), new Map()).slice(1).split('\r\n')[0]!.split(';')
    expect(cab).toContain('Desconto que saiu da base')
    expect(cab).not.toContain('Desconto')
  })
})

describe('A31 [3]: a Auditoria diz a parcela, o valor de cada forma e o que mudou no item da comanda', () => {
  const sp = (s: string) => s.replace(/[  ]/g, ' ')
  const base = {
    id: 1, criado_em: '2026-11-17T22:40:00.000Z', branch_id: 'b1', client_id: 'c1', ator_user_id: 'u1', ator_nome: 'Carla',
    ator_tipo: 'membro' as const, incompleto: false, colunas: [] as string[], antes: {}, depois: {},
  }
  const nomes = {
    clientes: { c1: 'Marta Sales' }, membros: {}, unidades: { b1: 'Petrópolis' },
    lancamentos: {
      ft1: { tipo: 'INCOME', valor: 100, forma: 'PIX', parcela: 1, de: 3 },
      ft2: { tipo: 'INCOME', valor: 50, forma: 'CASH', parcela: 1, de: 3 },
    },
    itensDaComanda: { i1: 'Sérum' },
  }

  it('a parcela recebida em duas formas: "Recebeu a parcela 1/3 (R$ 150,00: Dinheiro R$ 50,00 e Pix R$ 100,00)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      { ...base, tabela: 'financial_transactions', operacao: 'criou' as const, registro_id: 'ft2',
        depois: { type: 'INCOME', amount: 50, payment_method: 'CASH', paid_at: '2026-11-17T22:40:00Z' } },
      { ...base, tabela: 'financial_transactions', operacao: 'editou' as const, registro_id: 'ft1',
        colunas: ['paid_at', 'is_paid', 'payment_method', 'amount'], antes: { paid_at: null, amount: 150 },
        depois: { paid_at: '2026-11-17T22:40:00Z', payment_method: 'PIX', amount: 100 } },
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu a parcela 1/3 (R$ 150,00: Dinheiro R$ 50,00 e Pix R$ 100,00) — Marta Sales')
  })

  it('o recebimento em duas formas diz quanto foi em cada uma', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      { ...base, tabela: 'financial_transactions', operacao: 'criou' as const, registro_id: 'x2',
        depois: { type: 'INCOME', amount: 50, payment_method: 'CASH', paid_at: '2026-11-17T22:40:00Z' } },
      { ...base, tabela: 'financial_transactions', operacao: 'criou' as const, registro_id: 'x1',
        depois: { type: 'INCOME', amount: 100, payment_method: 'PIX', paid_at: '2026-11-17T22:40:00Z' } },
    ]
    expect(sp(fraseDoGrupo(linhas, { ...nomes, lancamentos: {} }))).toBe('Recebeu R$ 150,00 (Dinheiro R$ 50,00 e Pix R$ 100,00) — Marta Sales')
  })

  it('o "−/+" do item da comanda diz o produto e a quantidade, não "Editou o item da comanda"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const item = (antes: number, depois: number) => ({ ...base, tabela: 'comanda_itens', operacao: 'editou' as const, registro_id: 'i1',
      colunas: ['quantidade'], antes: { quantidade: antes }, depois: { quantidade: depois } })
    expect(fraseDaAuditoria(item(1, 2), nomes)).toBe('Pôs mais 1 Sérum na comanda (agora 2) — Marta Sales')
    expect(fraseDaAuditoria(item(3, 2), nomes)).toBe('Tirou 1 Sérum da comanda (agora 2) — Marta Sales')
    expect(fraseDaAuditoria({ ...item(1, 1), operacao: 'apagou' as const, colunas: [], depois: {} }, nomes)).toBe('Tirou Sérum da comanda — Marta Sales')
  })
})

describe('A30 [7]: "Valor em estoque por categoria" some com uma categoria só', () => {
  it('a pizza de 100% numa fatia não aparece', () => {
    const tela = fonte('components', 'admin', 'reports-bi-view.tsx')
    const secao = tela.slice(tela.indexOf('const byCategory      = e.valorPorCategoria'))
    expect(secao).toMatch(/byCategory\.length > 1 && \(\s*<SCard title="Valor em Estoque por Categoria">/)
  })
})
