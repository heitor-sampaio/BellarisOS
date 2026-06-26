'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helper: valida que o branchId pertence ao tenant ────────────
async function resolveBranch(tenantId: string, branchId: string) {
  const supabase = await createSupabase()
  const { data } = await supabase
    .from('branches')
    .select('id, slug')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .single()
  return data
}

// ─── Criar cliente ────────────────────────────────────────────────
export async function addClient(
  _prev: { error?: string; success?: boolean; clientId?: string } | undefined,
  formData: FormData,
) {
  const ctx     = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const branchId = formData.get('_branchId') as string
  const slug     = formData.get('_slug') as string
  const branch   = await resolveBranch(ctx.tenantId!, branchId)
  if (!branch) return { error: 'Filial inválida.' }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim()
  const email     = (formData.get('email') as string)?.trim() || null
  const rawDoc    = (formData.get('document') as string)?.trim() || null
  const document  = rawDoc ? rawDoc.replace(/\D/g, '') : null
  const birthDate = (formData.get('birth_date') as string) || null
  const gender    = (formData.get('gender') as string) || null
  const notes     = (formData.get('notes') as string)?.trim() || null
  const tagsRaw   = formData.get('tags') as string
  const tags      = tagsRaw ? JSON.parse(tagsRaw) : []

  if (!name || !phone) return { error: 'Nome e telefone são obrigatórios.' }

  const supabase = await createSupabase()

  // CPF único por rede
  if (document) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', ctx.tenantId!)
      .eq('document', document)
      .maybeSingle()
    if (existing) return { error: 'Já existe um cliente com este CPF nesta rede.' }
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      tenant_id:  ctx.tenantId!,
      branch_id:  branchId,
      name,
      phone,
      email,
      document,
      birth_date: birthDate,
      gender,
      notes,
      tags,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !client) return { error: 'Erro ao cadastrar cliente. Tente novamente.' }

  // LoyaltyAccount criada automaticamente
  await supabase.from('loyalty_accounts').insert({ client_id: client.id })

  revalidatePath(`/${slug}/clients`)
  return { success: true, clientId: client.id }
}

// ─── Atualizar dados do cliente ────────────────────────────────────
export async function updateClient(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const clientId = formData.get('_clientId') as string
  const slug     = formData.get('_slug') as string
  const supabase = await createSupabase()

  // Confirma que o cliente pertence à rede
  const { data: existing } = await supabase
    .from('clients')
    .select('id, document')
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!existing) return { error: 'Cliente não encontrado.' }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim()
  const email     = (formData.get('email') as string)?.trim() || null
  const rawDoc    = (formData.get('document') as string)?.trim() || null
  const document  = rawDoc ? rawDoc.replace(/\D/g, '') : null
  const birthDate = (formData.get('birth_date') as string) || null
  const gender    = (formData.get('gender') as string) || null
  const notes     = (formData.get('notes') as string)?.trim() || null
  const tagsRaw   = formData.get('tags') as string
  const tags      = tagsRaw ? JSON.parse(tagsRaw) : []

  if (!name || !phone) return { error: 'Nome e telefone são obrigatórios.' }

  // CPF único por rede (se alterado)
  if (document && document !== existing.document) {
    const { data: conflict } = await supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', ctx.tenantId!)
      .eq('document', document)
      .maybeSingle()
    if (conflict) return { error: 'Já existe um cliente com este CPF nesta rede.' }
  }

  const { error } = await supabase
    .from('clients')
    .update({ name, phone, email, document, birth_date: birthDate, gender, notes, tags })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: 'Erro ao atualizar cliente.' }

  revalidatePath(`/${slug}/clients/${clientId}`)
  return { success: true }
}

// ─── Conceder crédito interno ──────────────────────────────────────
export async function grantInternalCredit(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'FINANCIAL'])

  const clientId    = (formData.get('client_id')   as string | null)?.trim()
  const branchId    = (formData.get('branch_id')   as string | null)?.trim()
  const slug        = (formData.get('slug')         as string | null)?.trim()
  const rawAmount   = (formData.get('amount')       as string | null)?.replace(',', '.')
  const description = (formData.get('description') as string | null)?.trim()

  const amount = parseFloat(rawAmount ?? '')
  if (!clientId || !branchId)       return { error: 'Dados inválidos.' }
  if (!description)                  return { error: 'Informe o motivo do crédito.' }
  if (isNaN(amount) || amount <= 0)  return { error: 'Informe um valor maior que zero.' }

  // Verify client belongs to this tenant's branch
  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) return { error: 'Filial não encontrada.' }

  const admin = createAdminClient()
  const { error: dbErr } = await admin.from('internal_credits').insert({
    client_id:   clientId,
    branch_id:   branchId,
    amount,
    description,
  })
  if (dbErr) return { error: `Erro ao conceder crédito: ${dbErr.message}` }

  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}

// ─── Atualizar dados cadastrais (CPF + endereço) ──────────────────
export async function updateClientContactData(
  clientId: string,
  data: {
    document:           string | null
    phone:              string | null
    email:              string | null
    birthDate:          string | null
    zipCode:            string | null
    address:            string | null
    addressNumber:      string | null
    addressComplement:  string | null
    neighborhood:       string | null
    city:               string | null
    state:              string | null
    tags?:              string[]
  },
  slug: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const admin = createAdminClient()

  // Verifica duplicidade de CPF no tenant (exceto o próprio cliente)
  if (data.document) {
    const cpfDigits = data.document.replace(/\D/g, '')
    const { data: dup } = await admin
      .from('clients')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('document', cpfDigits)
      .neq('id', clientId)
      .maybeSingle()
    if (dup) return { error: `CPF já cadastrado para ${(dup as { name: string }).name}.` }
  }

  const { error } = await admin
    .from('clients')
    .update({
      document:            data.document?.replace(/\D/g, '') || null,
      phone:               data.phone?.replace(/\D/g, '') || null,
      email:               data.email?.trim() || null,
      birth_date:          data.birthDate || null,
      zip_code:            data.zipCode?.replace(/\D/g, '') || null,
      address:             data.address || null,
      address_number:      data.addressNumber || null,
      address_complement:  data.addressComplement || null,
      neighborhood:        data.neighborhood || null,
      city:                data.city || null,
      state:               data.state || null,
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
      updated_at:          new Date().toISOString(),
    })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: error.message }
  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}

// ─── Buscar cliente por CPF (para autocomplete interno) ───────────
export async function lookupClientByCpf(
  cpf: string,
  currentClientId: string,
): Promise<{ found: boolean; isSelf: boolean; name?: string }> {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return { found: false, isSelf: false }

  const { data } = await admin
    .from('clients')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId!)
    .eq('document', digits)
    .maybeSingle()

  if (!data) return { found: false, isSelf: false }
  const isSelf = (data as { id: string }).id === currentClientId
  return { found: true, isSelf, name: (data as { name: string }).name }
}

// ─── Ativar / desativar cliente ────────────────────────────────────
export async function toggleClientStatus(clientId: string, isActive: boolean, slug: string) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

  const supabase = await createSupabase()
  await supabase
    .from('clients')
    .update({ is_active: isActive })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath(`/${slug}/clients`)
  revalidatePath(`/${slug}/clients/${clientId}`)
}
