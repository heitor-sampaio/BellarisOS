import { MENSAGEM_SEM_PAGAMENTO, CODIGO_SEM_PAGAMENTO } from '@/lib/whatsapp/cobranca'

/**
 * O motivo de um envio recusado, no texto que a tela mostra (2026-10-15).
 *
 * Decide pelo CÓDIGO que o provedor devolveu, não por pedaços do texto. Até
 * aqui, a regra procurava "24", "10" e "OAuth" na mensagem inteira — e todo
 * erro da Cloud API traz `"type":"OAuthException"`, então QUALQUER recusa da
 * Meta virava "a conexão expirou"; e o 131042 (conta sem forma de pagamento)
 * tem "10" e "24" dentro, o que o fazia virar "a janela fechou". A clínica ia
 * reconectar o número quando o que faltava era cadastrar um cartão.
 */

/** O código no corpo de erro da Graph (`"code":131042`) ou no prefixo `(#10)`. */
function codigoDoErro(texto: string): number | null {
  const m = texto.match(/"code"\s*:\s*(\d+)/) ?? texto.match(/\(#(\d+)\)/)
  return m ? Number(m[1]) : null
}

const JANELA = 'A janela de resposta fechou. O contato precisa escrever de novo.'
const EXPIROU = 'A conexão com o canal expirou. Reconecte em Configurações → Integrações.'
const LIMITE = 'Muitas mensagens em pouco tempo. Tente de novo em instantes.'
const GENERICO = 'Não foi possível enviar a mensagem. Tente de novo; se persistir, confira a integração do canal.'

/** O texto de um código conhecido da Meta; `null` = não sabemos dizer. */
function textoDoCodigo(codigo: number): string | null {
  if (codigo === CODIGO_SEM_PAGAMENTO) return MENSAGEM_SEM_PAGAMENTO
  // 131047: fora das 24 h (Cloud API). 10: o "(#10) outside of allowed window" do Messenger.
  if (codigo === 131047 || codigo === 10) return JANELA
  if (codigo === 190) return EXPIROU
  if (codigo === 130429 || codigo === 131048 || codigo === 131056 || codigo === 4 || codigo === 80007) return LIMITE
  if (codigo === 131026) return 'O número não pôde receber: ele não tem WhatsApp ou ainda não aceitou os termos novos do aplicativo.'
  return null
}

export function falhaDoEnvio(err: unknown): { codigo: number | null; texto: string } {
  const texto = err instanceof Error ? err.message : String(err)
  const codigo = codigoDoErro(texto)
  const doCodigo = codigo !== null ? textoDoCodigo(codigo) : null
  if (doCodigo) return { codigo, texto: doCodigo }

  // Sem código conhecido, as frases do provedor — nunca números soltos.
  if (/outside (of )?(the )?allowed window|re-engagement/i.test(texto)) return { codigo, texto: JANELA }
  if (/rate limit|too many/i.test(texto)) return { codigo, texto: LIMITE }
  if (/access token|session has expired/i.test(texto)) return { codigo, texto: EXPIROU }
  return { codigo, texto: GENERICO }
}

export function mensagemDeFalha(err: unknown): string {
  return falhaDoEnvio(err).texto
}

/**
 * A falha que a Meta manda DEPOIS, no status `failed` do webhook: o envio foi
 * aceito e a entrega, recusada (é assim que o 131042 costuma chegar).
 */
export function textoDaFalhaDaMeta(codigo: number | null, titulo: string | null): string {
  const doCodigo = codigo !== null ? textoDoCodigo(codigo) : null
  if (doCodigo) return doCodigo
  return titulo ? `A Meta não entregou: ${titulo}.` : 'A Meta não entregou esta mensagem.'
}
