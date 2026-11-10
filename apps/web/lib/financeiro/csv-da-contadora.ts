import { rotuloDaForma, rotuloDaFormaDoFechamento } from '@/lib/financeiro/formas'

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
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
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
  estornos: { descricao: string; forma: string | null; vezes: number | null; valor: number; motivo: string | null }[]
  /** A40 e A44 da 11ª: as entradas de cada pessoa que recebeu, por forma (o CSV só trazia as formas). */
  porQuemRecebeu?: { pessoa: string | null; nome: string | null; formas: { forma: string; entradas: number; lancamentos: number }[]; total: { entradas: number; lancamentos: number } }[]
}

/** O Fechamento do dia: as formas, o total, o dinheiro esperado e os estornos do dia. */
export function csvDoFechamento(f: FechamentoParaCsv): string {
  return csv([
    ['Fechamento do dia', f.dia, f.unidade],
    ['Forma', 'Entradas', 'Saídas', 'Saldo', 'Lançamentos'],
    ...f.formas.map(l => [rotuloDaFormaDoFechamento(l.forma), reais(l.entradas), reais(l.saidas), reais(l.saldo), String(l.lancamentos)]),
    ['Total do dia', reais(f.total.entradas), reais(f.total.saidas), reais(f.total.saldo), String(f.total.lancamentos)],
    ['Dinheiro em espécie esperado', reais(f.esperadoDinheiro)],
    [],
    ['Estornos do dia'],
    ['Descrição', 'Forma', 'Valor', 'Motivo'],
    ...f.estornos.map(e => [e.descricao, e.forma ? rotuloDaForma(e.forma, e.vezes) : '', reais(-e.valor), e.motivo ?? '']),
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
