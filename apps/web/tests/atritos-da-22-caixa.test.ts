import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LancamentoDoExtrato, Fechamento } from '@/lib/comissoes/leitura'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * Os atritos da 22ª simulação (2026-11-17) do PDV, do caixa, do fechamento,
 * do financeiro, dos relatórios e da auditoria que se provam sem tela: o
 * texto, a conta pura e o que a tela e o banco passam a usar.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const migrationDa22 = () => {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(n => n.startsWith('202611226') && n.includes('pdv_atritos_da_22'))
  return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
}

// ── A7: o "+ Outra forma" aparece com o diálogo ──────────────────────────────
describe('A7: o "+ Outra forma" não espera a primeira forma', () => {
  it('no "Receber" do a receber e da parcela', () => {
    expect(ler('components/shared/receber-no-cartao.tsx')).not.toMatch(/\{forma && \(\s*<OutrasFormas/)
    expect(ler('components/shared/pdv/parcelas-em-aberto.tsx')).not.toMatch(/\{forma && \(\s*<OutrasFormas/)
  })
  it('na comanda, na Nova venda e no plano (o PDV)', () => {
    expect(ler('components/shared/campos-do-pagamento.tsx')).not.toMatch(/!!estado\.metodo && total !== undefined && total > 0 && \(\s*<OutrasFormas/)
    expect(ler('components/branch/checkout-wizard.tsx')).not.toMatch(/!!paymentMethod && fid\.aPagar > 0 && \(\s*<div[^>]*>\s*<OutrasFormas/)
  })
})

// ── A8: a aba diz o que a venda no crediário é ──────────────────────────────
describe('A8: a aba das comandas de hoje é "Fechadas hoje"', () => {
  it('a venda no crediário nasce fechada (PDV8), não paga', async () => {
    const { SITUACOES_DO_PDV, recebidaAgoraEmTexto } = await import('@/lib/pdv/situacoes')
    expect(SITUACOES_DO_PDV.map(s => s.label)).toEqual(['Abertas', 'Fechadas hoje', 'Todas'])
    const c = { paga: true, recebido: 180, formas: [{ forma: 'PIX', vezes: 1, valor: 180 }], forma: 'PIX' } as never
    expect(sp(recebidaAgoraEmTexto(c)!)).toBe('Recebido R$ 180,00 (Pix). A comanda saiu das abertas e está em “Fechadas hoje”.')
  })
})

// ── A9: o "A receber da cliente" diz que é o que vence no período ──────────
describe('A9: o rótulo do A receber diz "vence no período"', () => {
  it('as duas telas do Financeiro usam o rótulo', async () => {
    const { ROTULO_DO_A_RECEBER_DA_CLIENTE } = await import('@/lib/financeiro/abas')
    // A17 da 23ª: o número grande passou a ser o em aberto, e o rótulo diz.
    // O Heitor, 25/11: "O cartão vira 'A receber · em aberto' e soma tudo" (o número leva o sem cliente).
    expect(ROTULO_DO_A_RECEBER_DA_CLIENTE).toBe('A receber · em aberto')
    expect(ler('components/admin/admin-financial-view.tsx')).toContain('label={ROTULO_DO_A_RECEBER_DA_CLIENTE}')
    expect(ler('components/branch/financial-hub.tsx')).toContain('label={ROTULO_DO_A_RECEBER_DA_CLIENTE}')
  })
})

// ── A10: a conta do resultado cita o produto vendido a receber ──────────────
describe('A10: o custo do produto entra na venda, mesmo a receber', () => {
  it('a conta do resultado e a definição dizem', async () => {
    expect(ler('components/shared/conta-do-resultado.tsx')).toContain('o custo do produto quando ele é vendido, mesmo a receber')
    const { DEFINICOES } = await import('@/lib/metrics/definicoes')
    expect(DEFINICOES.insumosEProdutos.texto).toContain('no dia da venda, mesmo a receber')
  })
})

// ── A11: a comanda estornada diz as formas que tinha ────────────────────────
describe('A11: a comanda da venda estornada mantém as formas', () => {
  it('pdv_comandas lê as formas dos lançamentos estornados quando a venda foi estornada inteira', () => {
    const sql = migrationDa22()
    expect(sql).toContain("(coalesce(t.notes, '''') <> ''Estornada'' or coalesce(s.v_estornada, false))")
  })
  it('com as formas, o texto diz as duas', async () => {
    const { formasDaComandaEmTexto } = await import('@/lib/pdv/situacoes')
    const c = { forma: 'PIX', formas: [{ forma: 'PIX', vezes: 1, valor: 200 }, { forma: 'CASH', vezes: 1, valor: 160 }] } as never
    expect(sp(formasDaComandaEmTexto(c))).toBe('Pix R$ 200,00 + Dinheiro R$ 160,00')
  })
})

// ── A12: "Fechar de novo" não mostra o "Bateu" de antes ────────────────────
describe('A12: conferindo de novo, a diferença é só a do que se digita', () => {
  const linha = {
    forma: 'PIX', entradas: 160, saidas: 0, registrado: 160, conferivel: true, conferido: 160, diferenca: 0,
    mudouDepois: false, registradoNoFechamento: 160,
  }
  it('campo em branco: "não conferido", nunca o "Bateu" do fechamento de antes', async () => {
    const { diferencaNaTela } = await import('@/lib/financeiro/conferencia-do-fechamento')
    expect(diferencaNaTela(linha, { conferindo: true, texto: '', fechado: true })).toEqual({ tipo: 'nao-conferido' })
    expect(diferencaNaTela({ ...linha, forma: 'CASH' }, { conferindo: true, texto: '', fechado: true })).toEqual({ tipo: 'nada' })
  })
  it('digitado, a conta do que se digita; fora da conferência, a do fechamento', async () => {
    const { diferencaNaTela } = await import('@/lib/financeiro/conferencia-do-fechamento')
    expect(diferencaNaTela(linha, { conferindo: true, texto: '150', fechado: true })).toEqual({ tipo: 'valor', valor: -10 })
    expect(diferencaNaTela(linha, { conferindo: false, texto: '', fechado: true })).toEqual({ tipo: 'valor', valor: 0 })
    expect(diferencaNaTela({ ...linha, mudouDepois: true }, { conferindo: false, texto: '', fechado: true })).toEqual({ tipo: 'a-conferir' })
  })
  it('a tela desenha por ela', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('diferencaNaTela(')
  })
})

// ── A13: a quantidade do produto na comanda se muda ─────────────────────────
describe('A13: o produto da comanda tem + e −', () => {
  it('a função do banco tira UM, e a action e a tela a usam', () => {
    expect(migrationDa22()).toContain('create or replace function public.comanda_tirar_um_item(')
    expect(ler('actions/pdv.ts')).toContain("export async function tirarUmProdutoDaComanda(")
    const tela = ler('components/shared/pdv/produtos-da-comanda.tsx')
    expect(tela).toContain('tirarUmProdutoDaComanda(')
    expect(tela).toContain('data-mais-um')
    expect(tela).toContain('data-menos-um')
  })
})

// ── A14: a linha do pagamento não corta o valor ─────────────────────────────
describe('A14: a linha do pagamento da comanda quebra em vez de cortar', () => {
  it('sem o nowrap com reticências, e o valor numa peça própria', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    const trecho = tela.slice(tela.indexOf('data-pagamento-da-comanda'), tela.indexOf('data-pagamento-da-comanda') + 1200)
    expect(trecho).not.toContain("textOverflow: 'ellipsis'")
    expect(trecho).toContain('data-valor-do-pagamento')
  })
})

// ── A15: o PDV da rede diz a comanda aberta na outra unidade ────────────────
describe('A15: as abertas nas outras unidades', () => {
  it('"1 comanda aberta em Alecrim Renascença"', async () => {
    const { abertasNasOutrasEmTexto } = await import('@/lib/pdv/situacoes')
    expect(abertasNasOutrasEmTexto([
      { id: 'b1', nome: 'Alecrim Renascença', abertas: 1 },
      { id: 'b2', nome: 'Alecrim Centro', abertas: 0 },
      { id: 'b3', nome: 'Alecrim Calhau', abertas: 3 },
    ])).toEqual([
      { id: 'b1', texto: '1 comanda aberta em Alecrim Renascença' },
      { id: 'b3', texto: '3 comandas abertas em Alecrim Calhau' },
    ])
  })
  it('o PDV conta as abertas das outras e a tela as mostra com o link', () => {
    expect(ler('app/_shared/pdv.tsx')).toContain('abertasNasOutras')
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('data-abertas-nas-outras')
  })
})

// ── A16: a coluna das taxas diz "Maquininha ou forma" ──────────────────────
describe('A16: o CSV do fechamento — a linha do Pix sob "Maquininha ou forma"', () => {
  it('o cabeçalho da seção das taxas', async () => {
    const { csvDoFechamento } = await import('@/lib/financeiro/csv-da-contadora')
    const linhas = csvDoFechamento({
      dia: '2026-11-17', unidade: 'Cohama', formas: [], total: { entradas: 0, saidas: 0, saldo: 0, lancamentos: 0 },
      esperadoDinheiro: 0, estornos: [], taxasPorMaquininha: [{ maquininha: 'Pix', bruto: 170, taxa: 0, liquido: 170 }],
    }).replace(/^﻿/, '').split('\r\n')
    expect(linhas).toContain('Maquininha ou forma;Bruto;Taxa;Líquido')
  })
})

// ── A17: o CSV das comissões — o estorno e o pagamento estornado ────────────
describe('A17: o CSV das comissões', () => {
  const base = {
    id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-17T19:47:00Z', kind: 'LIBERACAO', motivo: null, amount: 65.62,
    status: 'PAID', payoutId: 'po1', appointmentId: 'a1', scheduledAt: '2026-11-17T19:00:00Z', cliente: 'Camila', procedimento: 'Drenagem',
    origem: 'AVULSO', preco: 170, regraTipo: 'PERCENTAGE', regraValor: 40, pacote: null, descontaTaxa: true, descontaInsumos: false,
    previsto: null, baseComPontos: 'PRECO', plano: null, base: 164.05, baseDesconto: 0, baseTaxa: 5.95, baseInsumos: 0, baseFator: 1,
    pagoEm: '2026-11-17T20:01:00Z', regraDe: 'CLINICA', transacaoId: 't1',
  } as LancamentoDoExtrato
  const campos = (linha: string) => [...linha.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map(m => m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1)
  it('a linha do estorno não diz "Paga": diz que foi descontada', async () => {
    const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
    const linhas = [base, { ...base, id: 'l2', kind: 'ESTORNO' as const, amount: -65.62, releasedAt: '2026-11-17T19:59:00Z' }]
    const l = csvDoExtrato(linhas, new Map([['p1', 'Priscila']]), new Map([['b1', 'Cohama']])).slice(1).split('\r\n')
    const iSit = campos(l[0]!).indexOf('Situação')
    expect(campos(l[1]!)[iSit]).toBe('Paga')
    expect(campos(l[2]!)[iSit]).toBe('Descontada no pagamento')
    const aberto = csvDoExtrato([{ ...linhas[1]!, status: 'OPEN', pagoEm: null }], new Map(), new Map()).slice(1).split('\r\n')
    expect(campos(aberto[1]!)[iSit]).toBe('A descontar')
  })
  it('os pagamentos das comissões vão ao CSV, com o estornado', async () => {
    const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
    const fechamentos: Fechamento[] = [
      { id: 'po2', professionalName: 'Júlia', branchName: 'Renascença', inicio: '2026-11-17T03:00:00Z', fim: '2026-11-17T20:02:00Z', total: 45, paidAt: '2026-11-17T20:03:00Z', estornadoAt: null, estornoMotivo: null },
      { id: 'po1', professionalName: 'Júlia', branchName: 'Renascença', inicio: '2026-11-17T03:00:00Z', fim: '2026-11-17T20:00:00Z', total: 45, paidAt: '2026-11-17T20:01:00Z', estornadoAt: '2026-11-17T20:02:00Z', estornoMotivo: 'Pix errado' },
    ]
    const csv = sp(csvDoExtrato([base], new Map([['p1', 'Priscila']]), new Map([['b1', 'Cohama']]), undefined, fechamentos))
    const l = csv.slice(1).split('\r\n')
    expect(l).toContain('Pagamentos das comissões')
    expect(l).toContain('Profissional;Unidade;Pago em;Valor;Situação')
    expect(l).toContain('Júlia;Renascença;17/11/2026 17:01;45,00;Estornado em 17/11/2026 17:02 — Pix errado')
    expect(l).toContain('Júlia;Renascença;17/11/2026 17:03;45,00;Pago')
  })
})

// ── A31: a venda avulsa de procedimento pelo nome dele ──────────────────────
describe('A31: "Massagem relaxante — 1 sessão", não "Procedimento pré-pago — 1×"', () => {
  it('a descrição do lançamento da venda', () => {
    const sql = migrationDa22()
    expect(sql).toContain("v_proc.name || '' — '' || p_quantidade || case when p_quantidade = 1 then '' sessão'' else '' sessões'' end")
  })
  it('a Nova venda fala em sessões', () => {
    const tela = ler('components/shared/vender.tsx')
    expect(tela).toContain('as sessões ficam na ficha para agendar')
    expect(tela).not.toContain('as unidades ficam na ficha para agendar')
  })
})

// ── A36: a receita dos atendimentos é líquida do voucher ────────────────────
describe('A36: o Preenchimento por R$ 1.500 nas Vendas e R$ 1.462,96 nos Procedimentos', () => {
  it('a dica diz que a receita dos atendimentos é líquida do voucher e dos pontos', async () => {
    const { DEFINICOES } = await import('@/lib/metrics/definicoes')
    expect(DEFINICOES.receitaDosAtendimentos.texto).toContain('líquido do voucher e dos pontos')
    expect(DEFINICOES.receitaDosAtendimentos.texto).toContain('Total vendido')
  })
})

// ── A37: o consumo do relatório diz que é sem a venda de produto ────────────
describe('A37: o Consumo no Período do relatório de Estoque', () => {
  it('leva o mesmo detalhe da tela de Estoque', () => {
    expect(ler('components/admin/reports-bi-view.tsx')).toMatch(/label="Consumo no Período"[^\n]*detalhe=\{DETALHE_DO_GIRO\}/)
  })
})

// ── A38: a Auditoria diz as vezes e o crediário ─────────────────────────────
describe('A38: a Auditoria', () => {
  let id = 5000
  const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
    id: id--, criado_em: '2026-11-17T19:30:00.000Z', branch_id: 'bG', client_id: 'cR', tabela: 'financial_transactions', operacao: 'criou',
    registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Rafael', ator_tipo: 'membro',
    incompleto: false, ...x,
  })
  const nomes: NomesDaAuditoria = {
    clientes: { cR: 'Rosa' }, membros: {}, unidades: { bG: 'Girassol Fátima' }, pacotes: { sp1: '5 drenagens' },
    lancamentos: {
      e1: { tipo: 'INCOME', valor: 150, forma: 'PIX', parcela: null, de: null, vezes: null },
      p1: { tipo: 'INCOME', valor: 166.66, forma: null, parcela: 1, de: 3, vezes: null },
      p2: { tipo: 'INCOME', valor: 166.66, forma: null, parcela: 2, de: 3, vezes: null },
      p3: { tipo: 'INCOME', valor: 166.68, forma: null, parcela: 3, de: 3, vezes: null },
      c8: { tipo: 'INCOME', valor: 1462.96, forma: 'CREDIT_CARD', parcela: null, de: null, vezes: 8 },
      c9: { tipo: 'INCOME', valor: 117.04, forma: 'CREDIT_CARD', parcela: null, de: null, vezes: 8 },
    },
  }
  it('o pacote no crediário diz a entrada e as parcelas', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'client_packages', registro_id: 'cp1', depois: { package_id: 'sp1', price: 650 } }),
      r({ registro_id: 'e1', depois: { type: 'INCOME', amount: 150, paid_at: '2026-11-17T19:30:00Z', payment_method: 'PIX', category: 'Pacotes' } }),
      r({ registro_id: 'p1', depois: { type: 'INCOME', amount: 166.66, paid_at: null, category: 'Pacotes' } }),
      r({ registro_id: 'p2', depois: { type: 'INCOME', amount: 166.66, paid_at: null, category: 'Pacotes' } }),
      r({ registro_id: 'p3', depois: { type: 'INCOME', amount: 166.68, paid_at: null, category: 'Pacotes' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes)))
      .toBe('Vendeu o pacote 5 drenagens (R$ 650,00), no crediário: entrada de R$ 150,00 (Pix) e 3 parcelas (R$ 500,00) — Rosa')
  })
  it('o recebimento no crédito diz as vezes', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      // A comanda do Preenchimento com o Protetor: o atendimento e o produto, no 8x.
      r({ registro_id: 'c8', depois: { type: 'INCOME', amount: 1462.96, paid_at: '2026-11-17T20:00:00Z', payment_method: 'CREDIT_CARD', category: 'Serviços' } }),
      r({ registro_id: 'c9', depois: { type: 'INCOME', amount: 117.04, paid_at: '2026-11-17T20:00:00Z', payment_method: 'CREDIT_CARD', category: 'Venda de produto' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 1.580,00 (Crédito 8x) — Rosa')
  })
  it('a leitura lê também os lançamentos CRIADOS, com as vezes', () => {
    const leitura = ler('lib/auditoria/leitura.ts')
    expect(leitura).toContain('cartao_vezes')
    expect(leitura).not.toMatch(/r\.tabela === 'financial_transactions' && r\.operacao === 'editou'\s*\n?\s*&& r\.registro_id/)
  })
})
