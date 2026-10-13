import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O relatório de erros de uma importação de contatos, em CSV (2026-10-13):
 * a linha da planilha e o motivo, para corrigir e importar de novo.
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
    .select('destino, branch_id, nome_arquivo, erros, erros_expiram_em').eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a importação') as
    { destino: string; branch_id: string | null; nome_arquivo: string; erros: { linha: number; motivo: string }[]; erros_expiram_em: string | null } | null
  if (!imp) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })
  if (!can(ctx, imp.destino === 'clientes' ? 'clients' : 'crm', 'MANAGE')) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  if (imp.destino === 'clientes' && !alcancaUnidade(ctx, imp.branch_id)) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })
  // Vencido (7 dias), o relatório não sai mais — mesmo antes de a manutenção limpá-lo.
  const erros = imp.erros_expiram_em && imp.erros_expiram_em < new Date().toISOString() ? [] : (imp.erros ?? [])

  // `;` e BOM: é como o Excel brasileiro abre sem perguntar nada.
  const corpo = '\uFEFF' + ['Linha;Motivo', ...erros.map(e => `${e.linha};${celula(e.motivo)}`)].join('\r\n')
  const nome = `erros-${imp.nome_arquivo.replace(/\.csv$/i, '').replace(/[^\w.-]+/g, '-')}.csv`
  return new NextResponse(corpo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  })
}
