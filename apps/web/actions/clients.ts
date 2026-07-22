'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertRole, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unitTag } from '@estetica-os/utils'
import { getAdsConfig } from '@/lib/ads/factory'
import { MetaAdsProvider } from '@/lib/ads/meta'
import type { MetaAdsConfig } from '@/lib/ads/types'

// --- Helper: valida que o branchId pertence ao tenant ------------
async function resolveBranch(tenantId: string, branchId: string) {
  const supabase = await createSupabase()
  const { data } = await supabase
    .from('branches')
    .select('id, slug, name')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .single()
  return data
}

// --- Criar cliente ------------------------------------------------
export async function addClient(
  _prev: { error?: string; success?: boolean; clientId?: string } | undefined,
  formData: FormData,
) {
  const ctx     = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const branchId = formData.get('_branchId') as string
  const slug     = formData.get('_slug') as string
  // _leadId presente = criação a partir da conversão de um lead (mesma regra do cadastro manual).
  const leadId   = (formData.get('_leadId') as string | null)?.trim() || null
  const branch   = await resolveBranch(ctx.tenantId!, branchId)
  if (!branch) return { error: 'Filial inválida.' }

  const name      = (formData.get('name') as string)?.trim()
  const phone     = (formData.get('phone') as string)?.trim()
  const email     = (formData.get('email') as string)?.trim().toLowerCase() || null
  const rawDoc    = (formData.get('document') as string)?.trim() || null
  const document  = rawDoc ? rawDoc.replace(/\D/g, '') : null
  const birthDate = (formData.get('birth_date') as string) || null
  const gender    = (formData.get('gender') as string) || null
  const notes     = (formData.get('notes') as string)?.trim() || null
  const tagsRaw   = formData.get('tags') as string
  const tags: string[] = tagsRaw ? JSON.parse(tagsRaw) : []

  // Unidade de cadastro entra como tag (métrica). O trigger de agendamento adiciona
  // as demais unidades que o cliente vier a frequentar.
  const unitName = (branch as { name?: string }).name
  if (unitName && !tags.includes(unitTag(unitName))) tags.push(unitTag(unitName))

  // Regra de negócio de CRIAR CLIENTE — idêntica no cadastro manual e na conversão de lead.
  if (!name || !phone)                     return { error: 'Nome e telefone são obrigatórios.' }
  if (!email)                              return { error: 'E-mail é obrigatório.' }
  if (!document || document.length !== 11) return { error: 'CPF válido é obrigatório.' }

  const admin = createAdminClient()

  // CPF único por rede. Na conversão (leadId), se o CPF já é de um cliente, liga o lead a ele (dedupe).
  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('document', document)
    .maybeSingle()
  if (existing) {
    if (leadId) {
      await admin.from('leads').update({ client_id: existing.id }).eq('id', leadId).eq('tenant_id', ctx.tenantId!)
      revalidatePath('/admin/crm')
      revalidatePath(`/${slug}/crm`)
      revalidateTag(`clients:${ctx.tenantId!}`, 'max')
      return { success: true, clientId: existing.id as string }
    }
    return { error: 'Já existe um cliente com este CPF nesta rede.' }
  }

  // 1) Conta de login PRIMEIRO (login = e-mail, senha = CPF). E-mail já usado → aborta sem criar cliente órfão.
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: document,
    email_confirm: true,
  })
  if (authErr || !authUser?.user) {
    const already = /already|registered|exists/i.test(authErr?.message ?? '')
    return { error: already ? 'Este e-mail já está em uso por outra conta.' : `Erro ao criar login do cliente: ${authErr?.message ?? 'desconhecido'}` }
  }
  const authId = authUser.user.id

  // 2) Cliente (com auth_id já vinculado)
  const { data: client, error } = await admin
    .from('clients')
    .insert({
      tenant_id: ctx.tenantId!, branch_id: branchId,
      name, phone, email, document,
      birth_date: birthDate, gender, notes, tags,
      is_active: true, auth_id: authId,
    })
    .select('id')
    .single()

  if (error || !client) {
    await admin.auth.admin.deleteUser(authId).catch(() => {})  // rollback do login órfão
    return { error: 'Erro ao cadastrar cliente. Tente novamente.' }
  }

  // 3) Claims do cliente + conta de fidelidade
  await admin.rpc('set_client_claims', { p_auth_id: authId, p_client_id: client.id })
  await admin.from('loyalty_accounts').insert({ client_id: client.id })

  // 4) Conversão de lead: liga o lead e dispara Meta CAPI (CompleteRegistration)
  if (leadId) {
    const { data: leadRow } = await admin
      .from('leads').select('fbclid').eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle()
    await admin.from('leads').update({ client_id: client.id }).eq('id', leadId).eq('tenant_id', ctx.tenantId!)
    getAdsConfig(ctx.tenantId!, 'meta_ads').then(metaConfig => {
      if (!metaConfig) return
      new MetaAdsProvider(metaConfig as MetaAdsConfig).sendCAPIEvent(
        { email, phone, fbclid: (leadRow as { fbclid?: string | null } | null)?.fbclid ?? null },
        'CompleteRegistration',
      ).catch(() => null)
    }).catch(() => null)
    revalidatePath('/admin/crm')
    revalidatePath(`/${slug}/crm`)
  }

  revalidatePath(`/${slug}/clients`)
  revalidateTag(`clients:${ctx.tenantId!}`, 'max')
  return { success: true, clientId: client.id as string }
}

