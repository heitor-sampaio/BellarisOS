import { redirect } from 'next/navigation'
import { getTenantContext, assertAnyPermission } from '@/lib/auth'
import { MODULOS_DAS_ABAS } from '@/lib/configuracoes/abas'
import { Configuracoes, ABAS_DA_REDE } from '@/app/_shared/configuracoes'

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; meta_step?: string; meta_error?: string; meta_error_reason?: string }>
}) {
  const { tab, meta_step, meta_error, meta_error_reason } = await searchParams
  // CF2 (2026-11-14): o Eventos saiu daqui — é o "O que já aconteceu" das Automações.
  if (tab === 'eventos') redirect('/admin/automacoes/eventos')

  const ctx = await getTenantContext()
  // `financial` só alcança a aba de comissões, `clients`/`crm` a de Importações
  // (cada aba confere o seu módulo).
  assertAnyPermission(ctx, MODULOS_DAS_ABAS, 'MANAGE')

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
