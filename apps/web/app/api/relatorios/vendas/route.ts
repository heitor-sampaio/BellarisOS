import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, podeVerRelatorio, alcancaUnidade, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { resolvePeriod } from '@/lib/metrics'
import {
  getTodasAsVendas, ehTipoDeVenda, descricaoDaVenda, ROTULO_DO_TIPO,
} from '@/lib/metrics/vendas'

/**
 * O relatório de vendas inteiro, em CSV (2026-10-14): o MESMO recorte da aba
 * Vendas — período, unidade e tipo —, sem página.
 *
 * Toda rota de /api se defende sozinha (§6): sessão, `reports: VIEW` com a
 * aba Vendas no cargo, a unidade da rede e ao alcance. Sem unidade, a rede
 * inteira — só para quem é da rede e vê o consolidado (o escopo "só a minha
 * unidade" de relatórios).
 */

export const dynamic = 'force-dynamic'

const celula = (v: string | number) => {
  const t = String(v)
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
const reais = (v: number) => v.toFixed(2).replace('.', ',')

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
  const pedida = q.get('branch') ?? ctx.branchId
  const unidades = await ler(createAdminClient().from('branches')
    .select('id, name').eq('tenant_id', ctx.tenantId).eq('is_active', true), 'carregar as unidades') as { id: string; name: string }[] | null
  const nomeDe = new Map((unidades ?? []).map(u => [u.id, u.name]))

  let branchIds: string[] | null
  if (pedida) {
    if (!nomeDe.has(pedida) || !alcancaUnidade(ctx, pedida)) {
      return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
    }
    branchIds = [pedida]
  } else {
    if (isOwnScope(ctx, 'reports')) return NextResponse.json({ error: 'Escolha uma unidade.' }, { status: 403 })
    branchIds = [...nomeDe.keys()]
  }

  const tipo = q.get('tipo')
  const periodo = resolvePeriod(q.get('period') ?? 'month', q.get('from') ?? undefined, q.get('to') ?? undefined, new Date())
  const vendas = await getTodasAsVendas({
    tenantId: ctx.tenantId, branchIds, from: periodo.from, to: periodo.fullTo,
    tipo: ehTipoDeVenda(tipo) ? tipo : null,
    // "Só os meus" (agenda ou financeiro OWN, 2026-10-28): as vendas DELA, o
    // mesmo recorte da aba — a exportação não abre o que a tela fecha.
    professionalId: isOwnScope(ctx, 'agenda') || isOwnScope(ctx, 'financial')
      ? (ctx.internalUserId ?? '00000000-0000-0000-0000-000000000000') : null,
  })

  // `;` e BOM: é como o Excel brasileiro abre sem perguntar nada.
  const linhas = vendas.map(v => [
    new Date(v.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ROTULO_DO_TIPO[v.tipo],
    descricaoDaVenda(v),
    v.cliente ?? '',
    v.profissional ?? '',
    nomeDe.get(v.branchId) ?? '',
    reais(v.valor),
  ].map(celula).join(';'))
  const corpo = '﻿' + ['Data;Tipo;Descrição;Cliente;Profissional;Unidade;Valor', ...linhas].join('\r\n')
  const nome = `vendas-${periodo.from.toISOString().slice(0, 10)}-a-${periodo.fullTo.toISOString().slice(0, 10)}.csv`
  return new NextResponse(corpo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  })
}
