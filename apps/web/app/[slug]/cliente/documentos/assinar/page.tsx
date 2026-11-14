import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { documentosNoPortal } from '@/lib/documentos/leitura'
import { abertosNaTela } from '@/lib/documentos/momento'
import { AssinarJuntos } from '@/components/shared/assinar-juntos'
import { assinarJuntosNoPortal } from '@/actions/documentos-portal'
import { nomeParaSaudar } from '@/lib/saudacao'

/**
 * Portal do cliente → "Assinar todos" (CA4/DC3, Bloco Documentos leva 2): os
 * documentos que esperam a assinatura dela, numa lista; ela abre cada um e
 * assina UMA vez. Só os dela (`ctx.clientId`, a ficha da clínica do
 * endereço); com um só, a tela de um documento.
 */
export default async function AssinarTodosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const cliente = await ler(createAdminClient().from('clients').select('tenant_id').eq('id', ctx.clientId!).maybeSingle(),
    'buscar a ficha da cliente') as { tenant_id: string } | null
  const pendentes = (await documentosNoPortal(ctx.clientId!)).filter(d => d.status === 'PENDENTE')
  if (!cliente || pendentes.length === 0) redirect(`/${slug}/cliente/documentos`)
  if (pendentes.length === 1) redirect(`/${slug}/cliente/documentos/${pendentes[0]!.id}`)

  const documentos = await abertosNaTela(cliente.tenant_id, pendentes.map(d => d.id))
  if (documentos.length === 0) redirect(`/${slug}/cliente/documentos`)
  const assinante = documentos[0]!.cliente.assinante ?? documentos[0]!.cliente.nome

  return (
    <AssinarJuntos
      documentos={documentos}
      assinante={assinante}
      cabecalho={`${nomeParaSaudar(assinante) || assinante}, leia os documentos e assine uma vez no fim.`}
      final="Tudo certo! A clínica já recebeu os documentos assinados."
      assinar={assinarJuntosNoPortal}
      rodape={<Link href={`/${slug}/cliente/documentos`} className="btn-primary">Voltar aos documentos</Link>}
    />
  )
}
