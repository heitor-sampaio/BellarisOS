import { rotuloDaForma, rotuloDaFormaDoFechamento, nomeDaBandeira } from '@/lib/financeiro/formas'

/**
 * O DRE e o Fechamento do dia em CSV (A31 da 10ª simulação, 2026-11-10: a
 * contadora não fechava o mês com o que exportava — só havia o CSV de
 * lançamentos e o de comissões). Os números chegam PRONTOS (lib/metrics): aqui
 * só se escreve, como o CSV de lançamentos — ponto e vírgula, BOM, vírgula nos
 * centavos (o Excel em pt-BR). Puro: roda no navegador.
 */

function campo(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
const reais = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',')
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false })
const dia = (iso: string, fuso = 'America/Sao_Paulo') => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
const csv = (linhas: string[][]) => '﻿' + linhas.map(l => l.map(campo).join(';')).join('\r\n')

export interface DreParaCsv {
  periodo:            string
  receita:            number
  despesaOperacional: number
  insumos:            number
  taxas:              number
  comissoes:          number
  lucro:              number
  /** Fora do resultado: as entradas de estoque do período (ao custo) e as perdas (métrica). */
  compras:            { total: number; linhas: { dia: string; unidade: string; produto: string; embalagens: number; embalagem: string; custo: number; fornecedor: string | null; notaFiscal: string | null }[] }
  perdas:             number | null
}

/** O DRE como a tela o mostra, e embaixo o que fica fora do resultado — a compra (com fornecedor e nota) e a perda. */
export function csvDoDre(d: DreParaCsv): string {
  return csv([
    ['DRE do período', d.periodo],
    ['Linha', 'Valor'],
    ['Receita paga', reais(d.receita)],
    ['Despesas operacionais', reais(-d.despesaOperacional)],
    ['Insumos e produtos vendidos', reais(-d.insumos)],
    ['Taxas da maquininha', reais(-d.taxas)],
    ['Comissões lançadas', reais(-d.comissoes)],
    ['Lucro', reais(d.lucro)],
    [],
    ['Fora do resultado (não entram no lucro)', ''],
    ['Compras no estoque (entradas, ao custo)', reais(d.compras.total)],
    ['Perdas no período (métrica)', d.perdas == null ? '' : reais(d.perdas)],
    [],
    ['Entradas de estoque'],
    ['Data', 'Unidade', 'Produto', 'Quantidade', 'Embalagem', 'Custo', 'Fornecedor', 'Nota fiscal'],
    ...d.compras.linhas.map(l => [dia(l.dia), l.unidade, l.produto, qtd(l.embalagens), l.embalagem, reais(l.custo), l.fornecedor ?? '', l.notaFiscal ?? '']),
  ])
}

export interface FechamentoParaCsv {
  dia:      string
  unidade:  string
  formas:   { forma: string; entradas: number; saidas: number; saldo: number; lancamentos: number }[]
  total:    { entradas: number; saidas: number; saldo: number; lancamentos: number }
  esperadoDinheiro: number
  /**
   * O que voltou às clientes no dia (D3 da 12ª: sem o estorno de despesa), com o
   * dia do pagamento estornado (D2: o de outro dia é saída deste).
   */
  estornos: { descricao: string; forma: string | null; vezes: number | null; valor: number; motivo: string | null; pagoEm?: string | null; mesmoDia?: boolean }[]
  /** A40 e A44 da 11ª: as entradas de cada pessoa que recebeu, por forma (o CSV só trazia as formas). */
  porQuemRecebeu?: { pessoa: string | null; nome: string | null; formas: { forma: string; entradas: number; lancamentos: number }[]; total: { entradas: number; lancamentos: number } }[]
  /** A44 da 12ª: cada bandeira do cartão (a Ivone concilia com a operadora por bandeira). */
  bandeiras?: { forma: string; maquininha?: string | null; bandeira: string | null; entradas: number; saidas: number }[]
  /**
   * A28 da 14ª: a taxa e o líquido de cada maquininha (e do Pix) — só a quem
   * vê o financeiro da clínica (D7); nulo ou ausente, a seção não sai.
   */
  taxasPorMaquininha?: { maquininha: string; bruto: number; taxa: number; liquido: number }[] | null
  /** A47 da 12ª: o último fechamento do dia, ou nulo — "Ainda não fechado". */
  fechado?: { quem: string | null; quando: string; diferenca: number } | null
  /** F62: as horas no relógio da unidade; sem ele, o de Brasília. */
  fuso?: string
}

