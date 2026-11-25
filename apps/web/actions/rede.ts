'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { recusaDaConfigDaRede } from '@/lib/configuracao-da-rede'
import { recusaDoPrazoDoPortal, recusaDaValidadeDoPlano } from '@/lib/configuracoes/prazos-da-rede'
import { O_QUE_A_CLIENTE_AVALIA, oQueAvalia, type OQueAClienteAvalia } from '@/lib/avaliacao/notas'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { maskPhone } from '@estetica-os/utils'
import { lerRegrasDoPacote, type RegrasDoPacote } from '@/lib/pacotes/regras'

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
  /** F17-3: o que a cliente avalia ao confirmar o atendimento pelo app (padrão: os dois). */
  oQueAClienteAvalia: OQueAClienteAvalia
  /**
   * Itens 8 e 9 da auditoria (decisões do Claude pelo princípio 1, 2026-11-18):
   * o pacote no crediário libera as sessões antes de quitado (padrão: sim) e o
   * pacote vencido se cancela (padrão: não). `lib/pacotes/regras.ts`.
   */
  regrasDoPacote: RegrasDoPacote
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
      .select('id, name, slug, document, email, phone, website, plan_name, plan_status, created_at, portal_prazo_alteracao_horas, plano_validade_dias, avaliacao_o_que, pacote_crediario_libera, pacote_vencido_cancela')
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
    oQueAClienteAvalia: oQueAvalia((t as { avaliacao_o_que?: string }).avaliacao_o_que),
    regrasDoPacote: lerRegrasDoPacote(t as { pacote_crediario_libera?: boolean | null; pacote_vencido_cancela?: boolean | null }),
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
  // O dado da rede é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

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

  // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
  // feito." Acima do comum (720 horas, 365 dias) a tela avisa e aqui se grava;
  // só o impossível se recusa (lib/configuracoes/prazos-da-rede.ts).
  const prazo = Number(texto('portal_prazo_alteracao_horas') ?? 24)
  const prazoImpossivel = recusaDoPrazoDoPortal(prazo)
  if (prazoImpossivel) return { error: prazoImpossivel }

  const validadeDoPlano = Number(texto('plano_validade_dias') ?? 30)
  const validadeImpossivel = recusaDaValidadeDoPlano(validadeDoPlano)
  if (validadeImpossivel) return { error: validadeImpossivel }

  // F17-3: o que a cliente avalia no app. Sem o campo (outro formulário), fica como está.
  const oQueAvaliaPedido = texto('avaliacao_o_que')
  if (oQueAvaliaPedido && !(O_QUE_A_CLIENTE_AVALIA as readonly string[]).includes(oQueAvaliaPedido)) {
    return { error: 'O que a cliente avalia: escolha uma das opções.' }
  }

  // Itens 8 e 9 (as regras do pacote da rede): sem o campo (outro formulário), fica como está.
  const simOuNao = (k: string): boolean | undefined => {
    const v = texto(k)
    return v === 'sim' ? true : v === 'nao' ? false : undefined
  }
  const crediarioLibera = simOuNao('pacote_crediario_libera')
  const vencidoCancela  = simOuNao('pacote_vencido_cancela')

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
        ...(oQueAvaliaPedido ? { avaliacao_o_que: oQueAvaliaPedido } : {}),
        ...(crediarioLibera !== undefined ? { pacote_crediario_libera: crediarioLibera } : {}),
        ...(vencidoCancela !== undefined ? { pacote_vencido_cancela: vencidoCancela } : {}),
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
