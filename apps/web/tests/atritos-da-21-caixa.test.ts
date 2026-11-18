import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'
import { linhasDaConferencia, fechamentoGravadoDaLinha, avisoDaGavetaNegativa } from '@/lib/financeiro/conferencia-do-fechamento'
import { csvDosLancamentos, linhaDoLancamento } from '@/lib/financeiro/csv-dos-lancamentos'
import { csvDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'
import { textoDaSessaoDoPacote, comOEmAberto } from '@/lib/appointments/sessao-do-pacote'
import { linhaDaComanda } from '@/lib/pdv/linha-da-comanda'
import { recusaDasFormasDaBaixa, partesDaBaixa } from '@/lib/financeiro/baixa-em-formas'
import { rotuloDoDiaNoPdv, textoDasComValorEmAberto, contarComValorEmAberto, type ComandaDoPdv } from '@/lib/pdv/situacoes'

/**
 * Os defeitos e atritos da 21ª simulação (2026-11-17) do PDV, do caixa, do
 * fechamento e das comissões que se provam sem tela: o texto, a conta pura e
 * o que a tela e o servidor passam a usar.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null

// ── D2: o CSV do fechamento usa a régua da tela ──────────────────────────────
describe('D2: o CSV do fechamento diz "a conferir" quando o dia mudou depois do fechamento', () => {
  // A Pajuçara fechou às 13:55 com Pix 160 e "Bateu"; às 13:56 saiu a comissão em Pix (R$ 64).
  const ultimo = () => fechamentoGravadoDaLinha({
    contado_dinheiro: 0, diferenca: 0, esperado_dinheiro: 0, conferido: { PIX: 160 },
    resumo: [{ forma: 'PIX', entradas: 160, saidas: 0, saldo: 160 }],
  })
  const conferencia = () => linhasDaConferencia({
    formas: [{ forma: 'PIX', entradas: 160, saidas: 64, saldo: 96 }], esperadoDinheiro: 0, ultimo: ultimo(),
  })
  const base = {
    dia: '2026-11-17', unidade: 'Lavanda Pajuçara',
    formas: [{ forma: 'PIX', entradas: 160, saidas: 64, saldo: 96, lancamentos: 2 }],
    total: { entradas: 160, saidas: 64, saldo: 96, lancamentos: 2 }, esperadoDinheiro: 0, estornos: [],
    fechado: { quem: 'Renato', quando: '2026-11-17T16:55:00Z', diferenca: 0 },
  }
  it('a situação do dia não diz "Bateu"', () => {
    const csv = csvDoFechamento({ ...base, conferencia: conferencia() })
    expect(csv).toContain('Situação do dia;Fechado por Renato em 17/11/2026 às 13:55;a conferir · mudou depois do fechamento')
    expect(csv).not.toMatch(/Situação do dia;[^\r\n]*Bateu/)
    expect(csv).not.toMatch(/Pix;[^\r\n]*Bateu/)
  })
  it('a linha da forma diz o registrado de agora, o conferido e "a conferir"', () => {
    const csv = csvDoFechamento({ ...base, conferencia: conferencia() })
    expect(csv).toContain('Forma;Registrado;Conferido;Diferença')
    expect(csv).toContain('Pix;96,00;160,00;a conferir · mudou depois do fechamento')
  })
  it('sem movimento depois, a conferência diz o que bateu', () => {
    const igual = linhasDaConferencia({ formas: [{ forma: 'PIX', entradas: 160, saidas: 0, saldo: 160 }], esperadoDinheiro: 0, ultimo: ultimo() })
    const csv = csvDoFechamento({ ...base, conferencia: igual })
    expect(csv).toContain('Situação do dia;Fechado por Renato em 17/11/2026 às 13:55;Bateu')
    expect(csv).toContain('Pix;160,00;160,00;Bateu')
    expect(csv).toContain('Dinheiro;0,00;0,00;Bateu')
  })
  it('a action monta a conferência como a tela', () => {
    const acao = ler('actions/fechamento.ts')
    expect(acao).toContain('linhasDaConferencia(')
    expect(acao).toContain('fechamentoGravadoDaLinha(')
  })
})

// ── D3 e A5: a comanda diz a quantidade (e o plano, as sessões) ──────────────
describe('D3/A5: a linha da comanda diz a quantidade vendida', () => {
  it('a venda de 2 Sérum: "2" e "2 × R$ 150,00"', () => {
    const l = linhaDaComanda({ tipo: 'PRODUTO', quantidade: 2, precoUnitario: 150, total: 300, itens: 1 })
    expect({ ...l, detalhe: sp(l.detalhe) }).toEqual({ quantidade: 2, detalhe: '2 × R$ 150,00' })
  })
  it('com desconto, o unitário (o desconto vai numa linha própria da comanda — A15 da 24ª)', () => {
    const l = linhaDaComanda({ tipo: 'PRODUTO', quantidade: 2, precoUnitario: 98, total: 184.44, itens: 1 })
    expect(sp(l.detalhe)).toBe('2 × R$ 98,00')
    expect(l.desconto).toBe(11.56)
  })
  it('o kit de vários produtos é uma linha (a descrição já os lista)', () => {
    expect(linhaDaComanda({ tipo: 'PRODUTO', quantidade: 1, precoUnitario: null, total: 300, itens: 3 }))
      .toEqual({ quantidade: 1, detalhe: null })
  })
  it('o pré-pago: as unidades vendidas', () => {
    expect(sp(linhaDaComanda({ tipo: 'PRE_PAGO', quantidade: 3, precoUnitario: 150, total: 450 }).detalhe)).toBe('3 × R$ 150,00')
    expect(linhaDaComanda({ tipo: 'PRE_PAGO', quantidade: 3, precoUnitario: 150, total: 450 }).quantidade).toBe(3)
  })
  it('o plano: as sessões e o que há nelas', () => {
    expect(linhaDaComanda({ tipo: 'PLANO', sessoes: [{ procedimentos: ['Limpeza'] }, { procedimentos: ['Limpeza'] }, { procedimentos: ['Limpeza'] }] }))
      .toEqual({ quantidade: 3, detalhe: '3 sessões: 3 × Limpeza' })
    expect(linhaDaComanda({ tipo: 'PLANO', sessoes: [{ procedimentos: ['Limpeza'] }, { procedimentos: ['Peeling', 'Limpeza'] }] }).detalhe)
      .toBe('2 sessões: 2 × Limpeza, 1 × Peeling')
    expect(linhaDaComanda({ tipo: 'PLANO', sessoes: [{ procedimentos: ['Toxina'] }] }).detalhe).toBe('1 sessão: 1 × Toxina')
  })
  it('o atendimento, o pacote e o crédito são um', () => {
    expect(linhaDaComanda(null)).toEqual({ quantidade: 1, detalhe: null })
  })
  it('a tela não escreve mais o "1" fixo', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).not.toMatch(/fontWeight: 600 \}\}>1<\/span>/)
    expect(tela).toContain('e.linha')
    expect(ler('app/_shared/pdv.tsx')).toContain('linhaDaComandaDoPdv(')
  })
})

describe('A5: o contrato do plano tem o mesmo nome no modelo e no documento', () => {
  it('a rede nova nasce com o título do texto igual ao nome do modelo', () => {
    const arquivo = readdirSync(join(RAIZ, 'supabase', 'migrations')).filter(f => f.startsWith('2026112220')).sort()
      .map(f => readFileSync(join(RAIZ, 'supabase', 'migrations', f), 'utf8'))
      .find(t => t.includes('function public.documentos_modelos_padrao'))
    expect(arquivo).toBeDefined()
    expect(arquivo).toContain("'Contrato de prestação de serviços', 'CONTRATO_PLANO'")
    expect(arquivo).toContain("E'# Contrato de prestação de serviços\\n\\n'")
    expect(arquivo).not.toContain('# Contrato de prestação de serviços estéticos')
  })
})

// ── D4: a sessão do pacote no crediário não é "paga" ─────────────────────────
describe('D4: a sessão do pacote com parcelas em aberto é "incluída", não "paga"', () => {
  it('na tela do atendimento, o em aberto do pacote (o valor só a quem recebe)', () => {
    expect(sp(textoDaSessaoDoPacote({ numero: 1, total: 4, nome: '4 limpezas', deFora: false, emAberto: 600, mostraOValor: true })))
      .toBe('Sessão 1 de 4 do pacote 4 limpezas: incluída no pacote, que tem R$ 600,00 em aberto.')
    expect(textoDaSessaoDoPacote({ numero: 1, total: 4, nome: '4 limpezas', deFora: false, emAberto: 600, mostraOValor: false }))
      .toBe('Sessão 1 de 4 do pacote 4 limpezas: incluída no pacote, que tem parcelas em aberto.')
  })
  it('sem nada em aberto, segue "já paga"', () => {
    expect(textoDaSessaoDoPacote({ numero: 1, total: 4, nome: '4 limpezas', deFora: false, emAberto: 0, mostraOValor: true }))
      .toBe('Sessão 1 de 4 do pacote 4 limpezas, já paga.')
  })
  it('na agenda e no app, o em aberto vai junto do "sessão 2 de 4"', () => {
    expect(sp(comOEmAberto('4 limpezas · sessão 2 de 4', 600, true))).toBe('4 limpezas · sessão 2 de 4 · R$ 600,00 em aberto')
    expect(comOEmAberto('4 limpezas · sessão 2 de 4', 600, false)).toBe('4 limpezas · sessão 2 de 4 · com parcelas em aberto')
    expect(comOEmAberto('Pré-pago · 1 de 2', 0, true)).toBe('Pré-pago · 1 de 2')
  })
  it('a agenda não diz "Já pago" no que está incluído', () => {
    expect(ler('components/branch/appointment-sheet.tsx')).not.toContain('>Já pago<')
    expect(ler('lib/appointments/pago-antes.ts')).toContain('getEmAbertoDasVendas(')
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toContain('getEmAbertoDosPacotes(')
  })
})

// ── A1: "+ Outra forma" no Receber do a receber e da parcela ────────────────
describe('A1: o Receber do a receber e da parcela divide em formas', () => {
  it('as partes fecham o valor', () => {
    expect(recusaDasFormasDaBaixa([{ forma: 'PIX', valor: 400 }, { forma: 'CREDIT_CARD', valor: 200, vezes: 2 }], 600)).toBeNull()
  })
  it('a soma que não fecha é recusada, com os valores', () => {
    expect(sp(recusaDasFormasDaBaixa([{ forma: 'PIX', valor: 300 }, { forma: 'CASH', valor: 200 }], 600)))
      .toBe('As formas somam R$ 500,00 e não fecham o valor de R$ 600,00.')
  })
  it('forma sem valor, forma desconhecida e mais de cinco', () => {
    expect(recusaDasFormasDaBaixa([{ forma: 'PIX', valor: 600 }, { forma: 'CASH', valor: 0 }], 600)).toBe('Digite o valor de cada forma (acima de zero).')
    expect(recusaDasFormasDaBaixa([{ forma: 'PIX', valor: 300 }, { forma: 'BOLETO', valor: 300 }], 600)).toBe('Escolha a forma de cada parte.')
    expect(recusaDasFormasDaBaixa(Array.from({ length: 6 }, () => ({ forma: 'PIX', valor: 100 })), 600)).toBe('Divida em até 5 formas.')
    expect(recusaDasFormasDaBaixa([{ forma: 'PIX', valor: 300 }, { forma: 'CASH', valor: 300, vezes: 3 }], 600))
      .toBe('As vezes no cartão são só no crédito (o débito é 1x).')
  })
  it('a primeira forma fica com o que falta das outras', () => {
    const partes = partesDaBaixa({ forma: 'CREDIT_CARD', bandeira: 'VISA', vezes: 3, maquininha: null }, 600,
      [{ metodo: 'PIX', valor: '250,00', vezes: 1, bandeira: '', maquininha: '' }])
    expect(partes).toEqual([
      { forma: 'CREDIT_CARD', valor: 350, bandeira: 'VISA', vezes: 3, maquininha: null },
      { forma: 'PIX', valor: 250, bandeira: null, vezes: 1, maquininha: null },
    ])
  })
  it('a janela da parcela e a do "Receber" têm o "+ Outra forma", e as actions gravam por forma', () => {
    expect(ler('components/shared/pdv/parcelas-em-aberto.tsx')).toContain('<OutrasFormas')
    expect(ler('components/shared/receber-no-cartao.tsx')).toContain('<OutrasFormas')
    expect(ler('actions/pdv.ts')).toContain('marcarPagoEmFormasCore(')
    expect(ler('actions/financial.ts')).toContain('marcarPagoEmFormasCore(')
    expect(ler('lib/financeiro/lancamento.ts')).toContain("rpc('lancamento_receber_em_formas'")
  })
  it('a migration grava numa transação, fechada a quem não é o servidor', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '20261122200001_lancamento_receber_em_formas.sql'), 'utf8')
    expect(sql).toContain('create or replace function public.lancamento_receber_em_formas(')
    expect(sql).toMatch(/revoke execute on function public\.lancamento_receber_em_formas\([^)]*\) from public, anon, authenticated/)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

// ── A2 e A10: o topo do PDV ─────────────────────────────────────────────────
const comanda = (c: Partial<ComandaDoPdv> = {}): ComandaDoPdv => ({
  id: 'c1', numero: 2, origem: 'VENDA', abertaEm: '2026-11-17T14:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl1', cliente: 'Marta', agendamentoId: null, procedimento: '4 limpezas', profissional: 'Diego',
  agendadoPara: null, atendimento: null, valor: 720, paga: true, pagaEm: '2026-11-17T14:00:00Z', recebido: 120,
  forma: 'PIX', estornada: false, planoId: null, emAberto: 600, parcelasEmAberto: 5, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...c,
})
describe('A2: o topo cita as comandas de hoje com valor a receber', () => {
  it('conta só as pagas e vivas com valor em aberto', () => {
    expect(contarComValorEmAberto([comanda(), comanda({ id: 'c2', emAberto: 0 }), comanda({ id: 'c3', estornada: true }), comanda({ id: 'c4', paga: false })])).toBe(1)
  })
  it('o texto', () => {
    expect(textoDasComValorEmAberto(1)).toBe('1 venda com parcelas a receber') // A12 da 23ª: o texto mudou
    expect(textoDasComValorEmAberto(3)).toBe('3 vendas com parcelas a receber')
    expect(textoDasComValorEmAberto(0)).toBeNull()
  })
  it('o topo do PDV mostra', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('textoDasComValorEmAberto(')
  })
})
describe('A10: no PDV da rede, o "Hoje" diz de qual unidade', () => {
  it('o rótulo', () => {
    expect(rotuloDoDiaNoPdv('Lavanda Pajuçara')).toBe('Hoje em Lavanda Pajuçara')
    expect(rotuloDoDiaNoPdv(null)).toBe('Hoje')
  })
  it('o topo usa o rótulo', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('rotuloDoDiaNoPdv(')
  })
})

// ── A3: a parcela adiantada avisa também na ficha ────────────────────────────
describe('A3: o "Receber" da ficha avisa a parcela adiantada', () => {
  it('a ficha manda o aviso e a janela o mostra', () => {
    expect(ler('lib/clientes/financeiro-da-ficha.ts')).toContain('anterioresEmAbertoEmTexto(')
    expect(ler('components/shared/receber-no-cartao.tsx')).toContain('data-parcela-adiantada')
    expect(ler('components/shared/acoes-do-lancamento-da-ficha.tsx')).toContain('adiantada={')
  })
})

// ── A4: o texto da gaveta negativa ──────────────────────────────────────────
describe('A4: a saída maior que a entrada em dinheiro pede a conferência, sem "não fica negativa"', () => {
  it('o texto', () => {
    expect(sp(avisoDaGavetaNegativa(-60)))
      .toBe('Saiu R$ 60,00 a mais do que entrou em dinheiro: confira a saída em dinheiro, ou informe o fundo de troco.')
    expect(avisoDaGavetaNegativa(-60)).not.toContain('não fica negativa')
  })
})

// ── A6: o CSV das movimentações diz o que foi pago com pontos ou voucher ────
describe('A6: a coluna "Pago com pontos/voucher"', () => {
  it('o cabeçalho e o valor', () => {
    const csv = csvDosLancamentos([
      { data: '2026-11-17T15:00:00Z', descricao: 'Crédito na clínica', cliente: 'Bruna', categoria: 'Crédito', tipo: 'INCOME',
        forma: 'CREDIT_CARD', vezes: 8, situacao: 'PAGO', valor: 1920, pontosOuVoucher: 30 },
    ])
    const l = csv.slice(1).split('\r\n')
    expect(l[0]).toContain(';Desconto;Pago com pontos/voucher;Taxa da maquininha;')
    expect(l[1]).toContain(';1920,00;Sim;;30,00;')
  })
  it('vem do loyalty_discount do lançamento', () => {
    const linha = linhaDoLancamento({ created_at: '2026-11-17T15:00:00Z', description: 'x', category: null, type: 'INCOME', payment_method: 'PIX',
      is_paid: true, notes: null, amount: 1920, loyalty_discount: '30.00' })
    expect(linha.pontosOuVoucher).toBe(30)
  })
})

// ── A8: o CSV de comissões leva a ligação e vem na ordem do tempo ───────────
describe('A8: o CSV de comissões', () => {
  const base: LancamentoDoExtrato = {
    id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-17T16:45:00Z', kind: 'LIBERACAO', motivo: null, amount: 64,
    status: 'OPEN', payoutId: null, appointmentId: 'a1', scheduledAt: '2026-11-17T16:00:00Z', cliente: 'Bruna', procedimento: 'Limpeza',
    origem: 'AVULSO', preco: 160, regraTipo: 'PERCENTAGE', regraValor: 40, pacote: null, descontaTaxa: false, descontaInsumos: false,
    previsto: null, baseComPontos: 'PRECO', plano: null, base: 160, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
    regraDe: 'CLINICA', transacaoId: 't1',
  } as LancamentoDoExtrato
  const linhas = [
    { ...base, id: 'l3', releasedAt: '2026-11-17T17:00:00Z', transacaoId: 't2' },
    { ...base, id: 'l2', kind: 'ESTORNO' as const, amount: -64, releasedAt: '2026-11-17T16:53:00Z', motivo: 'Forma errada' },
    base,
  ] as LancamentoDoExtrato[]
  const campos = (linha: string) => [...linha.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map(m => m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1)
  it('as linhas na ordem do tempo, com a hora', () => {
    const l = csvDoExtrato(linhas, new Map([['p1', 'Tânia']]), new Map([['b1', 'Pajuçara']])).slice(1).split('\r\n')
    const cab = campos(l[0]!)
    const iHora = cab.indexOf('Hora')
    expect(iHora).toBe(1)
    expect([1, 2, 3].map(i => campos(l[i]!)[iHora])).toEqual(['13:45', '13:53', '14:00'])
  })
  it('o estorno diz o que desfaz, e a liberação seguinte diz que é de novo', () => {
    const l = csvDoExtrato(linhas, new Map([['p1', 'Tânia']]), new Map([['b1', 'Pajuçara']])).slice(1).split('\r\n')
    const iLig = campos(l[0]!).indexOf('Ligação')
    expect(iLig).toBeGreaterThan(0)
    expect(campos(l[1]!)[iLig]).toBe('')
    expect(campos(l[2]!)[iLig]).toBe('desfaz a liberação das 13:45')
    expect(campos(l[3]!)[iLig]).toBe('de novo, depois do estorno das 13:53')
  })
})

// ── A9: a janela do CSV do fechamento tem margem ────────────────────────────
describe('A9: a janela "CSV do fechamento do dia" tem margem interna', () => {
  it('o formulário com o respiro do cartão', () => {
    expect(ler('components/shared/caixa-no-financeiro.tsx')).toMatch(/<form onSubmit=\{baixar\} style=\{\{ padding: 'var\(--card-pad\)'/)
  })
})
