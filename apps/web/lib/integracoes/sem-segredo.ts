/**
 * Credencial de integração não vai ao navegador.
 *
 * A tela de integrações recebia o `config` inteiro das caixas de WhatsApp e
 * dos anúncios — token da uazapi, `accessToken` e `appSecret` da Meta, chaves
 * do Google Ads —, e quem abria a aba tinha o segredo no payload da página
 * (corrigido em 2026-10-03). Agora o segredo guardado vira o marcador
 * `SEGREDO_GUARDADO`: o formulário mostra que existe, e salvar com o marcador
 * MANTÉM o que está no banco (`mesclarSegredos`). Trocar é digitar um novo.
 *
 * Lista FECHADA do que é segredo: chave nova de credencial tem de entrar aqui,
 * senão volta a ir para a tela.
 */
export const SEGREDO_GUARDADO = '••••••••'

const CHAVES_SECRETAS: ReadonlySet<string> = new Set([
  'token', 'accessToken', 'access_token', 'appSecret', 'verifyToken', 'pin',
  'developerToken', 'clientSecret', 'refreshToken', 'adminToken',
])

export function ehChaveSecreta(chave: string): boolean {
  return CHAVES_SECRETAS.has(chave)
}

/**
 * O `config` como pode ir à tela: cada segredo preenchido vira o marcador —
 * também dentro de listas e objetos (`meta_messaging.pages[].access_token`
 * guarda o token de cada página).
 */
export function mascararSegredos(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return mascarar(config ?? {}) as Record<string, unknown>
}

function mascarar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(mascarar)
  if (!valor || typeof valor !== 'object') return valor
  const saida: Record<string, unknown> = {}
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!ehChaveSecreta(chave)) { saida[chave] = mascarar(v); continue }
    if (typeof v === 'string' && v.trim() !== '') saida[chave] = SEGREDO_GUARDADO
  }
  return saida
}

/**
 * O que gravar a partir do que a tela mandou: o marcador é trocado pelo valor
 * que já estava no banco (e some, se não havia nada lá).
 */
export function mesclarSegredos(
  novo: Record<string, string>,
  anterior: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(novo)) {
    if (valor !== SEGREDO_GUARDADO) { saida[chave] = valor; continue }
    const guardado = anterior?.[chave]
    if (typeof guardado === 'string' && guardado.trim() !== '') saida[chave] = guardado
  }
  return saida
}
