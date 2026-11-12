import { rotuloDaForma, nomeDaBandeira } from '@/lib/financeiro/formas'

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
  /**
   * A31 da 10ª simulação (2026-11-10): o que a contadora precisava e não
   * tinha — a taxa da maquininha e o líquido da receita paga (do banco,
   * `metrics_taxa_dos_lancamentos`), o vencimento e o dia do pagamento (o
   * resultado é pelo pago; a coluna Data é a de referência), o fornecedor e a
   * nota fiscal.
   */
  taxa?:       number | null
  liquido?:    number | null
  vencimento?: string | null
  pagoEm?:     string | null
  fornecedor?: string | null
  nota?:       string | null
  /**
   * A45 da 12ª (F59): o que o lançamento conta no CAIXA, com o sinal (do banco,
   * `metrics_caixa_dos_lancamentos`); nulo, não conta. Com ele, a coluna Valor
   * do "Sim" é esse valor (o pagamento pelo que entrou; o estorno, negativo) —
   * somar os "Sim" dá o caixa. Sem ele (undefined), conta o pago que não é
   * estorno nem estornado.
   */
  noCaixa?:    number | null
  /**
   * A44 da 12ª simulação (2026-11-11): o que a Ivone, a contadora, precisava
   * para conciliar com a operadora e fechar o mês — a bandeira do cartão, o
   * desconto da venda (em reais), quem atendeu ou vendeu (a profissional) e a
   * unidade (sempre, também na clínica de uma só).
   */
  bandeira?:     string | null
  desconto?:     number | null
  profissional?: string | null
  /** A12 da 13ª: quem vendeu (pacote, pré-pago, produto, plano) — "Profissional" é quem atendeu. */
  vendedor?:     string | null
}

const SITUACAO: Record<LinhaDoCsv['situacao'], string> = { PAGO: 'Pago', EM_ABERTO: 'Em aberto', ESTORNADO: 'Estornado' }

function campo(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const reais = (v: number | null | undefined) => v == null ? '' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',')

const dia = (iso: string | null | undefined, fuso = 'America/Sao_Paulo') => iso
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  : ''

// A44 da 12ª: a Unidade sai sempre (também na clínica de uma unidade), e o
// fornecedor e a nota dizem no cabeçalho que são opcionais (saíam vazios sem dizer).
// F62b: a Data e o Pago em no dia da unidade (`fuso`, o da tela); o Vencimento
// é um DIA (âncora ao meio-dia de Brasília) e fica no padrão.
export function csvDosLancamentos(linhas: LinhaDoCsv[], fuso?: string): string {
  const cabecalho = ['Data', 'Descrição', 'Cliente', 'Unidade', 'Profissional', 'Quem vendeu', 'Categoria', 'Tipo', 'Forma', 'Bandeira', 'Situação', 'Valor', 'Conta no caixa',
    'Desconto', 'Taxa da maquininha', 'Líquido', 'Vencimento', 'Pago em', 'Fornecedor (se informado)', 'Nota fiscal (se informada)']
  const corpo = linhas.map(l => {
    const sinal = l.tipo === 'EXPENSE' ? -1 : 1
    const conta = l.noCaixa !== undefined ? l.noCaixa != null : l.situacao === 'PAGO' && !l.estorno
    const centavos = l.noCaixa != null ? Math.round(l.noCaixa * 100) : Math.round(l.valor * 100) * sinal
    return [
      dia(l.data, fuso), l.descricao, l.cliente ?? '', l.unidade ?? '', l.profissional ?? '', l.vendedor ?? '', l.categoria ?? '',
      l.estorno ? 'Estorno' : l.tipo === 'EXPENSE' ? 'Despesa' : 'Receita',
      l.forma ? rotuloDaForma(l.forma, l.vezes) : '',
      (l.forma === 'CREDIT_CARD' || l.forma === 'DEBIT_CARD') && l.bandeira ? nomeDaBandeira(l.bandeira) : '',
      SITUACAO[l.situacao],
      (centavos / 100).toFixed(2).replace('.', ','), conta ? 'Sim' : 'Não',
      l.desconto && l.desconto > 0 ? reais(l.desconto) : '',
      reais(l.taxa), reais(l.liquido), dia(l.vencimento), l.situacao === 'EM_ABERTO' ? '' : dia(l.pagoEm, fuso),
      l.fornecedor ?? '', l.nota ?? '',
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
  payment_method: string | null; cartao_vezes?: number | null; cartao_bandeira?: string | null; is_paid: boolean; notes: string | null; amount: number | string
  cliente?: { name: string } | null
  due_date?: string | null; paid_at?: string | null; fornecedor?: string | null; nota_fiscal?: string | null
  taxa?: number | null; liquido?: number | null; no_caixa?: number | null
  desconto_valor?: number | null; profissional_nome?: string | null; vendedor_nome?: string | null; unidade_nome?: string | null
}, unidade?: string | null): LinhaDoCsv {
  return {
    data: t.data_de_referencia ?? t.created_at, descricao: t.description, cliente: t.cliente?.name ?? null,
    categoria: t.category, tipo: t.type, forma: t.payment_method, vezes: t.cartao_vezes ?? null,
    situacao: t.notes === 'Estornada' ? 'ESTORNADO' : t.is_paid ? 'PAGO' : 'EM_ABERTO',
    valor: Number(t.amount), estorno: t.category === 'Estorno', unidade: unidade ?? t.unidade_nome ?? null,
    bandeira: t.cartao_bandeira ?? null, desconto: t.desconto_valor ?? null, profissional: t.profissional_nome ?? null,
    vendedor: t.vendedor_nome ?? null,
    taxa: t.taxa ?? null, liquido: t.liquido ?? null, vencimento: t.due_date ?? null, pagoEm: t.paid_at ?? null,
    fornecedor: t.fornecedor ?? null, nota: t.nota_fiscal ?? null,
    ...(t.no_caixa !== undefined ? { noCaixa: t.no_caixa } : {}),
  }
}
