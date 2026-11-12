import { formatBRL } from '@estetica-os/utils'

/**
 * A comissão de VENDA dita no "Vender", antes de vender (A18 da 12ª simulação,
 * 2026-11-11; princípio 3): a Rita não sabia quanto ganhava nem de onde vinha
 * o percentual — só o extrato dizia ("8% — da Rita", "5% — do pacote").
 *
 * A precedência é a do BANCO (A17 da 11ª, `comissoes.md`; as funções de venda
 * em `20261110005603`): a regra do ITEM (o "De venda" do pacote, a comissão do
 * produto no "Por produto") vence a da PESSOA (Equipe → Comissão); sem as
 * duas, a da CLÍNICA (só no produto: a "Venda de produto"). O pré-pago só tem
 * a da pessoa. Aqui só se ESCREVE a regra — o valor em reais é do banco
 * (`comissao_conta`), e sai quando a venda está paga inteira (H4).
 *
 * A pessoa com `pct` indefinido é a comissão que quem vende não pode ver (a
 * de outra pessoa, para quem só vê as próprias comissões): o que depende dela
 * não se diz.
 */

export interface RegraDeVenda { tipo: 'PERCENTAGE' | 'FIXED_AMOUNT'; valor: number }
type Origem = 'ITEM' | 'PESSOA' | 'CLINICA'
type TipoDaVenda = 'PACOTE' | 'PRODUTO' | 'PRE_PAGO' | 'PLANO'

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function regraEmTexto(r: RegraDeVenda, tipo: TipoDaVenda): string {
  if (r.tipo === 'PERCENTAGE') return `${num(r.valor)}% do vendido`
  return tipo === 'PRODUTO' ? `${formatBRL(r.valor)} por unidade` : `${formatBRL(r.valor)} fixo`
}

export function textoDaComissaoDaVenda(o: {
  /** O plano (C42 da F67): a da pessoa; sem ela, a "Venda de plano" da clínica (`plano_comissao_de_venda`). */
  tipo: TipoDaVenda
  /** Um por item: o pacote e o pré-pago têm um; o produto, um por produto do kit. */
  itens: { nome?: string; regra: RegraDeVenda | null }[]
  pessoa: { nome: string; pct: number | null | undefined }
  /** A "Venda de produto" (no produto) ou a "Venda de plano" (no plano) da clínica. */
  clinicaPct?: number | null
}): string | null {
  const daPessoa = o.pessoa.pct
  const resolvidos: ({ regra: RegraDeVenda; de: Origem } | null)[] = []
  for (const it of o.itens) {
    // C40 (D13): a regra do item vence mesmo com 0% — o 0 é a escolha de não pagar.
    if (o.tipo !== 'PRE_PAGO' && o.tipo !== 'PLANO' && it.regra) { resolvidos.push({ regra: it.regra, de: 'ITEM' }); continue }
    if (daPessoa === undefined) return null
    if (daPessoa != null && daPessoa > 0) { resolvidos.push({ regra: { tipo: 'PERCENTAGE', valor: daPessoa }, de: 'PESSOA' }); continue }
    if ((o.tipo === 'PRODUTO' || o.tipo === 'PLANO') && o.clinicaPct != null && o.clinicaPct > 0) {
      resolvidos.push({ regra: { tipo: 'PERCENTAGE', valor: o.clinicaPct }, de: 'CLINICA' }); continue
    }
    resolvidos.push(null)
  }
  if (!resolvidos.length) return null
  const nome = o.pessoa.nome
  if (resolvidos.every(r => r === null)) {
    return o.tipo === 'PRE_PAGO'
      ? `${nome} não tem comissão de venda: o pré-pago usa a comissão de venda da pessoa (Equipe → Comissão).`
      : o.tipo === 'PACOTE'
        ? `${nome} não tem comissão de venda neste pacote: nem o pacote nem ela têm regra de venda.`
        : o.tipo === 'PLANO'
          ? `${nome} não tem comissão de venda neste plano: nem ela nem a clínica ("Venda de plano") têm regra de venda.`
        : `${nome} não tem comissão de venda nestes produtos: nem o produto, nem ela, nem a clínica têm regra de venda.`
  }
  const deOnde = (de: Origem) => de === 'ITEM' ? (o.tipo === 'PRODUTO' ? 'do produto' : 'do pacote') : de === 'PESSOA' ? `da ${nome}` : 'da clínica'
  const frase = (r: { regra: RegraDeVenda; de: Origem } | null) => r ? `${regraEmTexto(r.regra, o.tipo)} — ${deOnde(r.de)}` : 'sem comissão de venda'
  const iguais = resolvidos.every(r => JSON.stringify(r) === JSON.stringify(resolvidos[0]))
  const corpo = iguais
    ? frase(resolvidos[0]!)
    : resolvidos.map((r, i) => `${o.itens[i]!.nome ?? `Item ${i + 1}`}, ${frase(r)}`).join('; ')
  return `Comissão de venda de ${nome}: ${corpo}. Sai quando a venda estiver paga inteira.`
}
