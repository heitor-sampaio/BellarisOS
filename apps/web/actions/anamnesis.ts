'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function saveGeneralAnamnesis(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

  const clientId = (formData.get('client_id') as string | null)?.trim()
  const branchId = (formData.get('branch_id') as string | null)?.trim()
  const slug     = (formData.get('slug')      as string | null)?.trim()

  if (!clientId || !branchId) return { error: 'Dados inválidos.' }

  // Verify client belongs to this tenant's branch
  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) return { error: 'Filial não encontrada.' }

  const anamnesis = {
    skinType:                   (formData.get('skinType')                   as string) || '',
    allergies:                  ((formData.get('allergies')                 as string) || '').trim(),
    medications:                ((formData.get('medications')               as string) || '').trim(),
    healthConditions:           ((formData.get('healthConditions')          as string) || '').trim(),
    previousProcedures:         ((formData.get('previousProcedures')        as string) || '').trim(),
    isPregnantOrBreastfeeding:  formData.get('isPregnantOrBreastfeeding')   === 'true',
    useSunscreen:               formData.get('useSunscreen')                === 'true',
    observations:               ((formData.get('observations')              as string) || '').trim(),
    updatedAt:                  new Date().toISOString(),
    updatedBy:                  ctx.internalUserId,
  }

  const admin = createAdminClient()

  // Upsert medical_records row
  const { error } = await admin
    .from('medical_records')
    .upsert(
      { client_id: clientId, general_anamnesis: anamnesis },
      { onConflict: 'client_id' },
    )

  if (error) return { error: `Erro ao salvar: ${error.message}` }

  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}
