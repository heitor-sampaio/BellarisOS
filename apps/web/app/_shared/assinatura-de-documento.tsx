import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade, can } from '@/lib/auth'
import { documentoParaExibir } from '@/lib/documentos/leitura'
import { TelaDeAssinatura } from '@/components/shared/tela-de-assinatura'

/**
 * Corpo da tela de um termo ou contrato do cliente — nos dois portais.
 *
 * Quem só VÊ o módulo abre para ler (e conferir a assinatura); quem GERENCIA
 * colhe. Para quem vai colher, o documento é montado de novo ao abrir: o
 * cliente assina com os dados de agora.
 *
 * `base` é o portal onde a pessoa está (`/admin` ou `/<slug>`), não a unidade
 * do documento — é para onde os links levam.
 */
export async function AssinaturaDeDocumento({ id, base, voltar }: {
  id:     string
  base:   string
  voltar: string | undefined
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'documents', 'VIEW')
  const podeColher = can(ctx, 'documents', 'MANAGE')

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const doc = await documentoParaExibir(ctx.tenantId!, id, { montarDeNovo: podeColher })
  // Fora da rede ou da unidade que a pessoa alcança: como se não existisse.
  if (!doc || !alcancaUnidade(ctx, doc.branchId)) notFound()

  const rotaDoCliente = `${base}/clients/${doc.clienteId}`
  // Só caminho interno: um `?voltar=https://…` levaria para fora do sistema,
  // e o navegador lê `//x` e `/\x` como outro domínio.
  const destino = voltar && /^\/(?![/\\])/.test(voltar) ? voltar : `${rotaDoCliente}?aba=documentos`

  return (
    <TelaDeAssinatura
      podeColher={podeColher}
      voltar={destino}
      rotaDoCliente={rotaDoCliente}
      doc={{
        id:         doc.resumo.id,
        titulo:     doc.resumo.titulo,
        tipo:       doc.resumo.tipo,
        status:     doc.resumo.status,
        faltando:   doc.resumo.faltando,
        codigo:     doc.resumo.codigo,
        motivo:     doc.resumo.motivo,
        cliente:    { nome: doc.cliente.nome },
        conteudo:   doc.conteudo,
        pdfUrl:     doc.pdfUrl,
        imagens:    doc.imagens,
        assinatura: doc.assinatura,
      }}
    />
  )
}
