/**
 * Regras de template HSM do WhatsApp.
 *
 * Um template é submetido à Meta e revisado por ela; o que for recusado volta
 * como REJECTED com um motivo genérico, sem dizer qual regra caiu. Validar
 * aqui antes de submeter é o que transforma "rejeitado, tente de novo" em um
 * erro que diz o que corrigir.
 *
 * Os limites são os da Meta, não escolhas nossas.
 */

export type TemplateCategoria = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
export type TemplateStatus =
  | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL'
  text: string
  url?: string
}

export interface TemplateRascunho {
  name:        string
  category:    TemplateCategoria
  language:    string
  header_text: string | null
  body_text:   string
  footer_text: string | null
  buttons:     TemplateButton[]
  example_values: Record<string, string>
}

export const LIMITES = {
  nome:      512,
  cabecalho: 60,
  corpo:     1024,
  rodape:    60,
  botao:     25,
  botoes:    10,
  botoesUrl: 2,
} as const

export const CATEGORIAS: { value: TemplateCategoria; label: string; hint: string }[] = [
  {
    value: 'UTILITY',
    label: 'Utilidade',
    hint: 'Relacionada a algo que a pessoa já contratou ou agendou: lembrete, confirmação, retorno.',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    hint: 'Promoção, novidade, reativação. Custa mais e a pessoa pode bloquear esse tipo.',
  },
  {
    value: 'AUTHENTICATION',
    label: 'Autenticação',
    hint: 'Somente código de verificação. Não serve para atendimento.',
  },
]

export const STATUS_META: Record<TemplateStatus, { label: string; tom: 'neutro' | 'espera' | 'ok' | 'erro' }> = {
  DRAFT:    { label: 'Rascunho',  tom: 'neutro' },
  PENDING:  { label: 'Em análise', tom: 'espera' },
  APPROVED: { label: 'Aprovado',  tom: 'ok' },
  REJECTED: { label: 'Recusado',  tom: 'erro' },
  PAUSED:   { label: 'Pausado',   tom: 'erro' },
  DISABLED: { label: 'Desativado', tom: 'erro' },
}

/** Variável no formato nomeado da Meta: `{{nome_do_cliente}}`. */
const RE_VARIAVEL = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g

/**
 * Nomes das variáveis de um texto, na ordem em que aparecem e sem repetir.
 *
 * A ordem importa: a Meta casa os parâmetros do envio pela posição no array,
 * mesmo no formato nomeado.
 */
export function extrairVariaveis(...textos: (string | null | undefined)[]): string[] {
  const achadas: string[] = []
  for (const texto of textos) {
    if (!texto) continue
    for (const m of texto.matchAll(RE_VARIAVEL)) {
      const nome = m[1]!
      if (!achadas.includes(nome)) achadas.push(nome)
    }
  }
  return achadas
}

/** Troca `{{var}}` pelos valores dados — usado na pré-visualização e no histórico. */
export function interpolar(texto: string, valores: Record<string, string>): string {
  return texto.replace(RE_VARIAVEL, (_, nome: string) => valores[nome] ?? `{{${nome}}}`)
}

/** O nome do template na Meta: minúsculas, dígitos e underscore. */
export function normalizarNome(bruto: string): string {
  return bruto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, LIMITES.nome)
}

/**
 * Tudo que faria a Meta recusar, verificado antes de gastar uma submissão.
 *
 * Devolve a lista de problemas; vazia significa pronto para enviar.
 */
