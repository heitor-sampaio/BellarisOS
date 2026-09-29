import { notFound } from 'next/navigation'
import { getTenantContext, assertClient } from '@/lib/auth'
import { documentoDoClienteParaExibir } from '@/lib/documentos/leitura'
import { TelaDeAssinatura } from '@/components/shared/tela-de-assinatura'

/**
 * Portal do cliente → um documento: ler e assinar (ou rever o assinado e
 * baixar o PDF). Só o do próprio cliente — o de outro é "não encontrado".
 */
export default async function DocumentoDoClientePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const d = await documentoDoClienteParaExibir(ctx.clientId!, id)
  if (!d) notFound()

  return (
    <TelaDeAssinatura
      canal="PORTAL"
      // Os botões da equipe (gerar de novo, colher no papel) não são do cliente.
      podeColher={false}
      voltar={`/${slug}/cliente/documentos`}
      doc={{
        id: d.resumo.id, titulo: d.resumo.titulo, tipo: d.resumo.tipo, status: d.resumo.status,
        faltando: d.resumo.faltando, codigo: d.resumo.codigo, motivo: d.resumo.motivo,
        cliente: { nome: d.cliente.nome }, conteudo: d.conteudo, pdfUrl: d.pdfUrl, imagens: d.imagens, assinatura: d.assinatura,
      }}
    />
  )
}
