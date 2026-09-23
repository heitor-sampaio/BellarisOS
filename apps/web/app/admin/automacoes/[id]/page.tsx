import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { getAutomacao } from '@/actions/automacoes'
import { EditorDeAutomacao } from '@/components/admin/automacoes/editor'

export default async function AutomacaoPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')

  const { id } = await params
  const { automacao, error } = await getAutomacao(id)

  // Automação de outra rede e automação inexistente dão o mesmo 404, de
  // propósito: a diferença entre as duas respostas contaria que o id existe.
  if (error || !automacao) notFound()

  return (
    <EditorDeAutomacao
      automacao={automacao}
      podeEditar={can(ctx, 'automations', 'MANAGE')}
    />
  )
}
