import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchProfessionals } from '@/lib/cached-queries'
import { getTreatmentPlanSessions } from '@/actions/treatment-plans'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'
import { ler } from '@/lib/db'

/**
 * Monta o que o `CheckoutWizard` precisa para um plano.
 *
 * Mora aqui, e não dentro da página, porque o mesmo wizard roda em dois lugares:
 * na página `/checkout/[planId]` e dentro da tela do atendimento, quando quem
 * atende fecha a venda sem sair da sala.
 *
 * ⚠️ Não é um arquivo `'use server'`: quem chama já conferiu a permissão. A
 * autorização mora na página e na action, não aqui.
 */
export async function montarCheckoutPlan(
  planId:   string,
  branchId: string,
  branchName: string,
  tenantId: string,
): Promise<{ plan?: CheckoutPlan; clientId?: string; error?: string }> {
  const admin = createAdminClient()

  const planRaw = await ler(admin
    .from('treatment_plans')
    .select('id, status, professional_notes, client_id, branch_id, clients(name, document, phone)')
    .eq('id', planId)
    .eq('branch_id', branchId)
    .maybeSingle(), 'carregar o plano do checkout')

  if (!planRaw) return { error: 'Plano não encontrado.' }
  if (planRaw.status === 'ACCEPTED' || planRaw.status === 'COMPLETED') {
    return { error: 'Este plano já foi fechado.', clientId: planRaw.client_id as string }
  }

  type RawClient = { name: string; document: string | null; phone: string | null }
  const cli = planRaw.clients as unknown as RawClient | null

  const [{ sessions, total }, professionalsRaw, { data: medRecordRaw }, { data: branchesRaw }] = await Promise.all([
    getTreatmentPlanSessions(planId),
    getCachedBranchProfessionals(branchId, tenantId),
    admin.from('medical_records').select('id').eq('client_id', planRaw.client_id).maybeSingle(),
    admin.from('branches').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
  ])

  return {
    clientId: planRaw.client_id as string,
    plan: {
      id:                planRaw.id as string,
      status:            planRaw.status as string,
      professionalNotes: (planRaw.professional_notes as string | null) ?? null,
      clientName:        cli?.name ?? '—',
      clientDocument:    cli?.document ?? null,
      clientPhone:       cli?.phone ?? null,
      clientId:          planRaw.client_id as string,
      branchName,
      medicalRecordId:   medRecordRaw?.id ?? null,
      sessions,
      total,
      professionals:    ((professionalsRaw ?? []) as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })),
      branches:         ((branchesRaw      ?? []) as { id: string; name: string }[]).map(b => ({ id: b.id, name: b.name })),
      currentBranchId:  branchId,
    },
  }
}
