'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'

/** O que a tela de Configurações → Geral mostra da rede. */
export interface DadosDaRede {
  id:        string
  name:      string
  slug:      string
  document:  string | null
  email:     string | null
  phone:     string | null
  website:   string | null
  /** Somente leitura — quem muda isso é a assinatura, não esta tela. */
  planName:   string | null
  planStatus: string | null
  criadaEm:   string
}

export async function lerDadosDaRede(): Promise<DadosDaRede | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'VIEW')

  const t = await ler(
    createAdminClient()
      .from('tenants')
      .select('id, name, slug, document, email, phone, website, plan_name, plan_status, created_at')
      .eq('id', ctx.tenantId!)
      .maybeSingle(),
    'carregar os dados da rede',
  )
  if (!t) return null

  return {
    id:         t.id as string,
    name:       (t.name as string) ?? '',
    slug:       (t.slug as string) ?? '',
    document:   (t.document as string | null) ?? null,
    email:      (t.email as string | null) ?? null,
    phone:      (t.phone as string | null) ?? null,
    website:    (t.website as string | null) ?? null,
    planName:   (t.plan_name as string | null) ?? null,
    planStatus: (t.plan_status as string | null) ?? null,
    criadaEm:   t.created_at as string,
  }
}

/**
 * Edita os dados da rede.
 *
 * O `slug` NÃO entra: ele é o endereço do portal (`/{slug}/…`), está em links
 * já mandados, em QR Code impresso e no que o cliente guardou no navegador.
 * Trocá-lo por um campo de formulário quebraria tudo isso em silêncio; quando
 * for preciso mudar, é migração, não edição.
 *
 * O plano também não: quem o define é a assinatura.
 */
export async function atualizarDadosDaRede(
  _prev: { error: string } | { success: true } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const texto = (k: string) => (formData.get(k) as string | null)?.trim() || null

  const name = texto('name')
  if (!name) return { error: 'O nome da rede é obrigatório.' }

  const email = texto('email')?.toLowerCase() ?? null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'E-mail inválido.' }
  }

  // Só os dígitos: CNPJ gravado com máscara faz "11.222.333/0001-81" e
  // "11222333000181" serem dois documentos diferentes para qualquer busca.
  const documento = texto('document')?.replace(/\D/g, '') || null
  if (documento && documento.length !== 14 && documento.length !== 11) {
    return { error: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos.' }
  }

  let website = texto('website')
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`

  await gravar(
    createAdminClient()
      .from('tenants')
      .update({
        name,
        document: documento,
        email,
        phone:    texto('phone'),
        website,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.tenantId!)
      .select('id')
      .single(),
    'salvar os dados da rede',
  )

  revalidatePath('/admin/settings')
  return { success: true }
}