const hora = (iso: string, fuso = 'America/Sao_Paulo') => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** A47 da 12ª: "Ainda não fechado" ou "Fechado por Cláudia em 11/11/2026 às 01:51" — a tela e o CSV dizem o mesmo. */
export function situacaoDoFechamento(f: { quem: string | null; quando: string } | null | undefined, fuso?: string): string {
  return f ? `Fechado por ${f.quem ?? '—'} em ${dia(f.quando, fuso)} às ${hora(f.quando, fuso)}` : 'Ainda não fechado'
}

const diferencaEmTexto = (v: number) => v === 0 ? 'Bateu' : `${v < 0 ? 'Faltou' : 'Sobrou'} ${reais(Math.abs(v))}`

/** O Fechamento do dia: as formas, o total, o dinheiro esperado e os estornos do dia. */
export function csvDoFechamento(f: FechamentoParaCsv): string {
  return csv([
    ['Fechamento do dia', f.dia, f.unidade],
    ['Forma', 'Entradas', 'Saídas', 'Saldo', 'Lançamentos'],
    ...f.formas.map(l => [rotuloDaFormaDoFechamento(l.forma), reais(l.entradas), reais(l.saidas), reais(l.saldo), String(l.lancamentos)]),
    ['Total do dia', reais(f.total.entradas), reais(f.total.saidas), reais(f.total.saldo), String(f.total.lancamentos)],
    ['Dinheiro em espécie esperado', reais(f.esperadoDinheiro)],
    ...(f.fechado !== undefined ? [['Situação do dia', situacaoDoFechamento(f.fechado, f.fuso), ...(f.fechado ? [diferencaEmTexto(f.fechado.diferenca)] : [])]] : []),
    ...(f.bandeiras?.length ? (() => {
      // C75: com mais de uma maquininha no dia, a linha diz qual (cada uma é uma operadora).
      const varias = new Set(f.bandeiras.map(b => b.maquininha).filter(Boolean)).size > 1
      return [
        [],
        [varias ? 'Cartão por maquininha e bandeira' : 'Cartão por bandeira'],
        [varias ? 'Forma, maquininha e bandeira' : 'Forma e bandeira', 'Entradas', 'Saídas', 'Saldo'],
        ...f.bandeiras.map(b => [
          `${rotuloDaFormaDoFechamento(b.forma)}${varias ? ` · ${b.maquininha ?? 'Cartão da clínica'}` : ''} · ${nomeDaBandeira(b.bandeira)}`,
          reais(b.entradas), reais(b.saidas), reais(b.entradas - b.saidas),
        ]),
      ]
    })() : []),
    ...(f.taxasPorMaquininha?.length ? [
      [],
      ['Taxa e líquido por maquininha (estimados)'],
      ['Maquininha', 'Bruto', 'Taxa', 'Líquido'],
      ...f.taxasPorMaquininha.map(t => [t.maquininha, reais(t.bruto), reais(t.taxa), reais(t.liquido)]),
    ] : []),
    [],
    ['Estornos do dia'],
    ['Descrição', 'Forma', 'Valor', 'Motivo', 'Pagamento de', 'Nas saídas do dia'],
    ...f.estornos.map(e => [
      e.descricao, e.forma ? rotuloDaForma(e.forma, e.vezes) : '', reais(-e.valor), e.motivo ?? '',
      e.pagoEm ? dia(e.pagoEm, f.fuso) : '', e.mesmoDia === false ? 'Sim' : e.mesmoDia ? 'Não (o pagamento é do mesmo dia)' : '',
    ]),
    ...(f.porQuemRecebeu?.length ? [
      [],
      ['Por quem recebeu'],
      ['Quem recebeu', 'Forma', 'Entradas', 'Lançamentos'],
      ...f.porQuemRecebeu.flatMap(p => {
        const quem = p.pessoa ? (p.nome ?? 'Sem nome') : 'Não registrado'
        return [
          ...p.formas.map(l => [quem, rotuloDaFormaDoFechamento(l.forma), reais(l.entradas), String(l.lancamentos)]),
          [quem, 'Total', reais(p.total.entradas), String(p.total.lancamentos)],
        ]
      }),
    ] : []),
  ])
}
