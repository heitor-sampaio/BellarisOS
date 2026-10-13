import { notFound } from 'next/navigation'
import { getTenantContext, assertAnyPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { MODULOS_DAS_ABAS } from '@/lib/configuracoes/abas'
import { Configuracoes, ABAS_DA_UNIDADE } from '@/app/_shared/configuracoes'

/**
 * Configurações no portal da unidade.
 *
 * O conteúdo é da REDE — cargos, modelos de ficha e integrações valem para
 * todas as unidades — e é por isso que a faixa de aviso está aqui. A tela
 * existe mesmo assim porque quem tem unidade fixa não entra em `/admin`: sem
 * ela, dar `settings`, `roles` ou `forms` em MANAGE a uma gerente não mudava
 * nada. Fora daqui ficam "Unidades" (o card leva a `/admin/branches`) e
 * "LGPD" (a lista é da rede inteira, sem recorte por unidade).
 *
 * A checagem é própria porque o layout protege a navegação, não a URL.
 */
export default async function BranchSettingsPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; meta_step?: string; meta_error?: string; meta_error_reason?: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, MODULOS_DAS_ABAS.filter(m => m !== 'financial'), 'MANAGE')
  // A unidade da tela: é para ela que a aba Importações cadastra os clientes.
  const unidade = await ler(createAdminClient().from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()

  const { tab, meta_step, meta_error, meta_error_reason } = await searchParams

  return (
    <Configuracoes
      basePath={`/${slug}/settings`}
      abas={ABAS_DA_UNIDADE}
      abaPedida={tab}
      subtitulo="Cargos, modelos de ficha e integrações da rede"
      aviso="Estas configurações valem para a rede inteira. Alterar aqui muda para todas as unidades."
      atalhoParaEquipe={false}
      unidadeDaTela={{ id: unidade.id as string, nome: unidade.name as string }}
      metaStep={meta_step}
      metaError={meta_error}
      metaErrorReason={meta_error_reason}
    />
  )
}
