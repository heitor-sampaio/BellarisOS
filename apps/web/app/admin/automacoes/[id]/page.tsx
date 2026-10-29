import { notFound } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { getAutomacao } from '@/actions/automacoes'
import { EditorDeAutomacao } from '@/components/admin/automacoes/editor'

export default async function AutomacaoPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')

  const { id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
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
