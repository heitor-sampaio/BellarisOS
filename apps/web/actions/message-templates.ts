'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  numerosOficiais, configDaWaba, importarCatalogoDaWaba, limparCatalogosSemNumero,
} from '@/lib/templates/catalogo'
import {
  validarTemplate, normalizarNome, extrairVariaveis,
  type TemplateRascunho, type TemplateStatus, type TemplateButton, type TemplateCategoria,
} from '@/lib/templates/core'
import {
  criarTemplateNaMeta, editarTemplateNaMeta, apagarTemplateNaMeta,
} from '@/lib/templates/meta-api'
import { gravar, ler } from '@/lib/db'

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
  /** A conta (WABA) dona do template — é por ela que se sabe de qual número é. */
  waba_id:     string | null
  /** Importado da Meta e que o BellarisOS não envia: o motivo (só leitura). */
  nao_suportado: string | null
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
  /** No template NOVO: o número (oficial, ligado) em cuja conta ele nasce. */
  numeroId?:   string | null
}

const CAMPOS = `id, name, category, language, header_text, body_text, footer_text,
                buttons, example_values, status, meta_template_id, rejection_reason,
                created_at, submitted_at, waba_id, nao_suportado`

/**
 * Template é coisa da API oficial: a uazapi manda pelo WhatsApp Web, que não
 * tem janela de 24h nem aprovação da Meta. E é coisa de UMA conta (WABA): toda
 * conversa com a Meta usa a credencial de um número ligado da conta do
 * template (`configDaWaba`), não "a config oficial da rede" — com dois números
 * em contas diferentes, a de antes falava com a conta errada.
 */

export async function listTemplates(): Promise<MessageTemplate[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')

  // Só os das contas com número oficial LIGADO: sem número, a tela não mostra
  // template nenhum (pedido do Heitor, 2026-10-09).
  const contas = [...new Set((await numerosOficiais(ctx.tenantId!)).map(n => n.wabaId))]
  if (contas.length === 0) return []

  const { data, error } = await createAdminClient()
    .from('message_templates')
    .select(CAMPOS)
    .eq('tenant_id', ctx.tenantId!)
    .in('waba_id', contas)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao carregar os templates: ${error.message}`)
  return (data ?? []) as unknown as MessageTemplate[]
}

export interface NumeroDoTemplate { id: string; label: string; phone: string | null; wabaId: string }

/**
 * Os números oficiais ligados — a tela escolhe em qual o template nasce, diz de
 * qual número é cada um e filtra por eles. Sem credencial (rótulo e conta).
 */
export async function getTemplateSetup(): Promise<{ numeros: NumeroDoTemplate[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'VIEW')
  return {
    numeros: (await numerosOficiais(ctx.tenantId!))
      .map(n => ({ id: n.id, label: n.label, phone: n.phone, wabaId: n.wabaId })),
  }
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
  assertRecurso(ctx, 'templates')
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
    // O template nasce DENTRO de uma WABA: a do número escolhido (com um só,
    // ele). Sem carimbar, a conversa nunca o ofereceria — o filtro por WABA é
    // estrito. E sem número oficial ligado não há onde nascer.
    const numeros = await numerosOficiais(ctx.tenantId!)
    const numero = input.numeroId
      ? numeros.find(n => n.id === input.numeroId)
      : numeros.length === 1 ? numeros[0] : undefined
    if (!numero) {
      return { ok: false, error: numeros.length
        ? 'Escolha o número do WhatsApp em que o template vai nascer.'
        : 'Conecte um número da API oficial em Configurações → Integrações.' }
    }

    const { data, error } = await admin
      .from('message_templates')
      .insert({
        ...rascunho,
        tenant_id:  ctx.tenantId!,
        waba_id:    numero.wabaId,
        created_by: await membroId(ctx),
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: mensagemDeErro(error) }
    revalidatePath('/admin/templates')
    return { ok: true, id: (data as { id: string }).id }
  }

  const { data: atual, error: erroAtual } = await admin
    .from('message_templates')
    .select('status, meta_template_id, waba_id, nao_suportado')
    .eq('id', input.id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroAtual) return { ok: false, error: erroAtual.message }
  if (!atual)    return { ok: false, error: 'Template não encontrado.' }

  const t = atual as { meta_template_id: string | null; waba_id: string | null; nao_suportado: string | null }
  if (t.nao_suportado) return { ok: false, error: `Este template não se edita pelo BellarisOS: ${t.nao_suportado}` }
  const jaFoiParaMeta = !!t.meta_template_id

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
    const config = await configDaWaba(ctx.tenantId!, t.waba_id)
    if (!config) return { ok: false, error: 'Nenhum número oficial desta conta está conectado.' }
    try {
      await editarTemplateNaMeta(config, t.meta_template_id!, rascunho)
      // Toda edição reabre a análise.
      await gravar(admin
        .from('message_templates')
        .update({ status: 'PENDING', rejection_reason: null })
        .eq('id', input.id), 'salvar o modelo de mensagem')
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
  assertRecurso(ctx, 'templates')
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
  if (t.nao_suportado) return { ok: false, error: t.nao_suportado }

  const erros = validarTemplate(t as unknown as TemplateRascunho)
  if (erros.length > 0) return { ok: false, erros }

  const config = await configDaWaba(ctx.tenantId!, t.waba_id)
  if (!config) {
    return { ok: false, error: 'Conecte um número oficial desta conta em Configurações → Integrações.' }
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
 * outro igual — sem entender por quê. (Desligar um número é outra coisa: tira
 * daqui e deixa na Meta — `lib/templates/catalogo.ts`.)
 */
export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'templates')
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('message_templates')
    .select('name, meta_template_id, waba_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data)  return { ok: false, error: 'Template não encontrado.' }

  const t = data as { name: string; meta_template_id: string | null; waba_id: string | null }

  if (t.meta_template_id) {
    const config = await configDaWaba(ctx.tenantId!, t.waba_id)
    if (!config) return { ok: false, error: 'Nenhum número oficial desta conta está conectado.' }
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
 * Relê as contas na Meta.
 *
 * A aprovação sai em até 24h e não avisa; um template aprovado também pode ser
 * pausado depois, por reclamação de quem recebe. E o que foi criado direto no
 * painel da Meta entra aqui também — o mesmo caminho de ligar um número.
 */
export async function syncTemplates(): Promise<{ ok: boolean; atualizados?: number; error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'templates')
  assertPermission(ctx, 'marketing', 'MANAGE')
  const admin = createAdminClient()

  const contas = [...new Set((await numerosOficiais(ctx.tenantId!)).map(n => n.wabaId))]
  if (contas.length === 0) return { ok: false, error: 'Nenhum número da API oficial está conectado.' }

  let atualizados = 0
  try {
    for (const waba of contas) {
      const r = await importarCatalogoDaWaba(admin, ctx.tenantId!, waba)
      atualizados += r.novos + r.atualizados
    }
    await limparCatalogosSemNumero(admin, ctx.tenantId!)
  } catch (e) {
    return { ok: false, error: msg(e) }
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
  const data = await ler(createAdminClient()
    .from('users').select('id').eq('auth_id', ctx.userId).maybeSingle(), 'buscar o usuário')
  return (data as { id: string } | null)?.id ?? null
}

function mensagemDeErro(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Já existe um template com esse nome neste idioma, nesta conta.'
  }
  return error.message
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro desconhecido'
}
