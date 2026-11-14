import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade, can } from '@/lib/auth'
import { documentoParaExibir } from '@/lib/documentos/leitura'
import { TelaDeAssinatura } from '@/components/shared/tela-de-assinatura'
import { clienteNoEscopo } from '@/lib/clientes/atendida-por'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { caminhoInterno } from '@/lib/origem'
import { documentosDoMomento, abertosNaTela } from '@/lib/documentos/momento'
import type { JuntosNaAssinatura } from '@/components/shared/tela-de-assinatura'

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
  // Com o prontuário "só os meus", só de cliente que ela atende (2026-10-29).
  if (!(await clienteNoEscopo(createAdminClient(), ctx, 'medical_records', doc.clienteId))) notFound()

  const rotaDoCliente = `${base}/clients/${doc.clienteId}`
  // Só caminho interno: um `?voltar=https://…` levaria para fora do sistema,
  // e o navegador lê `//x` e `/\x` como outro domínio.
  const destino = caminhoInterno(voltar ?? null, `${rotaDoCliente}?aba=documentos`)

  // DC3 (leva 2): quem vai colher entrega o aparelho com TODOS os abertos do
  // momento (o agendamento, o pacote, o plano) — e vê os que ficam de fora.
  let juntos: JuntosNaAssinatura | undefined
  if (podeColher && doc.resumo.status === 'PENDENTE') {
    const ancora = await ler(createAdminClient().from('issued_documents')
      .select('id, client_id, appointment_id, treatment_plan_id, client_package_id')
      .eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o momento do documento') as
      { id: string; client_id: string; appointment_id: string | null; treatment_plan_id: string | null; client_package_id: string | null } | null
    if (ancora) {
      const momento = await documentosDoMomento(ctx.tenantId!, ancora)
      juntos = {
        documentos: await abertosNaTela(ctx.tenantId!, momento.abertos.map(d => d.id).filter(x => x !== id)),
        fora: momento.fora,
      }
    }
  }

  return (
    <TelaDeAssinatura
      podeColher={podeColher}
      voltar={destino}
      rotaDoCliente={rotaDoCliente}
      juntos={juntos}
      doc={{
        id:         doc.resumo.id,
        titulo:     doc.resumo.titulo,
        tipo:       doc.resumo.tipo,
        status:     doc.resumo.status,
        faltando:   doc.resumo.faltando,
        codigo:     doc.resumo.codigo,
        motivo:     doc.resumo.motivo,
        cliente:    { nome: doc.cliente.nome, assinante: doc.cliente.assinante },
        conteudo:   doc.conteudo,
        pdfUrl:     doc.pdfUrl,
        imagens:    doc.imagens,
        assinatura: doc.assinatura,
      }}
    />
  )
}
