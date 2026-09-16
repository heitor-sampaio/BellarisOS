/**
 * Ciclo de vida das instâncias na uazapi.
 *
 * A rede conecta o WhatsApp por QR dentro do BellarisOS: a instância nasce na
 * NOSSA conta, e a clínica só escaneia. Substituiu o programa de integrador da
 * Z-API, que tinha teto de 25 por token.
 *
 * Dois níveis de credencial: `admintoken` provisiona, `token` da instância
 * opera. Nenhum dos dois pode chegar ao browser.
 */

const TIMEOUT_MS = 30_000

function baseUrl(): string {
  const url = process.env.UAZAPI_BASE_URL
  if (!url) {
    throw new Error('Conexão gerenciada indisponível: falta UAZAPI_BASE_URL no ambiente.')
  }
  return url.replace(/\/$/, '')
}

function adminToken(): string {
  const token = process.env.UAZAPI_ADMIN_TOKEN
  if (!token) {
    throw new Error('Conexão gerenciada indisponível: falta UAZAPI_ADMIN_TOKEN no ambiente.')
  }
  return token
}

export function conexaoGerenciadaDisponivel(): boolean {
  return !!(process.env.UAZAPI_BASE_URL && process.env.UAZAPI_ADMIN_TOKEN)
}

async function chamar(
  url: string,
  init: RequestInit,
  contexto: string,
): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const texto = await res.text()

  let body: any = null
  try { body = texto ? JSON.parse(texto) : null } catch { /* não-JSON */ }

  if (!res.ok) {
    // Credencial recusada não produz mensagem útil sozinha — e o detalhe técnico
    // não diz nada a quem está olhando a tela.
    if (res.status === 401 || res.status === 403) {
      console.error(`${contexto} [credencial]:`, texto)
      throw new Error('A uazapi recusou a credencial. Confira UAZAPI_ADMIN_TOKEN no ambiente.')
    }
    // O plano da conta tem limite de instâncias; sem traduzir, vira um HTTP nu
    // que ninguém liga à causa.
    if (res.status === 429) {
      throw new Error('O plano da uazapi atingiu o limite de instâncias ou de requisições.')
    }
    throw new Error(`${contexto}: ${body?.error ?? body?.message ?? texto ?? `HTTP ${res.status}`}`)
  }
  return body
}

const cabecalhoAdmin = () => ({ 'Content-Type': 'application/json', admintoken: adminToken() })
const cabecalhoToken = (token: string) => ({ 'Content-Type': 'application/json', token })

// -- Ciclo de vida -------------------------------------------------------------

export interface InstanciaCriada {
  token:        string
  instanceId:   string
  instanceName: string
}

/**
 * Cria a instância. Ela nasce desconectada — o pareamento é um passo à parte.
 *
 * ⚠️ Ao contrário da Z-API, a uazapi **não aceita URL de callback aqui**. O
 * webhook é um POST separado, e sem ele a instância conecta, a tela diz
 * "conectado" e nenhuma mensagem chega. Ver `configurarWebhook`.
 */
export async function criarInstancia(nome: string): Promise<InstanciaCriada> {
  const body = await chamar(
    `${baseUrl()}/instance/init`,
    { method: 'POST', headers: cabecalhoAdmin(), body: JSON.stringify({
      name: nome, instanceName: nome, systemName: 'BellarisOS',
    }) },
    'Falha ao criar a instância na uazapi',
  )

  const token = body?.token ?? body?.instance?.token
  if (!token) throw new Error('A uazapi não devolveu o token da instância.')

  return {
    token:        String(token),
    instanceId:   String(body?.instance?.id ?? ''),
    instanceName: String(body?.instance?.name ?? nome),
  }
}

/** Apaga de vez. Permanente e imediato — não há "cancelar e usar até o fim do mês". */
export async function removerInstancia(base: string, token: string): Promise<void> {
  await chamar(
    `${base.replace(/\/$/, '')}/instance`,
    { method: 'DELETE', headers: cabecalhoToken(token) },
    'Falha ao remover a instância na uazapi',
  )
}

/**
 * Aponta a instância para o nosso webhook.
 *
 * ⚠️ `excludeMessages` precisa ficar VAZIO. Com `wasSentByApi` ali, a uazapi
 * deixa de entregar os recibos das mensagens que nós enviamos — e aí nenhuma
 * mensagem sai do primeiro tique, sem erro nenhum aparecer.
 */
export async function configurarWebhook(base: string, token: string, url: string): Promise<void> {
  await chamar(
    `${base.replace(/\/$/, '')}/webhook`,
    { method: 'POST', headers: cabecalhoToken(token), body: JSON.stringify({
      url, events: ['messages', 'connection'], enabled: true, excludeMessages: [],
    }) },
    'Falha ao configurar o webhook na uazapi',
  )
}

