'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { CLIENT_DOCS_BUCKET, ensurePrivateBucket } from '@/lib/storage'
import { gravar, ler } from '@/lib/db'

const BUCKET        = CLIENT_DOCS_BUCKET
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export async function uploadClientDocument(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

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
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) return { error: 'Filial não encontrada.' }

  const admin = createAdminClient()

  // A filial era conferida; o cliente, não — com a própria filial e o id de um
  // cliente de outra rede, o documento ia para a ficha dele. Achado em
  // 2026-09-27. Antes do upload, para nada subir para quem não é desta rede.
  const cliente = await ler(admin
    .from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir o cliente do documento')
  if (!cliente) return { error: 'Cliente não encontrado.' }

  // Bucket PRIVADO (LGPD) — nunca público. Guardamos o path; servimos por signed URL.
  await ensurePrivateBucket(BUCKET)

  // Upload file
  const ext      = file.name.split('.').pop() ?? 'bin'
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const path     = `${branchId}/${clientId}/${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) return { error: `Falha no upload: ${uploadError.message}` }

  // Insert record — guardamos o PATH, não uma URL pública
  const { error: dbError } = await admin.from('client_documents').insert({
    client_id:   clientId,
    branch_id:   branchId,
    name,
    category,
    file_path:   path,
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

  // Os dois portais mostram a mesma ficha: só o da unidade era revalidado, e
  // no /admin o documento anexado não aparecia até recarregar a página.
  revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}

export async function deleteClientDocument(
  documentId: string,
  slug: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const admin = createAdminClient()

  // Verify ownership via branch → tenant
  const doc = await ler(admin
    .from('client_documents')
    .select('id, file_path, branch_id, branches!inner(tenant_id)')
    .eq('id', documentId)
    .single(), 'buscar o documento')

  if (!doc) return { error: 'Documento não encontrado.' }

  const tenantId = (doc.branches as unknown as { tenant_id: string }).tenant_id
  if (tenantId !== ctx.tenantId) return { error: 'Acesso negado.' }

  if (doc.file_path) {
    await gravar(admin.storage.from(BUCKET).remove([doc.file_path]), 'apagar o arquivo do documento')
  }

  await gravar(admin.from('client_documents').delete().eq('id', documentId), 'apagar o documento')

  revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}
