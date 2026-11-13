import { redirect } from 'next/navigation'
import { quantasUnidadesAtivas } from '@/lib/unidades/da-tela'
import { getTenantContext, assertPermission, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SetupWizard } from '@/components/setup/setup-wizard'
import { ler } from '@/lib/db'
import { comAviso } from '@/lib/aviso-da-url'

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  const { passo } = await searchParams
  const ctx = await getTenantContext()
  // A cliente que abre /setup vai ao portal dela (J-67): era a tela de "sem
  // acesso", com HTTP 500. Quem é da equipe segue a trava de sempre.
  if (ctx.isClient) redirect('/auth/redirect')
  assertPermission(ctx, 'settings', 'MANAGE')
  // O setup é da clínica toda (C61, F70; H7): a gerente de unidade fixa abria
  // o assistente e as actions recusavam no fim. Vai ao painel da unidade dela.
  if (ctx.branchId !== null) {
    const dela = await ler(createAdminClient().from('branches').select('slug')
      .eq('id', ctx.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade') as { slug: string } | null
    redirect(dela?.slug ? comAviso(`/${dela.slug}/dashboard`, 'setup-da-rede') : '/')
  }

  const admin = createAdminClient()
  const [tenant, unidades] = await Promise.all([
    ler(admin
      .from('tenants')
      .select('name, document, phone, website, onboarding_completed_at')
      .eq('id', ctx.tenantId!)
      .single(), 'buscar a rede'),
    quantasUnidadesAtivas(ctx.tenantId!),
  ])

  if (tenant?.onboarding_completed_at) redirect('/admin/dashboard')

  // Retoma de onde parou (simulação de 2026-10-20): o que já foi gravado vem
  // preenchido — o campo vazio gravava nulo e apagava o telefone — e a rede
  // que já tem unidade vai direto ao fim, em vez de criar uma segunda.
  return (
    <SetupWizard
      rede={{
        nome:      (tenant?.name as string | null) ?? 'Minha Clínica',
        documento: (tenant?.document as string | null) ?? '',
        telefone:  (tenant?.phone as string | null) ?? '',
        site:      (tenant?.website as string | null) ?? '',
      }}
      temUnidade={unidades > 0}
      noPassoDaUnidade={passo === 'unidade'}
      // Os próximos passos do fim (A1 da 7ª): o de uma funcionalidade fora do plano não aparece.
      foraDoPlano={(['fichas', 'documentos', 'fidelidade', 'oportunidades'] as const).filter(r => !temRecurso(ctx, r))}
    />
  )
}
