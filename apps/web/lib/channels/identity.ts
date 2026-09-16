/**
 * Identidade do contato nos canais de mensagem.
 *
 * Até 2025 dava para tratar "contato do WhatsApp" e "número de telefone" como
 * a mesma coisa. Não dá mais:
 *
 * - **@lid** — o WhatsApp passou a mandar um identificador privado
 *   (`999999999999999@lid`) no lugar do número. Nos provedores não oficiais ele aparece em
 *   `chatLid`/`senderLid`/`participantLid` e, dependendo do caso, DENTRO do
 *   próprio campo `phone`.
 * - **BSUID** — a Cloud API oficial manda um id com escopo de negócio
 *   (`BR.1A2B3C4D…`) em `contacts[].user_id` e `messages[].from_user_id`.
 *   Desde que o WhatsApp lançou usernames, `wa_id` e `messages[].from` podem
 *   simplesmente não vir.
 * - **Sufixos de servidor** — `@s.whatsapp.net` e `@c.us` marcam um JID que é
 *   de fato um telefone; `@g.us` é grupo; `@broadcast` é lista.
 *
 * A armadilha central: um @lid tem 15 dígitos, e um telefone em E.164 também
 * pode ter 15. Depois de arrancar o sufixo os dois viram a mesma string e não
 * há como distinguir. Por isso **o sufixo nunca é removido de um @lid** — ele
 * é a única prova de que aquilo não é um número.
 */

/** Sufixos de JID que indicam um contato individual identificado por telefone. */
const SUFIXOS_DE_TELEFONE = ['@s.whatsapp.net', '@c.us', '@lid.whatsapp.net']

/** BSUID: duas letras de país, ponto, alfanumérico (com `ENT.` nas contas-mãe). */
const RE_BSUID = /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$/

export type TipoIdentificador = 'phone' | 'lid' | 'bsuid' | 'group' | 'desconhecido'

/**
 * Telefone plausível: só dígitos, entre 8 e 15 (limite do E.164).
 *
 * Conservador de propósito. Um @lid sem sufixo passaria neste teste, e é
 * exatamente por isso que ele só é aplicado a valor que já se sabe não ser lid.
 */
export function ehTelefonePlausivel(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '')
  return digitos.length >= 8 && digitos.length <= 15 && digitos === valor.replace(/[\s+()-]/g, '')
}

export function classificarIdentificador(bruto: string | null | undefined): TipoIdentificador {
  const v = (bruto ?? '').trim()
  if (!v) return 'desconhecido'

  if (v.endsWith('@g.us') || v.endsWith('@broadcast') || v.endsWith('@newsletter')) return 'group'
  if (v.endsWith('@lid')) return 'lid'
  if (RE_BSUID.test(v)) return 'bsuid'

  const semSufixo = tirarSufixoDeTelefone(v)
  if (semSufixo !== v) return ehTelefonePlausivel(semSufixo) ? 'phone' : 'desconhecido'

  return ehTelefonePlausivel(v) ? 'phone' : 'desconhecido'
}

function tirarSufixoDeTelefone(valor: string): string {
  for (const s of SUFIXOS_DE_TELEFONE) {
    if (valor.endsWith(s)) return valor.slice(0, -s.length)
  }
  return valor
}

/**
 * Forma canônica de um identificador, para comparar e guardar.
 *
 * Telefone vira só dígitos (o `+` some: `+5511…` e `5511…` são a mesma pessoa).
 * @lid e BSUID ficam como vieram — o sufixo/prefixo É a informação.
 */
export function normalizarIdentificador(bruto: string | null | undefined): string | null {
  const v = (bruto ?? '').trim()
  if (!v) return null

  switch (classificarIdentificador(v)) {
    case 'phone': return tirarSufixoDeTelefone(v).replace(/\D/g, '')
    case 'lid':   return v.toLowerCase()
    case 'bsuid': return v
    case 'group': return v.toLowerCase()
    default:      return v
  }
}

export interface IdentidadeContato {
  /** Chave da conversa. Telefone quando existe; senão o id opaco do canal. */
  externalUserId: string
  /** Só preenchido quando é MESMO um telefone — nunca um @lid disfarçado. */
  phone: string | null
  /** Tudo que se sabe desta pessoa nesta mensagem, para reconciliar depois. */
  aliases: string[]
}

/**
 * Junta os identificadores de uma mensagem numa identidade só.
 *
 * O telefone é preferido como chave por ser o que as conversas antigas já usam
 * e o que `openLeadConversation` produz ao abrir conversa a partir de um card.
 * Quando ele não vem — e agora ele frequentemente não vem — a chave passa a ser
 * o id opaco, e o telefone entra depois, quando aparecer.
 *
 * Devolve `null` quando não sobrou identificador nenhum utilizável: seguir com
 * string vazia criaria uma conversa fantasma que sequestra toda mensagem futura
 * sem remetente.
 */
export function montarIdentidade(
  candidatos: Array<string | null | undefined>,
): IdentidadeContato | null {
  const vistos = new Set<string>()
  const aliases: string[] = []
  let phone: string | null = null
  let opaco: string | null = null

  for (const bruto of candidatos) {
    const tipo = classificarIdentificador(bruto)
    if (tipo === 'group' || tipo === 'desconhecido') continue

    const norm = normalizarIdentificador(bruto)
    if (!norm || vistos.has(norm)) continue
    vistos.add(norm)
    aliases.push(norm)

    if (tipo === 'phone') phone ??= norm
    else                  opaco ??= norm
  }

  const externalUserId = phone ?? opaco
  if (!externalUserId) return null

  return { externalUserId, phone, aliases }
}

/**
 * O contato é um grupo, lista de transmissão ou canal?
 *
 * O inbox é de atendimento um-a-um. Sem este corte, cada grupo de que a clínica
 * participa viraria um lead no funil, com o nome do grupo no lugar do cliente.
 */
export function ehConversaDeGrupo(...candidatos: Array<string | null | undefined>): boolean {
  return candidatos.some(c => classificarIdentificador(c) === 'group')
}
