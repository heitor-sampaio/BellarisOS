'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppConfig } from '@/lib/whatsapp/factory'
import type { OfficialConfig } from '@/lib/whatsapp/types'
import {
  validarTemplate, normalizarNome, extrairVariaveis,
  type TemplateRascunho, type TemplateStatus, type TemplateButton, type TemplateCategoria,
} from '@/lib/templates/core'
import {
  criarTemplateNaMeta, editarTemplateNaMeta, apagarTemplateNaMeta, listarTemplatesDaMeta,
} from '@/lib/templates/meta-api'

export interface MessageTemplate {
  id:          string
  name:        string
  category:    TemplateCategoria
  language:    string
  header_text: string | null
  body_text:   string
  footer_text: string | null
  buttons:     TemplateButton[]
  example_values: Record<string, string>
  status:      TemplateStatus
  meta_template_id: string | null
  rejection_reason: string | null
  created_at:  string
  submitted_at: string | null
}

export interface TemplateInput {
  id?:         string
  name:        string
  category:    TemplateCategoria
  language:    string
  header_text: string | null
  body_text:   string
  footer_text: string | null
  buttons:     TemplateButton[]
  example_values: Record<string, string>
}

const CAMPOS = `id, name, category, language, header_text, body_text, footer_text,
                buttons, example_values, status, meta_template_id, rejection_reason,
                created_at, submitted_at`

/**
 * A configuração do WhatsApp oficial desta rede.
 *
 * Template é coisa da API oficial: a uazapi manda pelo WhatsApp Web, que não tem
 * janela de 24h nem aprovação da Meta. Dizer isso explicitamente evita a tela
 * oferecer um recurso que não vai funcionar.
 */
async function configOficial(tenantId: string): Promise<OfficialConfig | null> {
  const config = await getWhatsAppConfig(tenantId)
  return config?.provider === 'official' ? config : null
}

