import type { TemplateButton, TemplateCategoria, TemplateStatus } from './core'

/**
 * O template como a Graph API o devolve → a nossa linha de `message_templates`.
 *
 * Conectar um número oficial puxa o catálogo INTEIRO da conta (2026-10-09), e
 * lá há o que o nosso envio não monta. Isso entra também — a tela mostra a
 * conta como ela é —, mas com `nao_suportado` dizendo por quê: o inbox não o
 * oferece e a tela não o edita. Puro de propósito (o teste é unitário).
 */

export interface ComponenteDaMeta {
  type:     string
  format?:  string
  text?:    string
  example?: {
    header_text_named_params?: { param_name: string; example: string }[]
    body_text_named_params?:   { param_name: string; example: string }[]
    [k: string]: unknown
  }
  buttons?: { type: string; text?: string; url?: string; [k: string]: unknown }[]
  [k: string]: unknown
}

export interface TemplateDaMetaCompleto {
  id:         string | number
  name:       string
  status?:    string
  category:   string
  language:   string
  rejected_reason?: string | null
  components?: ComponenteDaMeta[]
}

export interface ImportadoDaMeta {
  meta_template_id: string
  name:        string
  status:      TemplateStatus
  category:    TemplateCategoria
  language:    string
  header_text: string | null
  body_text:   string
  footer_text: string | null
  buttons:     TemplateButton[]
  example_values: Record<string, string>
  rejection_reason: string | null
  nao_suportado:    string | null
}

/** Os status da Meta nos nossos; `null` = está saindo da conta, não importa. */
function statusDaMeta(s: string | undefined): TemplateStatus | null {
  switch (s) {
    case 'APPROVED': case 'PENDING': case 'REJECTED': case 'PAUSED': case 'DISABLED':
      return s
    case 'IN_APPEAL':      return 'PENDING'
    case 'LIMIT_EXCEEDED': return 'DISABLED'
    case 'PENDING_DELETION': case 'DELETED': case 'ARCHIVED':
      return null
    default:               return 'PENDING'
  }
}

const CATEGORIAS = new Set<TemplateCategoria>(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
const NUMERADA = /\{\{\s*\d+\s*\}\}/

const MIDIA: Record<string, string> = {
  IMAGE: 'imagem', VIDEO: 'vídeo', DOCUMENT: 'documento', LOCATION: 'localização',
}
const BOTOES: Record<string, string> = {
  PHONE_NUMBER: 'telefone', COPY_CODE: 'copiar código', OTP: 'código de verificação',
  FLOW: 'formulário', CATALOG: 'catálogo', MPM: 'vários produtos', SPM: 'produto',
  VOICE_CALL: 'ligação',
}

export function daMeta(t: TemplateDaMetaCompleto): ImportadoDaMeta | null {
  const status = statusDaMeta(t.status)
  if (!status) return null

  const comps = t.components ?? []
  const header = comps.find(c => c.type === 'HEADER')
  const body   = comps.find(c => c.type === 'BODY')
  const footer = comps.find(c => c.type === 'FOOTER')
  const botoes = comps.find(c => c.type === 'BUTTONS')?.buttons ?? []

  // O primeiro motivo basta: é para a pessoa entender, não um relatório.
  const motivos: string[] = []
  if (t.category === 'AUTHENTICATION') {
    motivos.push('Template de autenticação (código de verificação): o BellarisOS não envia este tipo.')
  }
  if (header?.format && header.format !== 'TEXT') {
    motivos.push(`Cabeçalho com ${MIDIA[header.format] ?? header.format.toLowerCase()}: o BellarisOS ainda não envia mídia no template.`)
  }
  for (const c of comps) {
    if (['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type)) continue
    motivos.push(c.type === 'CAROUSEL'
      ? 'Template em carrossel: o BellarisOS não envia este formato.'
      : `Tem um componente que o BellarisOS não envia (${c.type}).`)
  }
  if (NUMERADA.test(header?.text ?? '') || NUMERADA.test(body?.text ?? '')) {
    motivos.push('Usa variáveis numeradas ({{1}}): o BellarisOS só preenche variáveis com nome. Recrie com nomes, como {{nome}}.')
  }
  for (const b of botoes) {
    if (b.type === 'URL' && (b.url ?? '').includes('{{')) {
      motivos.push('Tem botão de link com variável: o BellarisOS só envia link fixo.')
    } else if (b.type !== 'URL' && b.type !== 'QUICK_REPLY') {
      motivos.push(`Tem botão do tipo ${BOTOES[b.type] ?? b.type.toLowerCase()}: o BellarisOS não envia este botão.`)
    }
  }

  const exemplos: Record<string, string> = {}
  for (const p of [
    ...(header?.example?.header_text_named_params ?? []),
    ...(body?.example?.body_text_named_params ?? []),
  ]) exemplos[p.param_name] = p.example

  return {
    meta_template_id: String(t.id),
    name:        t.name,
    status,
    category:    CATEGORIAS.has(t.category as TemplateCategoria) ? t.category as TemplateCategoria : 'UTILITY',
    language:    t.language,
    header_text: header?.format === 'TEXT' || (!header?.format && header?.text) ? header?.text ?? null : null,
    body_text:   body?.text ?? '',
    footer_text: footer?.text ?? null,
    buttons:     botoes
      .filter(b => b.type === 'QUICK_REPLY' || (b.type === 'URL' && !(b.url ?? '').includes('{{')))
      .map(b => b.type === 'URL'
        ? { type: 'URL' as const, text: b.text ?? '', url: b.url ?? '' }
        : { type: 'QUICK_REPLY' as const, text: b.text ?? '' }),
    example_values:   exemplos,
    rejection_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
    nao_suportado:    motivos[0] ?? null,
  }
}
