'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'

const BUCKET        = 'client-documents'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export async function uploadClientDocument(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

  const file      = formData.get('file') as File | null
  const name      = (formData.get('name') as string | null)?.trim()
  const category  = (formData.get('category') as string | null) ?? 'outro'
  const clientId  = formData.get('client_id') as string | null
  const branchId  = formData.get('branch_id') as string | null
  const slug      = formData.get('slug') as string | null

  if (!file || file.size === 0) return { error: 'Selecione um arquivo.' }
  if (!name)                    return { error: 'Informe o nome do documento.' }
  if (!clientId || !branchId)   return { error: 'Dados inválidos.' }
  if (file.size > MAX_FILE_SIZE) return { error: 'Arquivo deve ter no máximo 20 MB.' }

  // Ensure client belongs to this tenant
  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) return { error: 'Filial não encontrada.' }

  const admin = createAdminClient()

  // Ensure storage bucket exists
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false })
  }

  // Upload file
  const ext      = file.name.split('.').pop() ?? 'bin'
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const path     = `${branchId}/${clientId}/${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) return { error: `Falha no upload: ${uploadError.message}` }

  // Get public URL (signed, valid 10 years — or use signed URL per download)
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)

  // Insert record
  const { error: dbError } = await admin.from('client_documents').insert({
    client_id:   clientId,
    branch_id:   branchId,
    name,
    category,
    file_url:    urlData.publicUrl,
    file_name:   file.name,
    file_size:   file.size,
    mime_type:   file.type || `application/${ext}`,
    uploaded_by: ctx.internalUserId,
  })

  if (dbError) {
    // rollback storage upload
    await admin.storage.from(BUCKET).remove([path])
    return { error: `Erro ao salvar: ${dbError.message}` }
  }

  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}

export async function deleteClientDocument(
  documentId: string,
  slug: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const admin = createAdminClient()

  // Verify ownership via branch → tenant
  const { data: doc } = await admin
    .from('client_documents')
    .select('id, file_url, branch_id, branches!inner(tenant_id)')
    .eq('id', documentId)
    .single()

  if (!doc) return { error: 'Documento não encontrado.' }

  const tenantId = (doc.branches as unknown as { tenant_id: string }).tenant_id
  if (tenantId !== ctx.tenantId) return { error: 'Acesso negado.' }

  // Extract storage path from URL
  const urlParts = doc.file_url.split(`/${BUCKET}/`)
  if (urlParts.length === 2) {
    await admin.storage.from(BUCKET).remove([urlParts[1]])
  }

  await admin.from('client_documents').delete().eq('id', documentId)

  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}