/**
 * Ritmo entre mensagens, em SEGUNDOS.
 *
 * A unidade está confirmada: a instância nasce com 1 e 3. Tratar como
 * milissegundos colocaria vinte minutos de espera entre mensagens.
 */
export async function definirRitmo(
  base: string, token: string, minSeg = 1, maxSeg = 3,
): Promise<void> {
  await chamar(
    `${base.replace(/\/$/, '')}/instance/updateDelaySettings`,
    { method: 'POST', headers: cabecalhoToken(token), body: JSON.stringify({
      msg_delay_min: minSeg, msg_delay_max: maxSeg,
    }) },
    'Falha ao definir o ritmo de envio',
  )
}

// -- Conexão do aparelho -------------------------------------------------------

export interface Pareamento {
  qrcode:   string | null
  paircode: string | null
}

/**
 * Inicia o pareamento. Com `telefone`, devolve código de 8 dígitos; sem ele, QR.
 *
 * ⚠️ É ESCRITA e leva de 5 a 9 segundos. A tela não deve repetir esta chamada
 * em laço para atualizar o código — use `statusDaInstancia`, que é barata.
 */
export async function conectarInstancia(
  base: string, token: string, telefone?: string,
): Promise<Pareamento> {
  const body = await chamar(
    `${base.replace(/\/$/, '')}/instance/connect`,
    { method: 'POST', headers: cabecalhoToken(token), body: JSON.stringify(
      telefone ? { phone: telefone.replace(/\D/g, '') } : {},
    ) },
    'Falha ao iniciar o pareamento',
  )

  return {
    qrcode:   body?.instance?.qrcode   || body?.qrcode   || null,
    paircode: body?.instance?.paircode || body?.paircode || null,
  }
}

export interface StatusInstancia {
  connected: boolean
  loggedIn:  boolean
  /** JID do número pareado, ex.: `5511999999999@s.whatsapp.net`. */
  jid:       string | null
  /** Enquanto não pareou, o QR fica aqui — é o que a tela repete. */
  qrcode:    string | null
  paircode:  string | null
  nome:      string | null
}

export async function statusDaInstancia(base: string, token: string): Promise<StatusInstancia> {
  const body = await chamar(
    `${base.replace(/\/$/, '')}/instance/status`,
    { method: 'GET', headers: cabecalhoToken(token) },
    'Falha ao consultar o status',
  )

  return {
    connected: body?.status?.connected === true,
    loggedIn:  body?.status?.loggedIn === true,
    jid:       body?.status?.jid ?? null,
    qrcode:    body?.instance?.qrcode   || null,
    paircode:  body?.instance?.paircode || null,
    nome:      body?.instance?.profileName || null,
  }
}

/** Desliga o celular sem apagar a instância. */
export async function desconectarInstancia(base: string, token: string): Promise<void> {
  await chamar(
    `${base.replace(/\/$/, '')}/instance/disconnect`,
    { method: 'POST', headers: cabecalhoToken(token) },
    'Falha ao desconectar',
  )
}

// -- Proxy ---------------------------------------------------------------------

export interface EstadoProxy {
  /** `internal` = IP gerenciado pela uazapi; qualquer outro = contratado por nós. */
  modo:      string
  gerenciado: boolean
  pais:      string | null
  /** Só quando há proxy próprio. Nunca sai para o cliente. */
  url:       string | null
}

/**
 * Como esta instância sai para a internet.
 *
 * Toda instância nasce com proxy gerenciado pela uazapi (`internal`, IP no
 * Brasil). Isso é o que separa uma clínica da outra quando uma é banida — por
 * isso a tela mostra o modo, em vez de assumir que está tudo bem.
 */
export async function lerProxy(base: string, token: string): Promise<EstadoProxy | null> {
  try {
    const body = await chamar(
      `${base.replace(/\/$/, '')}/instance/proxy`,
      { method: 'GET', headers: cabecalhoToken(token) },
      'Falha ao consultar o proxy',
    )
    return {
      modo:       String(body?.effective_mode ?? body?.mode ?? 'desconhecido'),
      gerenciado: body?.managed === true,
      pais:       body?.proxy_managed_country || null,
      url:        body?.proxy_url || null,
    }
  } catch {
    return null
  }
}

/** Troca o proxy gerenciado por um IP contratado à parte. */
export async function definirProxy(base: string, token: string, proxyUrl: string): Promise<void> {
  await chamar(
    `${base.replace(/\/$/, '')}/instance/proxy`,
    { method: 'POST', headers: cabecalhoToken(token), body: JSON.stringify({
      enable: true, proxy_url: proxyUrl,
    }) },
    'Falha ao definir o proxy',
  )
}
