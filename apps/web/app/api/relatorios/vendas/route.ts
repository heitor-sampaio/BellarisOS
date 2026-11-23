import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, podeVerRelatorio, alcancaUnidade } from '@/lib/auth'
import { unidadesParaLer, periodoDaTela, nomeNaTela } from '@/lib/unidades/da-tela'
import { resolvePeriod } from '@/lib/metrics'
import { fusoDoRecorte } from '@/lib/unidades/fuso-da-unidade'
import { getTodasAsVendas, ehTipoDeVenda } from '@/lib/metrics/vendas'
import { tagsDaUrl } from '@/lib/metrics/tags-do-relatorio'
import { nomeDoCsvDeVendas, CABECALHO_DO_CSV_DE_VENDAS, colunasDoCsvDeVendas } from '@/lib/metrics/vendas-comum'

/**
 * O relatório de vendas inteiro, em CSV (2026-10-14): o MESMO recorte da aba
 * Vendas — período, unidade e tipo —, sem página.
 *
 * Toda rota de /api se defende sozinha (§6): sessão, `reports: VIEW` com a
 * aba Vendas no cargo, a unidade da rede e ao alcance. Sem unidade, as
 * unidades ao alcance da pessoa (a rede inteira, para quem é da rede).
 */

export const dynamic = 'force-dynamic'

const celula = (v: string | number) => {
  const t = String(v)
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export async function GET(req: NextRequest) {
  let ctx
  try {
    ctx = await getTenantContext()
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (ctx.isClient || !ctx.tenantId || !podeVerRelatorio(ctx, 'vendas')) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams
  // A unidade pedida, dentre as da pessoa. Sem pedido: quem tem UMA unidade
  // fica nela; quem tem várias (EQ1a), todas as DELA — em `/api/*` não há
  // unidade no endereço, e o `ctx.branchId` é só a principal (exportava ela,
  // calada). Quem é da rede, a rede.
  const pedida = q.get('branch') ?? (ctx.unidades?.length === 1 ? ctx.unidades[0]! : null)
  // F72: as mesmas unidades da aba de Vendas — as de LEITURA (a desativada com
  // movimento no período segue no total e na exportação, com o selo).
  const unidades = await unidadesParaLer(ctx.tenantId, {
    periodo: await periodoDaTela(ctx.tenantId, q.get('period') ?? 'month', q.get('from') ?? undefined, q.get('to') ?? undefined),
  })
  const nomeDe = new Map(unidades.map(u => [u.id, nomeNaTela(u)]))

  let branchIds: string[] | null
  if (pedida) {
    if (!nomeDe.has(pedida) || !alcancaUnidade(ctx, pedida)) {
      return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
    }
    branchIds = [pedida]
  } else {
    branchIds = [...nomeDe.keys()].filter(id => alcancaUnidade(ctx, id))
  }

  const tipo = q.get('tipo')
  // F62: o período no fuso do recorte (a unidade, o dela; a rede, o comum).
  const fuso = await fusoDoRecorte(ctx.tenantId, branchIds)
  const periodo = resolvePeriod(q.get('period') ?? 'month', q.get('from') ?? undefined, q.get('to') ?? undefined, new Date(), fuso)
  const vendas = await getTodasAsVendas({
    tenantId: ctx.tenantId, branchIds, from: periodo.from, to: periodo.fullTo,
    tipo: ehTipoDeVenda(tipo) ? tipo : null,
    // As vendas de todos, nas unidades ao alcance: o mesmo recorte da aba.
    // O filtro de Tags da aba (a cliente tem todas): a exportação é o que a tela mostra.
    tags: tagsDaUrl(q.get('tags')),
  })

  // `;` e BOM: é como o Excel brasileiro abre sem perguntar nada. Cada linha
  // é uma comanda do PDV, com o número dela (RL1).
  const linhas = vendas.map(v => colunasDoCsvDeVendas(v, { fuso, unidade: nomeDe.get(v.branchId) ?? '' }).map(celula).join(';'))
  const corpo = '﻿' + [CABECALHO_DO_CSV_DE_VENDAS, ...linhas].join('\r\n')
  // O último dia do período no fuso do negócio (J-53): o de outubro saía "…-a-2026-11-01".
  const nome = nomeDoCsvDeVendas(periodo.from, periodo.fullTo, fuso)
  return new NextResponse(corpo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  })
}
