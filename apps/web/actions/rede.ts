'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { maskPhone } from '@estetica-os/utils'
import { lerVisibilidade, type VisibilidadeDoInbox } from '@/lib/inbox/visibilidade'

/** O que a tela de Configurações → Geral mostra da rede. */
export interface DadosDaRede {
  id:        string
  name:      string
  slug:      string
  document:  string | null
  email:     string | null
  phone:     string | null
  website:   string | null
  /** Até quantas horas antes a cliente cancela ou remarca pelo portal (2026-10-21). */
  prazoPortalHoras: number
  /** Por quantos dias o plano PROPOSTO vale (o "Válido até" do app, D-18). */
  validadeDoPlanoDias: number
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
      .select('id, name, slug, document, email, phone, website, plan_name, plan_status, created_at, portal_prazo_alteracao_horas, plano_validade_dias')
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
    prazoPortalHoras: Number(t.portal_prazo_alteracao_horas ?? 24),
    validadeDoPlanoDias: Number((t as { plano_validade_dias?: number }).plano_validade_dias ?? 30),
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

  const prazo = Number(texto('portal_prazo_alteracao_horas') ?? 24)
  if (!Number.isInteger(prazo) || prazo < 0 || prazo > 720) {
    return { error: 'O prazo do portal vai de 0 a 720 horas.' }
  }

  const validadeDoPlano = Number(texto('plano_validade_dias') ?? 30)
  if (!Number.isInteger(validadeDoPlano) || validadeDoPlano < 1 || validadeDoPlano > 365) {
    return { error: 'A validade do plano proposto vai de 1 a 365 dias.' }
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
        // No formato da tela (J-2): "(48) 3333-4444", também o que veio com o
        // 55 ou só com dígitos — salvar não muda o que a pessoa vê.
        phone:    telefoneDaRede(texto('phone')),
        website,
        portal_prazo_alteracao_horas: prazo,
        plano_validade_dias: validadeDoPlano,
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

/** O telefone da rede no formato da tela; o que não é número nacional fica como veio. */
function telefoneDaRede(v: string | null): string | null {
  return v ? maskPhone(v) : null
}

/**
 * Com escopo OWN no CRM, o que decide se uma conversa do inbox aparece: a
 * pessoa ou a thread. Os textos e a regra moram em `lib/inbox/visibilidade.ts`.
 *
 * Pede `roles: MANAGE`, não `settings`: é refino do escopo "só os próprios", e
 * quem decide quem vê o quê é quem monta os cargos.
 */
export async function lerVisibilidadeDoInbox(): Promise<VisibilidadeDoInbox> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'roles', 'VIEW')
  const t = await ler(
    createAdminClient().from('tenants').select('inbox_visibilidade').eq('id', ctx.tenantId!).maybeSingle(),
    'ler a visibilidade do inbox',
  )
  return lerVisibilidade((t as { inbox_visibilidade?: string } | null)?.inbox_visibilidade)
}

export async function atualizarVisibilidadeDoInbox(
  modo: string,
): Promise<{ error: string } | { success: true }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'roles', 'MANAGE')

  if (modo !== 'pessoa' && modo !== 'conversa') return { error: 'Opção inválida.' }

  await gravar(
    createAdminClient()
      .from('tenants')
      .update({ inbox_visibilidade: modo, updated_at: new Date().toISOString() })
      .eq('id', ctx.tenantId!)
      .select('id')
      .single(),
    'salvar a visibilidade do inbox',
  )

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { success: true }
}
