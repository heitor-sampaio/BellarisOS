import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { tipoDoMovimento } from '@/lib/estoque/tipo-do-movimento'
import { partesDizemQuantidade, partesDoMovimento, type PartesDoMovimento } from '@/lib/estoque/lotes-do-movimento'
import { MOVIMENTOS_POR_PAGINA, type MovimentosDoRelatorio } from '@/lib/metrics/movimentos-de-estoque-comum'

/**
 * As movimentações do período em Relatórios → Estoque (item 6 do escopo de
 * 18/11, o Heitor: "ok"): cada entrada e saída, uma linha — data, produto,
 * tipo, quantidade, lote/validade, unidade, quem fez e o custo. A lista, a
 * página e o total são do banco (`metrics_movimentos_de_estoque`): a tela não
 * filtra nem soma, e o PostgREST não corta em 1000.
 */
export * from '@/lib/metrics/movimentos-de-estoque-comum'

type Linha = {
  id: string; created_at: string; fuso: string | null; branch_id: string; unidade: string | null
  product_id: string; produto: string | null; type: string; quantity: number | string
  medida: string | null; embalagem: string | null; embalagens: number | string | null
  reference: string | null; correcao_de_cadastro: boolean | null; motivo_da_perda: string | null
  desfeita: boolean | null; desfaz: boolean | null
  /** D5 da 33ª: com a ligação (em embalagens) e o rendimento (20261212200002). */
  lotes: { numero: string | null; validade: string | null; embalagens?: number | string | null; fator?: number | string | null }[] | null
  quem: string | null; custo: number | string | null; total: number | string
}

export function montarMovimentos(linhas: Linha[]): MovimentosDoRelatorio {
  return {
    total: linhas.length ? Number(linhas[0]!.total) : 0,
    linhas: linhas.map(l => {
      const quantidade = Number(l.quantity)
      const { tipo, rotulo } = tipoDoMovimento({
        type: l.type, quantity: quantidade, reference: l.reference, correcao: !!l.correcao_de_cadastro,
        motivo: l.motivo_da_perda, desfaz: !!l.desfaz,
      })
      return {
        id: l.id, data: l.created_at, fuso: l.fuso ?? 'America/Sao_Paulo', branchId: l.branch_id, unidade: l.unidade ?? '—',
        produtoId: l.product_id, produto: l.produto ?? '—', tipo, rotulo, quantidade,
        medida: l.medida ?? '', embalagem: l.embalagem ?? '', embalagens: Number(l.embalagens ?? 0),
        lotes: (l.lotes ?? []).map(x => ({ numero: x.numero, validade: x.validade })),
        quem: l.quem, custo: Number(l.custo ?? 0), desfeita: !!l.desfeita,
      }
    }),
  }
}

/**
 * D5 da 33ª: o que cada lote cobriu, na unidade do movimento — a ligação (em
 * embalagens) × o rendimento, e o resto "sem lote" (`partesDoMovimento`). Sem
 * a ligação na linha (o banco antes da 20261212200002), o lote cobre o
 * movimento inteiro, como a tela dizia. O lote que cobre o movimento inteiro
 * não manda partes: a tabela segue no texto dela ("MM · val. 24/02/2027",
 * `textoDosLotes`; e2e/estoque-perda).
 */
export function partesDaLinha(l: Pick<Linha, 'quantity' | 'lotes'>): PartesDoMovimento | undefined {
  const quantidade = Number(l.quantity)
  const lotes = l.lotes ?? []
  const fator = Number(lotes[0]?.fator ?? 1) || 1
  const partes = partesDoMovimento({
    quantidade, fator,
    ligacoes: lotes.map(x => ({
      numero: x.numero, validade: x.validade,
      embalagens: x.embalagens != null ? Number(x.embalagens) : Math.abs(quantidade) / fator / lotes.length,
    })),
  })
  return partesDizemQuantidade(partes) ? partes : undefined
}

export async function getMovimentosDeEstoque(args: {
  tenantId: string; branchIds: string[]; from: Date; to: Date; offset?: number; limite?: number
}): Promise<MovimentosDoRelatorio> {
  const data = (await ler(createAdminClient().rpc('metrics_movimentos_de_estoque', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds,
    p_from: args.from.toISOString(), p_to: args.to.toISOString(),
    p_limite: args.limite ?? MOVIMENTOS_POR_PAGINA, p_offset: args.offset ?? 0,
  }), 'carregar as movimentações do estoque') ?? []) as Linha[]
  const r = montarMovimentos(data)
  return { ...r, linhas: r.linhas.map((x, i) => ({ ...x, partes: partesDaLinha(data[i]!) })) }
}
