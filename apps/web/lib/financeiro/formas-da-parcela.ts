import { formatBRL } from '@estetica-os/utils'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * A parcela recebida em várias formas numa linha só (limite da 21ª simulação,
 * 2026-11-17). O "+ Outra forma" da parcela (A1 da 21ª,
 * `lancamento_receber_em_formas`) grava um lançamento por forma — a linha em
 * aberto vira a primeira, e as outras são cópias pagas dela, com a mesma
 * descrição, parcela, criação e pagamento. As listas mostravam "Parcela 2/4"
 * duas vezes, como se fosse parcela repetida. Aqui elas se juntam: o total e
 * cada forma ("Pix R$ 400,00 + Dinheiro R$ 200,00"). Só leitura: as ações
 * (recibo, estorno) continuam por forma, que é como o dinheiro entrou.
 */
export interface LinhaParaJuntar {
  id:              string
  type?:           string | null
  amount:          number | string
  payment_method:  string | null
  cartao_vezes?:   number | null
  is_paid:         boolean
  paid_at:         string | null
  created_at:      string
  notes?:          string | null
  category?:       string | null
  description?:    string | null
  parcela_numero?: number | null
  parcela_total?:  number | null
}

export interface FormaDaParcela { id: string; forma: string | null; vezes: number | null; valor: number }

/** A chave das formas de UMA parcela; nulo para o que não se junta (em aberto, estornado, estorno, sem parcela). */
export function chaveDaParcelaEmFormas(l: LinhaParaJuntar): string | null {
  if ((l.type ?? 'INCOME') !== 'INCOME' || !l.is_paid || !l.paid_at) return null
  if (l.notes === 'Estornada' || l.category === 'Estorno') return null
  if (l.parcela_numero == null || l.parcela_total == null) return null
  return [l.description ?? '', l.parcela_numero, l.parcela_total, l.created_at, l.paid_at].join('|')
}

function grupos<T extends LinhaParaJuntar>(linhas: readonly T[]): Map<string, T[]> {
  const por = new Map<string, T[]>()
  for (const l of linhas) {
    const k = chaveDaParcelaEmFormas(l)
    if (!k) continue
    const g = por.get(k)
    if (g) g.push(l)
    else por.set(k, [l])
  }
  return por
}

/**
 * A lista com as formas de cada parcela numa linha: a do lugar da primeira,
 * com o valor somado (em centavos) e `formasDaParcela`; as outras somem. O que
 * não se junta segue igual, com `formasDaParcela: null`.
 */
export function juntarAsFormasDaParcela<T extends LinhaParaJuntar>(linhas: readonly T[]): (T & { formasDaParcela: FormaDaParcela[] | null })[] {
  const por = grupos(linhas)
  const saida: (T & { formasDaParcela: FormaDaParcela[] | null })[] = []
  for (const l of linhas) {
    const k = chaveDaParcelaEmFormas(l)
    const g = k ? por.get(k)! : null
    if (!g || g.length < 2) { saida.push({ ...l, formasDaParcela: null }); continue }
    if (g[0] !== l) continue
    // As cópias da parcela nascem com a mesma criação: a ordem lida empata. A maior forma primeiro (e, no empate, a
    // forma e o id), para a mesma parcela ler igual em toda tela (decisão do Claude, 27/11).
    const formas = g.map(x => ({ id: x.id, forma: x.payment_method, vezes: x.cartao_vezes ?? null, valor: Number(x.amount) }))
      .sort((x, y) => y.valor - x.valor || (x.forma ?? '').localeCompare(y.forma ?? '') || x.id.localeCompare(y.id))
    const centavos = formas.reduce((t, f) => t + Math.round(f.valor * 100), 0)
    saida.push({ ...l, amount: centavos / 100, formasDaParcela: formas })
  }
  return saida
}

/** "Pix R$ 400,00 + Dinheiro R$ 200,00". */
export function formasDaParcelaEmTexto(formas: readonly FormaDaParcela[]): string {
  return formas.map(f => `${rotuloDaForma(f.forma, f.vezes)} ${formatBRL(f.valor)}`).join(' + ')
}

/**
 * A forma e os recibos de uma linha da lista JÁ juntada (o app da cliente, D8
 * da 36ª — CR-07): a parcela em várias formas diz as formas e tem um recibo
 * por forma, com o rótulo dela; a linha comum fica com a forma pronta dela
 * (`formaSozinha`, a de `formaDoLancamento`) e um recibo, sem rótulo.
 */
export function formaERecibosDaLinha(
  l: { id: string; formasDaParcela: readonly FormaDaParcela[] | null },
  formaSozinha: string | null,
): { forma: string | null; recibos: { id: string; forma: string | null }[] } {
  if (!l.formasDaParcela) return { forma: formaSozinha, recibos: [{ id: l.id, forma: null }] }
  return {
    forma:   formasDaParcelaEmTexto(l.formasDaParcela),
    recibos: l.formasDaParcela.map(f => ({ id: f.id, forma: rotuloDaForma(f.forma, f.vezes) })),
  }
}

/**
 * No CSV cada forma continua uma linha (é o que a contadora concilia), mas
 * diz que é parte da mesma parcela: "forma 1 de 2". Só as das parcelas
 * recebidas em mais de uma forma.
 */
export function posicaoNaParcela(linhas: readonly LinhaParaJuntar[]): Map<string, string> {
  const pos = new Map<string, string>()
  for (const g of grupos(linhas).values()) {
    if (g.length < 2) continue
    g.forEach((l, i) => pos.set(l.id, `forma ${i + 1} de ${g.length}`))
  }
  return pos
}
