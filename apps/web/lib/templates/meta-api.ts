import type { OfficialConfig } from '@/lib/whatsapp/types'
import { montarComponentesMeta, type TemplateRascunho, type TemplateStatus } from './core'

const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * Gestão de templates na Graph API.
 *
 * Fica separado de `OfficialAPIProvider` porque é outra conta: mensagem vai
 * pelo **phone number id**, template vai pela **WhatsApp Business Account**
 * (WABA). São dois ids diferentes da mesma integração, e trocá-los dá 404 sem
 * explicação.
 */

export interface TemplateNaMeta {
  id:       string
  name:     string
  status:   TemplateStatus
  category: string
  language: string
  rejected_reason?: string
}

interface ErroMeta { error?: { message?: string; error_user_msg?: string; code?: number } }

async function chamar(url: string, init: RequestInit): Promise<any> {
  const res  = await fetch(url, init)
  const body = await res.json().catch(() => null) as (ErroMeta & Record<string, unknown>) | null

  if (!res.ok || body?.error) {
    // `error_user_msg` é o texto que a Meta escreveu para ser lido por gente;
    // `message` é o técnico. Preferir o primeiro quando existe.
    const msg = body?.error?.error_user_msg
      ?? body?.error?.message
      ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body
}

function auth(config: OfficialConfig) {
  return {
    'Authorization': `Bearer ${config.accessToken}`,
    'Content-Type':  'application/json',
  }
}

/** A WABA precisa estar configurada; sem ela não há como gerenciar template. */
export function exigirWaba(config: OfficialConfig): string {
  if (!config.wabaId) {
    throw new Error(
      'Falta o ID da conta do WhatsApp Business (WABA) em Configurações → Integrações.',
    )
  }
  return config.wabaId
}

/**
 * Submete o template à revisão da Meta.
 *
 * Não existe "salvar sem enviar" do lado dela: criar É submeter, e o template
 * nasce em análise. É por isso que o rascunho mora no nosso banco — para a
 * rede escrever e reescrever sem gastar submissão nem poluir a conta com
 * template recusado.
 */
export async function criarTemplateNaMeta(
  config: OfficialConfig,
  t: TemplateRascunho,
): Promise<{ id: string; status: TemplateStatus }> {
  const waba = exigirWaba(config)

  const body = await chamar(`${GRAPH}/${waba}/message_templates`, {
    method:  'POST',
    headers: auth(config),
    body: JSON.stringify({
      name:             t.name,
      category:         t.category,
      language:         t.language,
      parameter_format: 'named',
      components:       montarComponentesMeta(t),
    }),
  })

  return {
    id:     String(body.id),
    status: (body.status as TemplateStatus) ?? 'PENDING',
  }
}

/**
 * Edita um template já submetido.
 *
 * A Meta só aceita edição de template APROVADO ou RECUSADO, e só dos
 * componentes — nome, idioma e categoria são imutáveis depois da criação.
 * Editar joga o template de volta para análise.
 */
export async function editarTemplateNaMeta(
  config: OfficialConfig,
  metaTemplateId: string,
  t: TemplateRascunho,
): Promise<void> {
  await chamar(`${GRAPH}/${metaTemplateId}`, {
    method:  'POST',
    headers: auth(config),
    body: JSON.stringify({ components: montarComponentesMeta(t) }),
  })
}

/**
 * Apaga na Meta.
 *
 * `name` junto do `hsm_id` é intencional: sem o nome a Meta apaga só aquela
 * versão de idioma; com ele, apaga o template inteiro — que é o que a tela
 * promete ao dizer "apagar".
 */
export async function apagarTemplateNaMeta(
  config: OfficialConfig,
  metaTemplateId: string,
  name: string,
): Promise<void> {
  const waba  = exigirWaba(config)
  const query = new URLSearchParams({ hsm_id: metaTemplateId, name })

  await chamar(`${GRAPH}/${waba}/message_templates?${query}`, {
    method:  'DELETE',
    headers: auth(config),
  })
}

/**
 * Lista o que a Meta tem hoje.
 *
 * O status muda do lado dela — aprovação sai em até 24h, e um template pode ser
 * pausado depois por reclamação de quem recebe. Sem reler, a tela mostraria
 * "em análise" para sempre.
 */
export async function listarTemplatesDaMeta(
  config: OfficialConfig,
): Promise<TemplateNaMeta[]> {
  const waba   = exigirWaba(config)
  const campos = 'id,name,status,category,language,rejected_reason'
  const todos: TemplateNaMeta[] = []

  let url: string | null = `${GRAPH}/${waba}/message_templates?fields=${campos}&limit=100`

  // Paginação por cursor: uma rede com muitos templates não cabe numa página, e
  // ler só a primeira faria os demais aparecerem como "some da Meta".
  while (url) {
    const body: any = await chamar(url, { method: 'GET', headers: auth(config) })
    for (const t of (body.data ?? [])) {
      todos.push({
        id:       String(t.id),
        name:     t.name,
        status:   t.status as TemplateStatus,
        category: t.category,
        language: t.language,
        rejected_reason: t.rejected_reason ?? undefined,
      })
    }
    url = body.paging?.next ?? null
  }

  return todos
}