// --- Atualizar dados do cliente ------------------------------------
export async function updateClient(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

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
  revalidateTag(`clients:${ctx.tenantId!}`, 'max')
  return { success: true }
}

// --- Conceder crédito interno --------------------------------------
export async function grantInternalCredit(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'financial', 'MANAGE')

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

// --- Atualizar dados cadastrais (CPF + endereço) ------------------
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
  assertPermission(ctx, 'clients', 'MANAGE')

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
    if (dup) return { error: `CPF já cadastrado para ${dup.name}.` }
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
  revalidateTag(`clients:${ctx.tenantId!}`, 'max')
  return {}
}

// --- Buscar cliente por CPF (para autocomplete interno) -----------
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
  const isSelf = data.id === currentClientId
  return { found: true, isSelf, name: data.name }
}

// --- Atualizar próprios dados (CLIENT) ----------------------------
export async function updateClientSelf(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['CLIENT'])

  const admin   = createAdminClient()
  const phone   = (formData.get('phone') as string)?.replace(/\D/g, '') || null
  const email   = (formData.get('email') as string)?.trim() || null
  const zip     = (formData.get('zip_code') as string)?.replace(/\D/g, '') || null
  const addr    = (formData.get('address') as string)?.trim() || null
  const addrNum = (formData.get('address_number') as string)?.trim() || null
  const addrCmp = (formData.get('address_complement') as string)?.trim() || null
  const hood    = (formData.get('neighborhood') as string)?.trim() || null
  const city    = (formData.get('city') as string)?.trim() || null
  const state   = (formData.get('state') as string)?.trim() || null

  const { error } = await admin
    .from('clients')
    .update({
      phone,
      email,
      zip_code:           zip,
      address:            addr,
      address_number:     addrNum,
      address_complement: addrCmp,
      neighborhood:       hood,
      city,
      state,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', ctx.clientId!)

  if (error) return { error: error.message }
  return { success: true }
}

// --- Ativar / desativar cliente ------------------------------------
export async function toggleClientStatus(clientId: string, isActive: boolean, slug: string) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const supabase = await createSupabase()
  await supabase
    .from('clients')
    .update({ is_active: isActive })
    .eq('id', clientId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath(`/${slug}/clients`)
  revalidatePath(`/${slug}/clients/${clientId}`)
  revalidateTag(`clients:${ctx.tenantId!}`, 'max')
}
