import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  seloDaComanda, vendaEstornadaEmTexto, situacaoDoItemDaComanda, anterioresEmAbertoEmTexto,
  type ComandaDoPdv,
} from '@/lib/pdv/situacoes'
import { rotuloDaOpcaoDeParcelas } from '@/lib/financeiro/parcelas-do-crediario'
import { avisoDaGavetaNegativa, rotuloDoBotaoDeFechar } from '@/lib/financeiro/conferencia-do-fechamento'
import { textoDaComissaoETaxaDoEstorno } from '@/lib/financeiro/reabertura-do-estorno'
import { textoDeQuemRecebe, textoDeQuemConclui, textoDeQuemCompletaOCadastro } from '@/lib/equipe/textos-de-quem-pode'
import { PERGUNTA_SEM_VENDEDOR } from '@/lib/vendas/pergunta-sem-vendedor'
import { avisoDeQuemEntrouSemComissao } from '@/lib/equipe/textos-do-cadastro'

/**
 * O D4 e os atritos da 20ª simulação (2026-11-16) do PDV, do caixa, das
 * vendas, do atendimento e dos documentos que se provam sem tela: o texto, a
 * regra pura de leitura e o que a tela passa a usar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null

const comanda = (c: Partial<ComandaDoPdv> = {}): ComandaDoPdv => ({
  id: 'c1', numero: 5, origem: 'ATENDIMENTO', abertaEm: '2026-11-16T14:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl1', cliente: 'Camila', agendamentoId: null, procedimento: 'Plano de 2 Peelings', profissional: 'Paula',
  agendadoPara: null, atendimento: null, valor: 440, paga: false, pagaEm: null, recebido: null,
  forma: null, estornada: false, planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...c,
})

describe('D4: a comanda do plano aceito não diz "Atendida"', () => {
  it('o plano aceito, ainda sem pagamento: "Plano aceito, a pagar"', () => {
    expect(seloDaComanda(comanda({ origem: 'PLANO', planoId: 'p1' }))).toEqual({ texto: 'Plano aceito, a pagar', tom: 'warn' })
  })
  it('a venda reaberta sem pagamento é "A receber"; o atendimento concluído segue "Atendida, a pagar"', () => {
    expect(seloDaComanda(comanda({ origem: 'VENDA' }))).toEqual({ texto: 'A receber', tom: 'warn' })
    expect(seloDaComanda(comanda({ origem: 'ATENDIMENTO', atendimento: 'COMPLETED' }))).toEqual({ texto: 'Atendida, a pagar', tom: 'warn' })
  })
})

describe('A1: o seletor do crediário diz quantos pagamentos dá, com a entrada', () => {
  it('sem entrada, "3x"; com entrada, "3x + entrada (4 pagamentos)"', () => {
    expect(rotuloDaOpcaoDeParcelas(3, false)).toBe('3x')
    expect(rotuloDaOpcaoDeParcelas(3, true)).toBe('3x + entrada (4 pagamentos)')
    expect(rotuloDaOpcaoDeParcelas(1, true)).toBe('1x + entrada (2 pagamentos)')
  })
  it('as três telas do crediário usam o rótulo', () => {
    for (const arquivo of ['components/shared/campos-do-pagamento.tsx', 'components/branch/checkout-wizard.tsx', 'components/branch/appointment-session.tsx']) {
      expect(ler(arquivo), arquivo).toContain('rotuloDaOpcaoDeParcelas(')
    }
  })
})

describe('A2: a venda estornada diz que cobrar de novo é uma Nova venda', () => {
  it('a venda: "Para cobrar de novo, faça uma Nova venda."', () => {
    expect(vendaEstornadaEmTexto(comanda({ origem: 'VENDA', estornada: true })))
      .toBe('Venda estornada: o dinheiro dela voltou. Não há o que receber. Para cobrar de novo, faça uma Nova venda.')
  })
  it('o PDV usa o texto', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('vendaEstornadaEmTexto(c)')
  })
})

describe('A3: os textos não supõem o gênero de quem vende ou atende', () => {
  it('"a venda fica sem quem vendeu"', () => {
    expect(PERGUNTA_SEM_VENDEDOR).not.toMatch(/vendedora/)
    expect(PERGUNTA_SEM_VENDEDOR).toContain('sem quem vendeu')
  })
  it('"Escolha quem atende e a data"', () => {
    const t = ler('components/branch/treatment-sessions-modal.tsx')
    expect(t).not.toContain('Escolha a profissional e a data')
    expect(t).toContain('Escolha quem atende e a data')
  })
  it('quem entrou sem comissão: "os atendimentos de Dr. Marcos"', () => {
    expect(avisoDeQuemEntrouSemComissao('Dr. Marcos'))
      .toBe('Dr. Marcos entrou sem comissão: os atendimentos de Dr. Marcos não geram comissão até alguém definir, no chip “Sem comissão” da linha.')
    expect(ler('actions/team.ts')).not.toContain('os atendimentos dela')
  })
})

describe('A4: a saída em dinheiro maior que a entrada é avisada', () => {
  it('o registrado negativo do dinheiro diz o quanto passou', () => {
    expect(sp(avisoDaGavetaNegativa(-80)))
      // A4 da 21ª: sem o "a gaveta não fica negativa" (lido como contradição ao lado do −R$ 80,00).
      .toBe('Saiu R$ 80,00 a mais do que entrou em dinheiro: confira a saída em dinheiro, ou informe o fundo de troco.')
    expect(avisoDaGavetaNegativa(0)).toBeNull()
    expect(avisoDaGavetaNegativa(120)).toBeNull()
  })
  it('o Fechamento mostra o aviso na linha do dinheiro', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('avisoDaGavetaNegativa(l.registrado)')
  })
})

describe('A5: a parcela recebida adiantada diz as de antes, em aberto', () => {
  const p = (numero: number, venda: string | null, vencimento: string) => ({
    id: `p${numero}${venda}`, valor: 200, numero, total: 2, descricao: null, vencimento, vencida: false, venda,
  })
  it('a 2/2 com a 1/2 aberta', () => {
    const todas = [p(1, 'v1', 'Vence 16/12/2026'), p(2, 'v1', 'Vence 16/01/2027')]
    expect(anterioresEmAbertoEmTexto(todas[1]!, todas)).toBe('Adiantada: a 1/2 (vence 16/12/2026) segue em aberto.')
    expect(anterioresEmAbertoEmTexto(todas[0]!, todas)).toBeNull()
  })
  it('a parcela de outra venda não conta', () => {
    const todas = [p(1, 'v2', 'Vence 16/12/2026'), p(2, 'v1', 'Vence 16/01/2027')]
    expect(anterioresEmAbertoEmTexto(todas[1]!, todas)).toBeNull()
  })
  it('a janela de receber a parcela mostra o texto', () => {
    expect(ler('components/shared/pdv/parcelas-em-aberto.tsx')).toContain('anterioresEmAbertoEmTexto(')
  })
})

describe('A6: o botão do "Fechar de novo" diz "Fechar de novo"', () => {
  it('o rótulo segue o que se faz', () => {
    expect(rotuloDoBotaoDeFechar({ reabrindo: false, pendente: false })).toBe('Fechar o dia')
    expect(rotuloDoBotaoDeFechar({ reabrindo: true, pendente: false })).toBe('Fechar de novo')
    expect(rotuloDoBotaoDeFechar({ reabrindo: true, pendente: true })).toBe('Fechando…')
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('rotuloDoBotaoDeFechar({ reabrindo, pendente })')
  })
})

describe('A7: o estorno diz o que acontece com a comissão e a taxa', () => {
  it('a comissão liberada volta a aguardar; a taxa do cartão sai', () => {
    expect(sp(textoDaComissaoETaxaDoEstorno({ cartao: true, comissoes: [{ nome: 'Bianca', valor: 69.48 }], produto: false })))
      .toBe('A comissão de Bianca (R$ 69,48) volta a aguardar o pagamento. A taxa da maquininha deste pagamento sai da conta.')
  })
  it('a venda de produto: a comissão sai junto', () => {
    expect(sp(textoDaComissaoETaxaDoEstorno({ cartao: false, comissoes: [{ nome: 'Ana', valor: 6 }, { nome: 'Bia', valor: 4 }], produto: true })))
      .toBe('A comissão de Ana (R$ 6,00) e Bia (R$ 4,00) sai junto.')
  })
  it('sem ver quanto cada um ganha, sem os valores', () => {
    expect(textoDaComissaoETaxaDoEstorno({ cartao: false, comissoes: 'OCULTA', produto: false }))
      .toBe('A comissão que este pagamento liberou volta a aguardar o pagamento.')
  })
  it('nada liberado e fora do cartão: nada a dizer', () => {
    expect(textoDaComissaoETaxaDoEstorno({ cartao: false, comissoes: [], produto: false })).toBeNull()
  })
  it('a janela do estorno pergunta ao servidor', () => {
    expect(ler('components/shared/confirmar-estorno.tsx')).toContain('comissaoETaxaDoEstorno(alvo.id)')
  })
})

describe('A8: o avulso de uma unidade sem ninguém que recebe diz que é a rede', () => {
  it('só quem é da rede recebe: a tela diz', () => {
    // PV-04 (catálogo de 24/11; o Heitor, 23/11: "cada passo pertence a UM módulo … PDV: receber" — "concordo").
    expect(textoDeQuemRecebe(['Fábio Tulipa'], { soDaRede: true }))
      .toBe('Ninguém desta unidade tem o PDV em Gerenciar; quem recebe, pela rede: Fábio Tulipa.')
    expect(textoDeQuemRecebe(['Sabrina Lima', 'Vítor Azaleia']))
      .toBe('Quem recebe é quem tem o PDV em Gerenciar: Sabrina Lima e Vítor Azaleia.')
  })
  it('a janela de finalizar também diz quem recebe', () => {
    const t = ler('components/branch/appointment-session.tsx')
    expect(t).toMatch(/textoDoPagamentoAoFinalizar\([^)]*\)\s*\+/)
  })
})

// Desde 2026-11-18 iniciar e concluir são do Atendimento em Gerenciar (o Heitor:
// "Só inicia e conclui atendimento quem tem gerenciar no atendimento").
describe('A9: quem não conclui lê que iniciar e concluir pedem o Atendimento em Gerenciar, e quem conclui', () => {
  it('o texto diz a permissão e os nomes', () => {
    expect(textoDeQuemConclui(['Fábio Tulipa', 'Dr. Marcos']))
      .toBe('Iniciar e concluir o atendimento é de quem tem o Atendimento em Gerenciar (Fábio Tulipa e Dr. Marcos).')
    expect(textoDeQuemConclui([])).toBe('Iniciar e concluir o atendimento é de quem tem o Atendimento em Gerenciar.')
  })
  it('nenhuma tela diz mais "Quem conclui é o profissional"', () => {
    for (const arquivo of ['components/branch/appointment-session.tsx', 'components/branch/appointment-sheet.tsx']) {
      const t = ler(arquivo)
      expect(t, arquivo).not.toContain('Quem conclui é o profissional')
      expect(t, arquivo).toContain('textoDeQuemConclui(')
    }
  })
  it('o "Sem plano, basta o Finalizar" não aparece a quem não finaliza', () => {
    expect(ler('components/branch/treatment-plan-editor.tsx')).toContain('quemFinaliza')
  })
})

describe('A10: "Completar o cadastro" é de quem edita os Clientes; os outros leem quem completa', () => {
  it('o texto diz a permissão e os nomes', () => {
    expect(textoDeQuemCompletaOCadastro(['Lúcia Dália']))
      .toBe('Quem tem os Clientes em Gerenciar completa o cadastro (Lúcia Dália).')
  })
  it('a tela de assinatura e a ficha só mostram o botão a quem edita', () => {
    expect(ler('components/shared/tela-de-assinatura.tsx')).toContain('podeCompletar')
    expect(ler('components/branch/client-profile.tsx')).toContain('textoDeQuemCompletaOCadastro(')
  })
})

describe('A11: a ficha não diz "Nenhum documento anexado" ao lado do documento a assinar', () => {
  it('é "Nenhum anexo"', () => {
    const t = ler('components/branch/client-documents-tab.tsx')
    expect(t).not.toContain('Nenhum documento anexado')
    expect(t).toContain('Nenhum anexo')
  })
  it('depois da venda do pacote, o aviso leva ao "Completar o cadastro"', () => {
    const t = ler('components/shared/vender-pacote.tsx')
    expect(t).toContain('data-completar-depois-da-venda')
  })
})

describe('A16: no avulso concluído aguardando o pagamento, "Aceitar plano" não é a ação principal', () => {
  it('o botão fica secundário', () => {
    const t = ler('components/branch/appointment-session.tsx')
    expect(t).toContain('const planoSecundario = isPackageSession || aguardaOPagamento')
  })
})

describe('A31: a ponte das Vendas cita o voucher e o desconto', () => {
  it('o texto da ponte', () => {
    const t = ler('components/admin/reports-bi-view.tsx')
    const ponte = t.slice(t.indexOf('data-ponte-vendas-caixa'), t.indexOf('</span>', t.indexOf('data-ponte-vendas-caixa')))
    expect(ponte).toContain('voucher')
    expect(ponte).toContain('desconto')
  })
})

describe('A32: a comanda diz que o produto não pontua', () => {
  it('a linha do produto, com a regra da rede', () => {
    const base = { nome: 'Protetor', quantidade: 1, vendido: false, estornadoEm: null, voltouAoEstoque: null }
    expect(situacaoDoItemDaComanda(base, true, true)).toBe('Produto · sai do estoque da unidade ao receber · não pontua')
    expect(situacaoDoItemDaComanda(base, true)).toBe('Produto · sai do estoque da unidade ao receber')
  })
})
