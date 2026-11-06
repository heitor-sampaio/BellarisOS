import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { LinhaDoRelatorio } from '@/lib/importacao/processar'

/**
 * O relatório de uma importação de contatos, em CSV (2026-10-13): a linha da
 * planilha, o nome, a situação e o motivo — para corrigir e importar de novo.
 * Traz as RECUSADAS e as IMPORTADAS COM AVISO (D2/A6 da 8ª simulação,
 * 2026-11-06: a Isabela entra sem o CPF, e a dona precisa saber disso).
 *
 * Toda rota de /api se defende sozinha (§6): sessão, o módulo do destino
 * (`clients` ou `crm` em Gerenciar) e a rede. O relatório guarda o valor
 * errado — dado pessoal —, e some depois de 7 dias.
 */

export const dynamic = 'force-dynamic'

const celula = (v: string | number) => {
  const t = String(v)
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await getTenantContext()
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (ctx.isClient) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })

  const imp = await ler(createAdminClient().from('importacoes')
    .select('destino, branch_id, nome_arquivo, erros, avisos, erros_expiram_em').eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a importação') as
    { destino: string; branch_id: string | null; nome_arquivo: string; erros: LinhaDoRelatorio[]; avisos: LinhaDoRelatorio[] | null; erros_expiram_em: string | null } | null
  if (!imp) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })
  if (!can(ctx, imp.destino === 'clientes' ? 'clients' : 'crm', 'MANAGE')) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  if (imp.destino === 'clientes' && !alcancaUnidade(ctx, imp.branch_id)) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })
  // Vencido (7 dias), o relatório não sai mais — mesmo antes de a manutenção limpá-lo.
  const vencido = !!imp.erros_expiram_em && imp.erros_expiram_em < new Date().toISOString()
  const linhas = vencido ? [] : [
    ...(imp.erros ?? []).map(e => ({ ...e, situacao: 'Recusada' })),
    ...(imp.avisos ?? []).map(e => ({ ...e, situacao: 'Importada com aviso' })),
  ].sort((a, b) => a.linha - b.linha)

  // `;` e BOM: é como o Excel brasileiro abre sem perguntar nada.
  const corpo = '\uFEFF' + ['Linha;Nome;Situação;Motivo', ...linhas.map(e => `${e.linha};${celula(e.nome ?? '')};${e.situacao};${celula(e.motivo)}`)].join('\r\n')
  const nome = `relatorio-${imp.nome_arquivo.replace(/\.csv$/i, '').replace(/[^\w.-]+/g, '-')}.csv`
  return new NextResponse(corpo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  })
}
