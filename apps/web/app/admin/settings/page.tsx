import { getTenantContext, assertAnyPermission } from '@/lib/auth'
import { Configuracoes, ABAS_DA_REDE } from '@/app/_shared/configuracoes'

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; meta_step?: string; meta_error?: string; meta_error_reason?: string }>
}) {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, ['settings', 'roles', 'forms'], 'MANAGE')

  const { tab, meta_step, meta_error, meta_error_reason } = await searchParams

  return (
    <Configuracoes
      basePath="/admin/settings"
      abas={ABAS_DA_REDE}
      abaPedida={tab}
      subtitulo="Preferências globais da rede"
      atalhoParaEquipe
      metaStep={meta_step}
      metaError={meta_error}
      metaErrorReason={meta_error_reason}
    />
  )
}