export async function listTemplates(): Promise<MessageTemplate[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')

  const { data, error } = await createAdminClient()
    .from('message_templates')
    .select(CAMPOS)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao carregar os templates: ${error.message}`)
  return (data ?? []) as unknown as MessageTemplate[]
}

/** A tela precisa saber se dá para submeter, e por que não, quando não dá. */
export async function getTemplateSetup(): Promise<{
  oficialAtivo: boolean
  temWaba:      boolean
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')

  const config = await configOficial(ctx.tenantId!)
  return { oficialAtivo: !!config, temWaba: !!config?.wabaId }
}

/**
 * Cria ou atualiza o rascunho.
 *
 * Template já submetido tem nome, idioma e categoria imutáveis na Meta — mudar
 * aqui faria o banco divergir dela em silêncio, e o envio passaria a apontar
 * para um template que não existe. Por isso esses campos são ignorados na
 * edição de quem já foi.
 */
export async function saveTemplate(
  input: TemplateInput,
): Promise<{ ok: boolean; id?: string; error?: string; erros?: string[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const rascunho: TemplateRascunho = {
    name:        normalizarNome(input.name),
    category:    input.category,
    language:    input.language || 'pt_BR',
    header_text: input.header_text?.trim() || null,
    body_text:   input.body_text?.trim() ?? '',
    footer_text: input.footer_text?.trim() || null,
    buttons:     input.buttons ?? [],
    // Exemplo de variável que não existe mais só polui o payload da Meta.
    example_values: limparExemplos(input),
  }

  const erros = validarTemplate(rascunho)
  if (erros.length > 0) return { ok: false, erros }

  if (!input.id) {
    const { data, error } = await admin
      .from('message_templates')
      .insert({ ...rascunho, tenant_id: ctx.tenantId!, created_by: await membroId(ctx) })
      .select('id')
      .single()

    if (error) return { ok: false, error: mensagemDeErro(error) }
    revalidatePath('/admin/templates')
    return { ok: true, id: (data as { id: string }).id }
  }

  const { data: atual, error: erroAtual } = await admin
    .from('message_templates')
    .select('status, meta_template_id')
    .eq('id', input.id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroAtual) return { ok: false, error: erroAtual.message }
  if (!atual)    return { ok: false, error: 'Template não encontrado.' }

  const jaFoiParaMeta = !!(atual as { meta_template_id: string | null }).meta_template_id

  const patch: Record<string, unknown> = {
    header_text: rascunho.header_text,
    body_text:   rascunho.body_text,
    footer_text: rascunho.footer_text,
    buttons:     rascunho.buttons,
    example_values: rascunho.example_values,
    updated_at:  new Date().toISOString(),
  }
  if (!jaFoiParaMeta) {
    patch.name     = rascunho.name
    patch.category = rascunho.category
    patch.language = rascunho.language
  }

  const { error } = await admin
    .from('message_templates')
    .update(patch)
    .eq('id', input.id)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { ok: false, error: mensagemDeErro(error) }

  // Editar um template que já vive na Meta só vale se a mudança chegar lá —
  // senão a rede edita o texto, a tela mostra o novo e o cliente recebe o velho.
  if (jaFoiParaMeta) {
    const config = await configOficial(ctx.tenantId!)
    if (!config) return { ok: false, error: 'WhatsApp oficial não está conectado.' }
    try {
      await editarTemplateNaMeta(
        config,
        (atual as { meta_template_id: string }).meta_template_id,
        rascunho,
      )
      // Toda edição reabre a análise.
      await admin
        .from('message_templates')
        .update({ status: 'PENDING', rejection_reason: null })
        .eq('id', input.id)
    } catch (e) {
      return { ok: false, error: `Salvo aqui, mas a Meta recusou a edição: ${msg(e)}` }
    }
  }

  revalidatePath('/admin/templates')
  return { ok: true, id: input.id }
}

/**
 * Manda para a revisão da Meta.
 *
 * Só o que ainda não foi: reenviar um template existente criaria um segundo com
 * o mesmo nome, o que a Meta recusa com um erro que não explica nada.
 */
export async function submitTemplate(
  id: string,
): Promise<{ ok: boolean; status?: TemplateStatus; error?: string; erros?: string[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('message_templates')
    .select(CAMPOS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data)  return { ok: false, error: 'Template não encontrado.' }

  const t = data as unknown as MessageTemplate
  if (t.meta_template_id) {
    return { ok: false, error: 'Este template já foi enviado. Edite-o para reabrir a análise.' }
  }

  const erros = validarTemplate(t as unknown as TemplateRascunho)
  if (erros.length > 0) return { ok: false, erros }

  const config = await configOficial(ctx.tenantId!)
  if (!config) {
    return { ok: false, error: 'Conecte o WhatsApp Oficial em Configurações → Integrações.' }
  }

  try {
    const criado = await criarTemplateNaMeta(config, t as unknown as TemplateRascunho)

    const { error: erroUpdate } = await admin
      .from('message_templates')
      .update({
        meta_template_id: criado.id,
        status:           criado.status,
        rejection_reason: null,
        submitted_at:     new Date().toISOString(),
      })
      .eq('id', id)

    // O template JÁ existe na Meta. Perder o id aqui deixaria um órfão que não
    // dá para editar nem apagar pela tela, e o nome fica ocupado para sempre.
    if (erroUpdate) {
      console.error('[submitTemplate] gravar id da Meta:', erroUpdate.message, criado.id)
      return { ok: false, error: 'Enviado à Meta, mas falhou ao gravar aqui. Use "Sincronizar".' }
    }

    revalidatePath('/admin/templates')
    return { ok: true, status: criado.status }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

/**
 * Apaga aqui e lá.
 *
 * A ordem importa: apagar na Meta primeiro. Se só apagássemos aqui, o template
 * continuaria ocupando o nome na conta dela e a rede não conseguiria recriar
 * outro igual — sem entender por quê.
 */
export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('message_templates')
    .select('name, meta_template_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data)  return { ok: false, error: 'Template não encontrado.' }

  const t = data as { name: string; meta_template_id: string | null }

  if (t.meta_template_id) {
    const config = await configOficial(ctx.tenantId!)
    if (!config) return { ok: false, error: 'WhatsApp oficial não está conectado.' }
    try {
      await apagarTemplateNaMeta(config, t.meta_template_id, t.name)
    } catch (e) {
      return { ok: false, error: `A Meta recusou apagar: ${msg(e)}` }
    }
  }

  const { error: erroDelete } = await admin
    .from('message_templates')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)

  if (erroDelete) return { ok: false, error: erroDelete.message }

  revalidatePath('/admin/templates')
  return { ok: true }
}

/**
 * Relê os status na Meta.
 *
 * A aprovação sai em até 24h e não avisa; um template aprovado também pode ser
 * pausado depois, por reclamação de quem recebe. Sem isto a tela mostraria
 * "em análise" para sempre e a rede tentaria enviar o que já não vale.
 */
export async function syncTemplates(): Promise<{ ok: boolean; atualizados?: number; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const config = await configOficial(ctx.tenantId!)
  if (!config) return { ok: false, error: 'WhatsApp oficial não está conectado.' }

  let daMeta
  try {
    daMeta = await listarTemplatesDaMeta(config)
  } catch (e) {
    return { ok: false, error: msg(e) }
  }

  const { data: locais, error } = await admin
    .from('message_templates')
    .select('id, name, language, status, meta_template_id')
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { ok: false, error: error.message }

  let atualizados = 0
  for (const local of (locais ?? []) as Array<{
    id: string; name: string; language: string
    status: TemplateStatus; meta_template_id: string | null
  }>) {
    // Casa pelo id quando existe; pelo par nome+idioma quando o template foi
    // criado direto no painel da Meta ou o id se perdeu numa falha de gravação.
    const remoto = local.meta_template_id
      ? daMeta.find(r => r.id === local.meta_template_id)
      : daMeta.find(r => r.name === local.name && r.language === local.language)

    if (!remoto) {
      // Sumiu de lá (apagado pelo painel). Vira rascunho de novo em vez de
      // continuar oferecido no inbox como se desse para enviar.
      if (local.meta_template_id) {
        await admin.from('message_templates')
          .update({ status: 'DRAFT', meta_template_id: null })
          .eq('id', local.id)
        atualizados++
      }
      continue
    }

    if (remoto.status === local.status && remoto.id === local.meta_template_id) continue

    const { error: erroUp } = await admin
      .from('message_templates')
      .update({
        status:           remoto.status,
        meta_template_id: remoto.id,
        rejection_reason: remoto.rejected_reason ?? null,
      })
      .eq('id', local.id)

    if (erroUp) console.error('[syncTemplates]', erroUp.message)
    else atualizados++
  }

  revalidatePath('/admin/templates')
  return { ok: true, atualizados }
}

// -- auxiliares ---------------------------------------------------------------

/** Só os exemplos de variáveis que ainda existem no texto. */
function limparExemplos(input: TemplateInput): Record<string, string> {
  const usadas = extrairVariaveis(input.header_text, input.body_text)
  const limpo: Record<string, string> = {}
  for (const v of usadas) {
    const valor = input.example_values?.[v]?.trim()
    if (valor) limpo[v] = valor
  }
  return limpo
}

async function membroId(ctx: Awaited<ReturnType<typeof getTenantContext>>): Promise<string | null> {
  if (ctx.internalUserId) return ctx.internalUserId
  const { data } = await createAdminClient()
    .from('users').select('id').eq('auth_id', ctx.userId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

function mensagemDeErro(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Já existe um template com esse nome neste idioma.'
  }
  return error.message
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro desconhecido'
}
