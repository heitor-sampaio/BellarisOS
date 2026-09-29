import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getSignedUrl, DOCUMENTOS_ASSINADOS_BUCKET } from '@/lib/storage'
import { gerarPdfAssinado } from '@/lib/documentos/pdf'

/**
 * O PDF assinado de um documento, por link temporário.
 *
 * Toda rota de /api se defende sozinha (§6): sessão, o módulo `documents`, a
 * rede e a unidade ao alcance. O cliente final baixa o dele pelo portal
 * (fase 5), não por aqui. Se o PDF ainda não foi gerado (o `after()` falhou e
 * o cron não passou), é gerado agora.
 */

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await getTenantContext()
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (ctx.isClient || !can(ctx, 'documents', 'VIEW')) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })

  const admin = createAdminClient()
  const doc = await ler(admin.from('issued_documents').select('id, branch_id, status, signed_pdf_path')
    .eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o documento')
  if (!doc || !alcancaUnidade(ctx, doc.branch_id as string | null) || doc.status !== 'ASSINADO') {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
  }

  const caminho = (doc.signed_pdf_path as string | null) ?? await gerarPdfAssinado(ctx.tenantId!, doc.id as string)
  const url = caminho ? await getSignedUrl(DOCUMENTOS_ASSINADOS_BUCKET, caminho, 10 * 60) : null
  if (!url) return NextResponse.json({ error: 'Não consegui abrir o PDF agora.' }, { status: 500 })
  return NextResponse.redirect(url)
}