export function validarTemplate(t: TemplateRascunho): string[] {
  const erros: string[] = []

  if (!t.name) erros.push('Dê um nome ao template.')
  else if (!/^[a-z0-9_]+$/.test(t.name)) {
    erros.push('O nome só aceita letras minúsculas, números e underscore.')
  }

  const corpo = t.body_text?.trim() ?? ''
  if (!corpo) erros.push('O corpo da mensagem é obrigatório.')
  if (corpo.length > LIMITES.corpo) {
    erros.push(`O corpo passa de ${LIMITES.corpo} caracteres (tem ${corpo.length}).`)
  }

  // A Meta recusa corpo que seja só variável: sem texto fixo não há o que revisar.
  if (corpo && corpo.replace(RE_VARIAVEL, '').trim() === '') {
    erros.push('O corpo não pode ser só variáveis — escreva o texto da mensagem.')
  }
  // Variáveis coladas uma na outra também são recusadas.
  if (/\}\}\s*\{\{/.test(corpo)) {
    erros.push('Duas variáveis não podem ficar lado a lado; separe com texto.')
  }

  if (t.header_text) {
    if (t.header_text.length > LIMITES.cabecalho) {
      erros.push(`O cabeçalho passa de ${LIMITES.cabecalho} caracteres.`)
    }
    if (extrairVariaveis(t.header_text).length > 1) {
      erros.push('O cabeçalho aceita no máximo uma variável.')
    }
  }

  if (t.footer_text) {
    if (t.footer_text.length > LIMITES.rodape) {
      erros.push(`O rodapé passa de ${LIMITES.rodape} caracteres.`)
    }
    if (extrairVariaveis(t.footer_text).length > 0) {
      erros.push('O rodapé não aceita variáveis.')
    }
  }

  const botoes = t.buttons ?? []
  if (botoes.length > LIMITES.botoes) {
    erros.push(`No máximo ${LIMITES.botoes} botões.`)
  }
  if (botoes.filter(b => b.type === 'URL').length > LIMITES.botoesUrl) {
    erros.push(`No máximo ${LIMITES.botoesUrl} botões de link.`)
  }
  for (const b of botoes) {
    if (!b.text?.trim()) erros.push('Todo botão precisa de um texto.')
    else if (b.text.length > LIMITES.botao) {
      erros.push(`O texto do botão "${b.text.slice(0, 12)}…" passa de ${LIMITES.botao} caracteres.`)
    }
    if (b.type === 'URL' && !/^https?:\/\/.+/.test(b.url ?? '')) {
      erros.push(`O botão "${b.text}" precisa de um link começando com https://`)
    }
  }

  // Sem exemplo a Meta não consegue revisar o template e recusa na hora.
  for (const v of extrairVariaveis(t.header_text, t.body_text)) {
    if (!t.example_values?.[v]?.trim()) {
      erros.push(`Dê um exemplo para a variável {{${v}}}.`)
    }
  }

  return erros
}

// -- Tradução para o formato da Graph API -------------------------------------

interface ComponenteMeta {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT'
  text?: string
  example?: Record<string, unknown>
  buttons?: Array<Record<string, unknown>>
}

/**
 * Monta os `components` do POST de criação.
 *
 * O formato nomeado (`{{nome}}` em vez de `{{1}}`) é escolha deliberada: quem
 * preenche o template na conversa vê "nome" e "horario", não "1" e "2".
 */
export function montarComponentesMeta(t: TemplateRascunho): ComponenteMeta[] {
  const componentes: ComponenteMeta[] = []

  if (t.header_text?.trim()) {
    const vars = extrairVariaveis(t.header_text)
    componentes.push({
      type: 'HEADER',
      format: 'TEXT',
      text: t.header_text,
      ...(vars.length > 0 && {
        example: {
          header_text_named_params: vars.map(v => ({
            param_name: v,
            example:    t.example_values[v] ?? '',
          })),
        },
      }),
    })
  }

  const varsCorpo = extrairVariaveis(t.body_text)
  componentes.push({
    type: 'BODY',
    text: t.body_text,
    ...(varsCorpo.length > 0 && {
      example: {
        body_text_named_params: varsCorpo.map(v => ({
          param_name: v,
          example:    t.example_values[v] ?? '',
        })),
      },
    }),
  })

  if (t.footer_text?.trim()) {
    componentes.push({ type: 'FOOTER', text: t.footer_text })
  }

  if (t.buttons?.length) {
    componentes.push({
      type: 'BUTTONS',
      buttons: t.buttons.map(b =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text, url: b.url }
          : { type: 'QUICK_REPLY', text: b.text },
      ),
    })
  }

  return componentes
}

/**
 * Monta os `components` do ENVIO — que são outra coisa: aqui vão os valores,
 * não a estrutura. Só entram os componentes que têm variável.
 */
export function montarParametrosEnvio(
  t: Pick<TemplateRascunho, 'header_text' | 'body_text'>,
  valores: Record<string, string>,
): Array<Record<string, unknown>> {
  const componentes: Array<Record<string, unknown>> = []

  const varsCabecalho = extrairVariaveis(t.header_text)
  if (varsCabecalho.length > 0) {
    componentes.push({
      type: 'header',
      parameters: varsCabecalho.map(v => ({
        type: 'text', parameter_name: v, text: valores[v] ?? '',
      })),
    })
  }

  const varsCorpo = extrairVariaveis(t.body_text)
  if (varsCorpo.length > 0) {
    componentes.push({
      type: 'body',
      parameters: varsCorpo.map(v => ({
        type: 'text', parameter_name: v, text: valores[v] ?? '',
      })),
    })
  }

  return componentes
}

/** O texto que fica no histórico da conversa: o template já preenchido. */
export function textoDoEnvio(
  t: Pick<TemplateRascunho, 'header_text' | 'body_text' | 'footer_text'>,
  valores: Record<string, string>,
): string {
  return [
    t.header_text && interpolar(t.header_text, valores),
    interpolar(t.body_text, valores),
    t.footer_text,
  ].filter(Boolean).join('\n\n')
}
