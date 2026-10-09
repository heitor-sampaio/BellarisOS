import type { OfficialConfig } from '@/lib/whatsapp/types'
import { montarComponentesMeta, type TemplateRascunho, type TemplateStatus } from './core'
import type { TemplateDaMetaCompleto } from './importar'

const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * A Graph da caixa — a da Meta, ou a falsa do E2E (`config.graphBase`, que só
 * o teste põe; `META_GRAPH_BASE_TESTE` no build de teste). Sem isto, conectar
 * um número no teste puxaria os templates da Meta de verdade.
 */
function graph(config: OfficialConfig): string {
  return (config.graphBase ?? process.env.META_GRAPH_BASE_TESTE ?? GRAPH).replace(/\/$/, '')
}

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

/** O template como a listagem da Graph API devolve. */
interface TemplateCru {
  id?: string | number; name: string; status?: string; category: string; language: string
  rejected_reason?: string | null
}

/** O que as chamadas deste arquivo leem da resposta — cada uma, um pedaço. */
interface RespostaGraph {
  id?: string | number
  status?: string
  data?: TemplateCru[]
  paging?: { next?: string }
}

async function chamar(url: string, init: RequestInit): Promise<RespostaGraph> {
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
  return body as RespostaGraph
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

  const body = await chamar(`${graph(config)}/${waba}/message_templates`, {
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
  await chamar(`${graph(config)}/${metaTemplateId}`, {
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

  await chamar(`${graph(config)}/${waba}/message_templates?${query}`, {
    method:  'DELETE',
    headers: auth(config),
  })
}

/**
 * O catálogo INTEIRO da conta, com o conteúdo (`components`) — o que a
 * importação ao conectar um número precisa (`lib/templates/catalogo.ts`).
 */
export async function listarCatalogoDaMeta(config: OfficialConfig): Promise<TemplateDaMetaCompleto[]> {
  const waba = exigirWaba(config)
  const campos = 'id,name,status,category,language,rejected_reason,components'
  const todos: TemplateDaMetaCompleto[] = []
  let url: string | null = `${graph(config)}/${waba}/message_templates?fields=${campos}&limit=100`
  while (url) {
    const res = await fetch(url, { method: 'GET', headers: auth(config) })
    const body = await res.json().catch(() => null) as
      (ErroMeta & { data?: TemplateDaMetaCompleto[]; paging?: { next?: string } }) | null
    if (!res.ok || body?.error) {
      throw new Error(body?.error?.error_user_msg ?? body?.error?.message ?? `HTTP ${res.status}`)
    }
    todos.push(...(body?.data ?? []))
    url = body?.paging?.next ?? null
  }
  return todos
}
