import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVISO_DA_DE_FABRICA } from '@/lib/financeiro/maquininha-de-fabrica'
import {
  temValorEmAberto, contarComValorEmAberto, comandasDoFiltro, hrefDasComValorEmAberto, FILTRO_COM_VALOR_EM_ABERTO,
  type ComandaDoPdv,
} from '@/lib/pdv/situacoes'
import { linhaDaComanda } from '@/lib/pdv/linha-da-comanda'
import { fimDoResumoDoProduto, motivoDaFaltaNoBotao } from '@/lib/vendas/falta-de-estoque'
import { rotuloDoReceberOPlano } from '@/lib/checkout/rotulos-do-plano'
import { avisoDoPlanoFechado } from '@/lib/checkout/sessoes-sem-data'
import {
  pedidoDoMotivoDaDiferenca, motivoDoFechamentoAnterior, avisoDaGavetaNoPagamento, linkDoCsvDoFechamento,
} from '@/lib/financeiro/conferencia-do-fechamento'
import { juntarCsvsDoFechamento } from '@/lib/financeiro/csv-da-contadora'
import { recompensasDaComanda, textoDeQuemTroca } from '@/lib/fidelidade/troca-na-comanda'

/**
 * Os atritos da 24ª simulação (2026-11-18) do PDV, do caixa, do fechamento do
 * dia, das taxas e da fidelidade que se provam sem tela: o texto, a conta pura
 * e o que a tela e o servidor passam a usar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null

const comanda = (c: Partial<ComandaDoPdv>): ComandaDoPdv => ({
  id: 'c1', numero: 1, origem: 'VENDA', abertaEm: '2026-11-18T12:00:00Z', canceladaEm: null, canceladaMotivo: null,
  cliente: 'Carla', clienteId: 'cl1', procedimento: 'Sérum', profissional: null, agendadoPara: null, agendamentoId: null,
  planoId: null, atendimento: null, valor: 100, paga: true, pagaEm: '2026-11-18T12:00:00Z', recebido: 100, forma: 'PIX',
  estornada: false, emAberto: 0, parcelasEmAberto: 0, proximoVencimento: null, jaPago: 0, produtos: 0, formas: [],
  ...c,
} as unknown as ComandaDoPdv)

// ── A7: o "+ Adicionar maquininha" diz que preenche a de fábrica ─────────────
describe('A7: preencher a maquininha de fábrica diz o que está fazendo', () => {
  it('o texto da tela', () => {
    expect(AVISO_DA_DE_FABRICA).toBe('Use esta, que ainda não tem taxas: dê o nome e as taxas da sua maquininha, e salve.')
  })
  it('a tela de Taxas mostra o aviso ao preencher a de fábrica', () => {
    const tela = ler('components/admin/settings-comissoes.tsx')
    expect(tela).toContain('data-preenchendo-a-de-fabrica')
    expect(tela).toContain('AVISO_DA_DE_FABRICA')
  })
})

// ── A14: o link do topo filtra só as vendas com parcelas a receber ───────────
describe('A14: "2 vendas com parcelas a receber" abre só elas', () => {
  const lista = [
    comanda({ id: 'a', emAberto: 200, parcelasEmAberto: 2 }),
    comanda({ id: 'b' }),
    comanda({ id: 'c', estornada: true, emAberto: 50 }),
    comanda({ id: 'd', paga: false, emAberto: 80 }),
  ]
  it('o filtro é o mesmo da contagem do topo', () => {
    expect(lista.filter(temValorEmAberto).map(c => c.id)).toEqual(['a'])
    expect(contarComValorEmAberto(lista)).toBe(1)
    expect(comandasDoFiltro(lista, FILTRO_COM_VALOR_EM_ABERTO).map(c => c.id)).toEqual(['a'])
    expect(comandasDoFiltro(lista, null)).toHaveLength(4)
    expect(comandasDoFiltro(lista, 'outra-coisa')).toHaveLength(4)
  })
  it('o link leva o filtro (e a unidade, na rede)', () => {
    expect(hrefDasComValorEmAberto('/centro/pdv', null)).toBe('/centro/pdv?ver=PAGAS&so=a-receber')
    expect(hrefDasComValorEmAberto('/admin/pdv', 'u1')).toBe('/admin/pdv?ver=PAGAS&so=a-receber&unidade=u1')
  })
  it('a tela usa o link e o filtro, e diz que está filtrando', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toContain('hrefDasComValorEmAberto(')
    expect(tela).toContain('comandasDoFiltro(')
    expect(tela).toContain('data-so-as-com-valor-em-aberto')
  })
})

// ── A15: a comanda da venda mostra a linha do desconto ───────────────────────
describe('A15: a venda direta com desconto mostra o item cheio e o desconto', () => {
  it('a linha devolve o desconto da venda (o item de R$ 120 vendido a R$ 117)', () => {
    expect(linhaDaComanda({ tipo: 'PRODUTO', quantidade: 1, precoUnitario: 120, total: 117, itens: 1, desconto: 3 }))
      .toEqual({ quantidade: 1, detalhe: null, desconto: 3 })
  })
  it('na quantidade, o unitário fica no detalhe e o desconto numa linha própria', () => {
    const l = linhaDaComanda({ tipo: 'PRODUTO', quantidade: 2, precoUnitario: 98, total: 184.44, itens: 1 })
    expect({ ...l, detalhe: sp(l.detalhe) }).toEqual({ quantidade: 2, detalhe: '2 × R$ 98,00', desconto: 11.56 })
  })
  it('o pacote vendido com desconto', () => {
    expect(linhaDaComanda({ tipo: 'PACOTE', desconto: 50 })).toEqual({ quantidade: 1, detalhe: null, desconto: 50 })
    expect(linhaDaComanda({ tipo: 'PACOTE', desconto: 0 })).toEqual({ quantidade: 1, detalhe: null })
  })
  it('a leitura traz o desconto gravado e a tela o mostra', () => {
    const leitura = ler('lib/pdv/linha-da-comanda-leitura.ts')
    expect(leitura).toContain('client_package_id')
    expect(leitura).toMatch(/select\('quantity, preco_unitario, price, desconto'\)/)
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toContain('data-desconto-da-venda')
  })
})

// ── A16: a comanda do pacote leva à assinatura do contrato ───────────────────
describe('A16: "Colher a assinatura" na comanda do pacote, com cara de botão', () => {
  it('o PDV lê o contrato pendente da venda e a comanda o oferece', () => {
    expect(ler('app/_shared/pdv.tsx')).toContain('documentosParaColher')
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toContain('data-colher-assinatura-da-venda')
  })
  it('depois da venda, o "Colher a assinatura agora" é um botão', () => {
    expect(ler('components/shared/vender-pacote.tsx')).toMatch(/className="btn-secondary"[^>]*>\s*Colher a assinatura agora/)
  })
})

// ── A17: a 1ª forma tem a linha dela, com o valor ────────────────────────────
describe('A17: ao receber em duas formas, a 1ª forma diz o valor no lugar do campo', () => {
  it('a 1ª forma tem a mesma caixa das outras', () => {
    const tela = ler('components/shared/outras-formas.tsx')
    expect(tela).toContain('data-parte-do-pagamento={1}')
    expect(tela).toContain('1ª forma')
    expect(tela).toContain('data-valor-da-primeira-forma')
  })
})

// ── A18: sem estoque, o resumo, o botão e o link dizem a mesma coisa ─────────
describe('A18: a venda sem estoque', () => {
  it('o resumo não promete a saída do estoque', () => {
    expect(fimDoResumoDoProduto(null)).toBe('sai do estoque agora, pelo lote que vence primeiro')
    expect(fimDoResumoDoProduto('Sem estoque de Sérum nesta unidade.')).toBeNull()
  })
  it('o botão desligado diz por quê', () => {
    expect(motivoDaFaltaNoBotao('Sem estoque de Sérum nesta unidade.')).toBe('Falta estoque nesta unidade.')
    expect(motivoDaFaltaNoBotao(null)).toBeNull()
  })
  it('a tela usa as duas, e a Entrada é um botão', () => {
    const tela = ler('components/shared/vender.tsx')
    expect(tela).toContain('fimDoResumoDoProduto(falta)')
    expect(tela).toContain('motivoDaFaltaNoBotao(falta)')
    expect(tela).toMatch(/className="btn-secondary"[^>]*>Dar entrada no Estoque/)
  })
})

// ── A19: a linha da parcela quebra em vez de cortar ──────────────────────────
describe('A19: a parcela compacta não corta o texto', () => {
  it('sem reticências, com quebra', () => {
    const tela = ler('components/shared/pdv/parcelas-em-aberto.tsx')
    expect(tela).not.toContain("textOverflow: 'ellipsis'")
    expect(tela).toContain("overflowWrap: 'anywhere'")
  })
})

// ── A20: o checkout do plano ─────────────────────────────────────────────────
describe('A20: o checkout do plano', () => {
  it('o botão final diz o que entra, não repete o título da janela', () => {
    expect(sp(rotuloDoReceberOPlano(1200))).toBe('Receber R$ 1.200,00')
    expect(rotuloDoReceberOPlano(0)).toBe('Fechar a comanda')
    const tela = ler('components/branch/checkout-wizard.tsx')
    expect(tela).toContain('rotuloDoReceberOPlano(')
    expect(tela).not.toContain("'Receber o plano'")
  })
  it('"O que se recebe agora" diz a forma escolhida', () => {
    expect(ler('components/branch/checkout-wizard.tsx')).toContain('data-forma-do-que-se-recebe')
  })
  it('o aviso de sucesso diz o nome da cliente', () => {
    expect(avisoDoPlanoFechado(3, [2, 3], 1, 'Carla Mendes')).toBe('Plano fechado: 3 sessões. 1 já agendada, 2 sem data — agende pela ficha quando Carla marcar.')
    expect(avisoDoPlanoFechado(3, [2, 3], 1)).toContain('quando a cliente marcar')
    expect(ler('components/branch/checkout-wizard.tsx')).toMatch(/avisoDoPlanoFechado\([^)]*plan\.clientName\)/)
  })
})

// ── A21: a diferença no fechamento pede o motivo (sem obrigar) ───────────────
describe('A21: fechar com diferença sugere a observação', () => {
  it('diz a diferença e pede o motivo', () => {
    expect(sp(pedidoDoMotivoDaDiferenca([{ forma: 'CASH', valor: -40.34 }], '')))
      .toBe('Faltou R$ 40,34 no Dinheiro: diga o motivo na observação.')
    expect(sp(pedidoDoMotivoDaDiferenca([{ forma: 'CASH', valor: -40.34 }, { forma: 'PIX', valor: 5 }], ' ')))
      .toBe('Faltou R$ 40,34 no Dinheiro e sobrou R$ 5,00 no Pix: diga o motivo na observação.')
  })
  it('sem diferença, ou com o motivo escrito, nada', () => {
    expect(pedidoDoMotivoDaDiferenca([{ forma: 'CASH', valor: 0 }], '')).toBeNull()
    expect(pedidoDoMotivoDaDiferenca([{ forma: 'CASH', valor: -40.34 }], 'troco a mais')).toBeNull()
  })
  it('o fechamento anterior diz o motivo, ou que não tem', () => {
    expect(motivoDoFechamentoAnterior({ observacao: 'troco a mais', diferenca: -40.34 })).toBe('“troco a mais”')
    expect(motivoDoFechamentoAnterior({ observacao: null, diferenca: -40.34 })).toBe('sem motivo anotado')
    expect(motivoDoFechamentoAnterior({ observacao: null, diferenca: 0 })).toBeNull()
  })
  it('a tela mostra os dois', () => {
    const tela = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(tela).toContain('data-pede-o-motivo')
    expect(tela).toContain('data-motivo-do-fechamento')
  })
})

// ── A22: pagar a comissão em dinheiro avisa a gaveta negativa ────────────────
describe('A22: a gaveta negativa avisa no pagamento da comissão', () => {
  it('o aviso, com a gaveta que fica', () => {
    expect(sp(avisoDaGavetaNoPagamento(13.34, 445)))
      .toBe('Pagar R$ 445,00 em dinheiro deixa a gaveta de hoje em −R$ 431,66: confira o dinheiro da gaveta, ou escolha outra forma.')
    expect(avisoDaGavetaNoPagamento(500, 445)).toBeNull()
    expect(avisoDaGavetaNoPagamento(445, 445)).toBeNull()
  })
  it('o "Fechar e pagar" lê a gaveta e avisa no dinheiro', () => {
    const tela = ler('components/shared/financeiro-comissoes.tsx')
    expect(tela).toContain('avisoDaGavetaNoPagamento(')
    expect(tela).toContain('data-gaveta-no-pagamento')
    expect(ler('actions/fechamento.ts')).toContain('export async function dinheiroNaGavetaDeHoje(')
  })
})

// ── A23: a tela de fechar leva ao CSV do fechamento ──────────────────────────
describe('A23: o link do CSV do fechamento', () => {
  it('a aba Movimentações do Financeiro do mesmo portal', () => {
    expect(linkDoCsvDoFechamento('/centro/pdv', null)).toBe('/centro/financeiro?aba=movimentacoes')
    expect(linkDoCsvDoFechamento('/admin/pdv', 'u1')).toBe('/admin/financeiro?aba=movimentacoes&unidade=u1')
  })
  it('a tela de fechar mostra o link', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('data-csv-do-fechamento')
    expect(ler('app/_shared/fechamento-do-dia.tsx')).toContain('linkDoCsvDoFechamento(')
  })
})

// ── A24: o CSV do fechamento na rede: a do filtro ou todas ───────────────────
describe('A24: "Todas as unidades" no CSV do fechamento', () => {
  it('as planilhas juntas, com um BOM só', () => {
    const junto = juntarCsvsDoFechamento(['﻿Dia;18/11/2026\r\nUnidade;Centro', '﻿Dia;18/11/2026\r\nUnidade;Sul'])
    expect(junto).toBe('﻿Dia;18/11/2026\r\nUnidade;Centro\r\n\r\nDia;18/11/2026\r\nUnidade;Sul')
    expect(junto.match(/﻿/g)).toHaveLength(1)
  })
  it('a janela oferece "Todas as unidades" e a action a aceita', () => {
    const tela = ler('components/shared/caixa-no-financeiro.tsx')
    expect(tela).toContain('Todas as unidades')
    expect(tela).not.toContain('<option value="">Selecione…</option>')
    expect(ler('actions/fechamento.ts')).toContain("branchId === 'TODAS'")
  })
})

// ── A25: receber a parcela tem o mesmo desenho nos dois caminhos ─────────────
describe('A25: o "Receber" do Financeiro usa as formas em blocos, como o PDV', () => {
  it('sem o seletor "Selecione…"', () => {
    const tela = ler('components/shared/receber-no-cartao.tsx')
    expect(tela).toContain('<FormasDePagamento')
    expect(tela).not.toContain('<option value="">Selecione…</option>')
  })
  it('o cartão diz "Ver e receber"', () => {
    const nota = ler('components/shared/nota-do-vencimento.tsx')
    expect(nota).toContain("'Ver e receber'")
    expect(nota).not.toContain("'Ver e dar baixa'")
  })
})

// ── A50: trocar pontos por voucher na comanda ────────────────────────────────
describe('A50: a troca de pontos na comanda', () => {
  const catalogo = [
    { id: 'r1', name: 'R$ 20 off', type: 'DESCONTO_VALOR', points_cost: 200, procedure_id: null },
    { id: 'r2', name: '10% off', type: 'DESCONTO_PERCENTUAL', points_cost: 300, procedure_id: null },
    { id: 'r3', name: 'Limpeza grátis', type: 'PROCEDIMENTO', points_cost: 900, procedure_id: 'p-limpeza' },
    { id: 'r4', name: 'Peeling grátis', type: 'PROCEDIMENTO', points_cost: 900, procedure_id: 'p-peeling' },
    { id: 'r5', name: 'Máscara', type: 'PRODUTO', points_cost: 400, procedure_id: null },
  ]
  it('o que vale nesta comanda: o desconto, e o procedimento só o do atendimento', () => {
    expect(recompensasDaComanda(catalogo, 'p-limpeza').map(r => r.id)).toEqual(['r1', 'r2', 'r3'])
    expect(recompensasDaComanda(catalogo, null).map(r => r.id)).toEqual(['r1', 'r2'])
  })
  it('a quem não troca, de quem é a troca', () => {
    expect(textoDeQuemTroca(['Larissa'])).toBe('Trocar pontos por voucher é de quem tem a Fidelidade em Gerenciar: Larissa.')
    expect(textoDeQuemTroca([])).toBe('Trocar pontos por voucher é de quem tem a Fidelidade em Gerenciar (ninguém na equipe tem hoje: veja em Configurações → Cargos).')
  })
  it('a comanda do atendimento e a Nova venda oferecem a troca', () => {
    expect(ler('components/shared/receber-atendimento.tsx')).toContain('<TrocarPontos')
    expect(ler('components/shared/pontos-na-venda.tsx')).toContain('<TrocarPontos')
    expect(ler('actions/fidelidade.ts')).toContain('export async function trocaDePontosDoAtendimento(')
  })
})
