import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * O CSV das movimentações do Financeiro (A44 da 8ª simulação, 2026-11-06: a
 * contadora só tinha o de Comissões). É a LISTA que a tela mostra, campo a
 * campo — não soma nada. Ponto e vírgula e BOM, que é o que o Excel em pt-BR
 * abre certo (o mesmo do CSV de Comissões); o valor com sinal (a despesa e o
 * estorno saem negativos) e com vírgula; o dia, o de Brasília.
 */
export interface LinhaDoCsv {
  /** A data de referência (pago: o pagamento; em aberto: o vencimento). */
  data:      string | null
  descricao: string
  cliente:   string | null
  categoria: string | null
  tipo:      string
  forma:     string | null
  vezes:     number | null
  situacao:  'PAGO' | 'EM_ABERTO' | 'ESTORNADO'
  valor:     number
  /** O contra-lançamento do estorno (category = 'Estorno'). */
  estorno?:  boolean
  unidade?:  string | null
}

const SITUACAO: Record<LinhaDoCsv['situacao'], string> = { PAGO: 'Pago', EM_ABERTO: 'Em aberto', ESTORNADO: 'Estornado' }

function campo(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const dia = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  : ''

export function csvDosLancamentos(linhas: LinhaDoCsv[], opcoes: { comUnidade?: boolean } = {}): string {
  const cabecalho = ['Data', 'Descrição', 'Cliente', ...(opcoes.comUnidade ? ['Unidade'] : []), 'Categoria', 'Tipo', 'Forma', 'Situação', 'Valor']
  const corpo = linhas.map(l => {
    const sinal = l.tipo === 'EXPENSE' ? -1 : 1
    const centavos = Math.round(l.valor * 100) * sinal
    return [
      dia(l.data), l.descricao, l.cliente ?? '', ...(opcoes.comUnidade ? [l.unidade ?? ''] : []), l.categoria ?? '',
      l.estorno ? 'Estorno' : l.tipo === 'EXPENSE' ? 'Despesa' : 'Receita',
      l.forma ? rotuloDaForma(l.forma, l.vezes) : '', SITUACAO[l.situacao],
      (centavos / 100).toFixed(2).replace('.', ','),
    ].map(v => campo(String(v)))
  })
  return '﻿' + [cabecalho, ...corpo].map(l => l.join(';')).join('\r\n')
}

/** "lancamentos-2026-11-01-a-2026-11-30.csv"; sem período (todo o em aberto), "lancamentos-em-aberto.csv". */
export function nomeDoCsvDosLancamentos(de: string | null, ate: string | null): string {
  return de && ate ? `lancamentos-${de}-a-${ate}.csv` : 'lancamentos-em-aberto.csv'
}

/** Baixa o CSV no navegador. */
export function baixarCsv(nome: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

/** Um lançamento da lista do Financeiro (os dois portais) na linha do CSV. */
export function linhaDoLancamento(t: {
  data_de_referencia?: string | null; created_at: string; description: string; category: string | null; type: string
  payment_method: string | null; cartao_vezes?: number | null; is_paid: boolean; notes: string | null; amount: number | string
  cliente?: { name: string } | null
}, unidade?: string | null): LinhaDoCsv {
  return {
    data: t.data_de_referencia ?? t.created_at, descricao: t.description, cliente: t.cliente?.name ?? null,
    categoria: t.category, tipo: t.type, forma: t.payment_method, vezes: t.cartao_vezes ?? null,
    situacao: t.notes === 'Estornada' ? 'ESTORNADO' : t.is_paid ? 'PAGO' : 'EM_ABERTO',
    valor: Number(t.amount), estorno: t.category === 'Estorno', unidade: unidade ?? null,
  }
}
