import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { nomesDosRegistros } from '@/lib/nomes-dos-registros'

/**
 * O desconto e a profissional de cada lançamento, para o CSV da contadora (A44
 * da 12ª simulação, 2026-11-11: a Ivone não tinha o desconto nem quem atendeu
 * ou vendeu). Só leitura, dos registros que a tela já leu (o alcance foi
 * conferido por quem os leu); nada aqui entra numa conta.
 *
 * - O DESCONTO em reais: o do atendimento avulso mora no lançamento
 *   (`sale_discount`); o da venda (produto, pacote, pré-pago, plano) mora na
 *   venda e sai UMA vez — no lançamento que leva o motivo, senão no primeiro da
 *   venda (a entrada, a parcela 1) —, não em cada parcela.
 * - A PROFISSIONAL: a do atendimento; na venda, quem vendeu (`sold_by`; no
 *   plano, `vendido_por`, senão a dona do plano) — a mesma pessoa da coluna
 *   Profissional das Vendas.
 */
export interface LancamentoParaOCsv {
  id: string
  created_at: string
  appointment_id?: string | null
  product_sale_id?: string | null
  client_package_id?: string | null
  procedure_sale_id?: string | null
  treatment_plan_id?: string | null
  sale_discount?: number | string | null
  desconto_motivo?: string | null
  parcela_numero?: number | null
}

type Venda = { id: string; desconto: number | string | null; quem: string | null }

export async function extrasDoCsv(tenantId: string, linhas: LancamentoParaOCsv[]): Promise<Record<string, { desconto: number | null; profissional: string | null }>> {
  const admin = createAdminClient()
  const ids = (k: keyof LancamentoParaOCsv) => [...new Set(linhas.map(l => l[k] as string | null | undefined).filter((v): v is string => !!v))]
  /** `quem`: as colunas de quem vendeu, na ordem (a primeira que tiver alguém vale). */
  const lerVendas = async (tabela: string, quem: string[], lista: string[]): Promise<Venda[]> => {
    const saida: Venda[] = []
    for (let i = 0; i < lista.length; i += 150) {
      const lote = await ler(admin.from(tabela).select(`id, desconto, ${quem.join(', ')}`).in('id', lista.slice(i, i + 150)),
        `ler as vendas de ${tabela}`) as Record<string, unknown>[] | null
      for (const r of lote ?? []) saida.push({ id: String(r.id), desconto: r.desconto as number | null, quem: (quem.map(c => r[c]).find(v => !!v) ?? null) as string | null })
    }
    return saida
  }
  const lerAtendimentos = async (lista: string[]) => {
    const saida = new Map<string, string | null>()
    for (let i = 0; i < lista.length; i += 150) {
      const lote = await ler(admin.from('appointments').select('id, professional_id').in('id', lista.slice(i, i + 150)),
        'ler os atendimentos') as { id: string; professional_id: string | null }[] | null
      for (const r of lote ?? []) saida.set(r.id, r.professional_id)
    }
    return saida
  }
  const [produtos, pacotes, prePagos, planos, atendimentos] = await Promise.all([
    lerVendas('product_sales', ['sold_by'], ids('product_sale_id')),
    lerVendas('client_packages', ['sold_by'], ids('client_package_id')),
    lerVendas('procedure_sales', ['sold_by'], ids('procedure_sale_id')),
    lerVendas('treatment_plans', ['vendido_por', 'professional_id'], ids('treatment_plan_id')),
    lerAtendimentos(ids('appointment_id')),
  ])
  const venda = new Map<string, Venda>()
  for (const v of [...produtos, ...pacotes, ...prePagos, ...planos]) venda.set(v.id, v)
  const nomes = await nomesDosRegistros(tenantId, {
    membros: [...[...venda.values()].map(v => v.quem), ...atendimentos.values()],
  })

  // O lançamento de cada venda que leva o desconto: o do motivo, senão o primeiro.
  const daVenda = (l: LancamentoParaOCsv) => l.product_sale_id ?? l.client_package_id ?? l.procedure_sale_id ?? l.treatment_plan_id ?? null
  const primeiro = new Map<string, LancamentoParaOCsv>()
  for (const l of linhas) {
    const v = daVenda(l)
    if (!v) continue
    const atual = primeiro.get(v)
    const antes = (a: LancamentoParaOCsv, b: LancamentoParaOCsv) =>
      (a.desconto_motivo ? 0 : 1) - (b.desconto_motivo ? 0 : 1)
      || (a.parcela_numero ?? 0) - (b.parcela_numero ?? 0)
      || a.created_at.localeCompare(b.created_at)
    if (!atual || antes(l, atual) < 0) primeiro.set(v, l)
  }

  const saida: Record<string, { desconto: number | null; profissional: string | null }> = {}
  for (const l of linhas) {
    const avulso = Number(l.sale_discount ?? 0)
    const v = daVenda(l)
    const daVendaAqui = v && primeiro.get(v)?.id === l.id ? Number(venda.get(v)?.desconto ?? 0) : 0
    const quem = l.appointment_id ? atendimentos.get(l.appointment_id) ?? null : v ? venda.get(v)?.quem ?? null : null
    saida[l.id] = {
      desconto: avulso > 0 ? avulso : daVendaAqui > 0 ? daVendaAqui : null,
      profissional: quem ? nomes.membros[quem] ?? null : null,
    }
  }
  return saida
}
