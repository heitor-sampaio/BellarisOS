import 'server-only'
import { formatBRL } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O desconto embaixo do valor, na lista do Financeiro (fin-01 da revisão,
 * 2026-11-02: "a Bruna dá R$ 20 de desconto com o motivo 'cliente antiga'; no
 * Financeiro, a linha mostra só o valor").
 *
 * - O atendimento avulso guarda o desconto no próprio lançamento
 *   (`sale_discount`) e o motivo em `desconto_motivo`.
 * - A VENDA (produto, pacote, pré-pago, plano) guarda o desconto na venda; o
 *   motivo vai só no PRIMEIRO lançamento dela. A lista mostra o desconto da
 *   venda nesse lançamento — um por venda, não um por parcela.
 *
 * Só leitura, para a tela; nada aqui entra numa conta.
 */
export interface LancamentoComDesconto {
  sale_discount?:     number | string | null
  desconto_motivo?:   string | null
  product_sale_id?:   string | null
  client_package_id?: string | null
  procedure_sale_id?: string | null
  treatment_plan_id?: string | null
}

/** "Desconto R$ 20,00 · cliente antiga", "Desconto R$ 20,00" ou "Desconto · cliente antiga". */
export function textoDoDesconto(valor: number | null, motivo: string | null): string | null {
  const m = motivo?.trim() || null
  if (valor && valor > 0) return m ? `Desconto ${formatBRL(valor)} · ${m}` : `Desconto ${formatBRL(valor)}`
  return m ? `Desconto · ${m}` : null
}

/**
 * O texto do desconto de cada lançamento (por id), lendo o desconto das vendas
 * dos que levam o motivo. Os lançamentos já são os da tela (o alcance foi
 * conferido por quem os leu).
 */
export async function descontosDosLancamentos<T extends LancamentoComDesconto & { id: string }>(linhas: T[]): Promise<Record<string, string>> {
  const daVenda = linhas.filter(l => l.desconto_motivo && !(Number(l.sale_discount ?? 0) > 0))
  const ids = (k: keyof LancamentoComDesconto) => [...new Set(daVenda.map(l => l[k] as string | null).filter((v): v is string => !!v))]
  const admin = createAdminClient()
  const ler2 = async (tabela: string, lista: string[]) => lista.length
    ? ((await ler(admin.from(tabela).select('id, desconto').in('id', lista), `ler o desconto de ${tabela}`)) ?? []) as { id: string; desconto: number | string | null }[]
    : []
  const [produtos, pacotes, prePagos, planos] = await Promise.all([
    ler2('product_sales', ids('product_sale_id')),
    ler2('client_packages', ids('client_package_id')),
    ler2('procedure_sales', ids('procedure_sale_id')),
    ler2('treatment_plans', ids('treatment_plan_id')),
  ])
  const valor = new Map<string, number>()
  for (const r of [...produtos, ...pacotes, ...prePagos, ...planos]) valor.set(r.id, Number(r.desconto ?? 0))

  const saida: Record<string, string> = {}
  for (const l of linhas) {
    const avulso = Number(l.sale_discount ?? 0)
    const venda = l.product_sale_id ?? l.client_package_id ?? l.procedure_sale_id ?? l.treatment_plan_id ?? null
    const texto = avulso > 0
      ? textoDoDesconto(avulso, l.desconto_motivo ?? null)
      : l.desconto_motivo ? textoDoDesconto(venda ? valor.get(venda) ?? null : null, l.desconto_motivo) : null
    if (texto) saida[l.id] = texto
  }
  return saida
}
