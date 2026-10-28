'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, alcancaUnidade, can, isOwnScope } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ehAnexoClinico } from '@/lib/clientes/anexos'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { CLIENT_DOCS_BUCKET, ensurePrivateBucket } from '@/lib/storage'
import { gravar, ler, tentar } from '@/lib/db'

const BUCKET        = CLIENT_DOCS_BUCKET
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

const SEM_ACESSO_COMUM   = 'Seu cargo não libera anexar documentos do cadastro.'
const SEM_ACESSO_CLINICO = 'Anexo clínico (exame, laudo, foto clínica, receita…) é prontuário: é preciso o módulo Prontuário — e, com "só os meus", ser cliente que você atende.'

/**
 * Quem mexe num anexo: o que é CLÍNICO é prontuário — o módulo dele decide,
 * com o mesmo alcance da ficha ("só os meus" = cliente que este profissional
 * atendeu); o resto é o cadastro (`clients: MANAGE`). Até 2026-10-20 tudo
 * pedia o cadastro, e a profissional (Clientes = Ver) não tinha onde anexar a
 * foto clínica — a simulação de um dia de clínica achou.
 */
async function recusaDoAnexo(ctx: TenantContext, admin: SupabaseClient, categoria: string | null, clientId: string): Promise<string | null> {
  if (!ehAnexoClinico(categoria)) return can(ctx, 'clients', 'MANAGE') ? null : SEM_ACESSO_COMUM
  if (!can(ctx, 'medical_records', 'MANAGE')) return SEM_ACESSO_CLINICO
  if (!isOwnScope(ctx, 'medical_records')) return null
  if (!ctx.internalUserId) return SEM_ACESSO_CLINICO
  const meu = await ler(admin.from('appointments').select('id')
    .eq('client_id', clientId).eq('professional_id', ctx.internalUserId).limit(1), 'conferir se o cliente é atendido por você')
  return (meu ?? []).length ? null : SEM_ACESSO_CLINICO
}

export async function uploadClientDocument(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()

  const file      = formData.get('file') as File | null
  const name      = (formData.get('name') as string | null)?.trim()
  const category  = (formData.get('category') as string | null) ?? 'outro'
  const clientId  = formData.get('client_id') as string | null
  const branchId  = formData.get('branch_id') as string | null
  const slug      = formData.get('slug') as string | null
  // A foto clínica pela tela do atendimento (A30, 2026-10-27): o anexo fica
  // ligado a ele. Vazio = anexado pela ficha.
  const appointmentId = ((formData.get('appointment_id') as string | null) ?? '').trim() || null

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

  // Exame, laudo, foto clínica, receita e termo são prontuário (2026-10-03).
  const recusa = await recusaDoAnexo(ctx, admin, category, clientId)
  if (recusa) return { error: recusa }

  // O atendimento vem do formulário: é desta cliente, desta rede e de uma
  // unidade ao alcance — senão a foto iria para o atendimento de outra pessoa.
  if (appointmentId) {
    const ag = await ler(admin.from('appointments').select('id, client_id, branch_id, branches!inner(tenant_id)')
      .eq('id', appointmentId).maybeSingle(), 'conferir o atendimento do anexo')
    const redeDoAtendimento = (ag?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!ag || redeDoAtendimento !== ctx.tenantId || !alcancaUnidade(ctx, ag.branch_id as string)) return { error: 'Atendimento não encontrado.' }
    if (ag.client_id !== clientId) return { error: 'Este atendimento não é desta cliente.' }
  }

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
    appointment_id: appointmentId,
  })

  if (dbError) {
    // Desfaz o upload. `tentar`: o erro que importa é o do registro, que vai
    // para a tela; um arquivo que sobrar fica registrado no log para limpeza.
    await tentar(admin.storage.from(BUCKET).remove([path]), 'desfazer o upload do documento')
    return { error: `Erro ao salvar: ${dbError.message}` }
  }

  // Os dois portais mostram a mesma ficha: só o da unidade era revalidado, e
  // no /admin o documento anexado não aparecia até recarregar a página.
  revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  if (appointmentId) {
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/admin/agenda/${appointmentId}`)
  }
  return {}
}

export async function deleteClientDocument(
  documentId: string,
  slug: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()

  const admin = createAdminClient()

  // Verify ownership via branch → tenant
  const doc = await ler(admin
    .from('client_documents')
    .select('id, file_path, branch_id, category, client_id, appointment_id, branches!inner(tenant_id)')
    .eq('id', documentId)
    .is('apagado_em', null)
    .maybeSingle(), 'buscar o documento')

  if (!doc) return { error: 'Documento não encontrado.' }

  const tenantId = (doc.branches as unknown as { tenant_id: string }).tenant_id
  // E a unidade onde o documento foi posto, ao alcance de quem apaga (§11).
  if (tenantId !== ctx.tenantId || !alcancaUnidade(ctx, doc.branch_id as string)) return { error: 'Acesso negado.' }
  if (await recusaDoAnexo(ctx, admin, doc.category as string, doc.client_id as string)) return { error: 'Acesso negado.' }

  // Anexo CLÍNICO é prontuário, e prontuário não se deleta (§14): sai das
  // telas, e a linha e o arquivo ficam, com quem apagou e quando. O nome é o
  // do ctx — leva a marca "via suporte". O comum (RG, comprovante) se apaga.
  if (ehAnexoClinico(doc.category as string)) {
    await gravar(admin.from('client_documents')
      .update({ apagado_em: new Date().toISOString(), apagado_por: ctx.internalUserId, apagado_por_nome: ctx.userName || null })
      .eq('id', documentId).is('apagado_em', null)
      .select('id'), 'apagar o documento')
    revalidatePath(`/${slug}/clients/${clientId}`)
    revalidatePath(`/admin/clients/${clientId}`)
    if (doc.appointment_id) {
      revalidatePath(`/${slug}/agenda/${doc.appointment_id}`)
      revalidatePath(`/admin/agenda/${doc.appointment_id}`)
    }
    return {}
  }

  if (doc.file_path) {
    await gravar(admin.storage.from(BUCKET).remove([doc.file_path]), 'apagar o arquivo do documento')
  }

  await gravar(admin.from('client_documents').delete().eq('id', documentId), 'apagar o documento')

  revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}
