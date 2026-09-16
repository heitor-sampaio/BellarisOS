/**
 * Programa de integrador da Z-API.
 *
 * Permite que a rede conecte o WhatsApp sem ter conta na Z-API: as instâncias
 * são criadas na NOSSA conta, e a clínica só escaneia o QR dentro do BellarisOS.
 *
 * ⚠️ Quem paga somos nós. A Z-API cobra o integrador por todas as instâncias
 * criadas, em fatura fechada no dia 5 do mês seguinte. Instância de rede que
 * saiu e não foi cancelada é prejuízo recorrente e silencioso — por isso
 * `cancelarInstancia` existe e precisa ser chamada quando a conexão é removida.
 */

const BASE = 'https://api.z-api.io'

/** Token de parceiro. Sem ele o recurso inteiro fica indisponível. */
function partnerToken(): string {
  const token = process.env.ZAPI_PARTNER_TOKEN
  if (!token) {
    throw new Error(
      'Conexão gerenciada indisponível: falta ZAPI_PARTNER_TOKEN no ambiente.',
    )
  }
  return token
}

/**
 * Client-Token da nossa conta.
 *
 * Opcional: só é exigido quando o "token de segurança" está ligado no painel.
 * Mandar quando existe evita que ligar essa opção mais tarde quebre tudo sem
 * aviso.
 */
function headersDaInstancia(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  if (clientToken) h['Client-Token'] = clientToken
  return h
}

function urlDaInstancia(id: string, token: string, path: string): string {
  return `${BASE}/instances/${id}/token/${token}${path}`
}

async function chamar(url: string, init: RequestInit, contexto: string): Promise<any> {
  const res = await fetch(url, init)
  const texto = await res.text()

  let body: any = null
  try { body = texto ? JSON.parse(texto) : null } catch { /* resposta não-JSON */ }

  if (!res.ok) {
    // Token errado não produz um erro legível: a Z-API devolve estouro interno
    // ao tentar parseá-lo ("Range [0, 32) out of bounds..."), o que não diz nada
    // a quem está olhando a tela.
    const pareceTokenInvalido =
      res.status === 401 || res.status === 403 ||
      /out of bounds|unauthorized|invalid token|forbidden/i.test(texto)

    if (pareceTokenInvalido) {
      console.error(`${contexto} [token de integrador]:`, texto)
      throw new Error(
        'O token de integrador da Z-API foi recusado. Confira ZAPI_PARTNER_TOKEN no ambiente.',
      )
    }
    throw new Error(`${contexto}: ${body?.error ?? body?.message ?? texto ?? `HTTP ${res.status}`}`)
  }
  return body
}

// -- Ciclo de vida da instância -----------------------------------------------

export interface InstanciaCriada {
  id:    string
  token: string
  /** Fim do período de avaliação, em epoch ms. */
  due:   number
}

/**
 * Cria uma instância na nossa conta e já a aponta para o nosso webhook.
 *
 * Configurar os callbacks AQUI, e não depois, é deliberado: uma instância que
 * nasce sem webhook conecta normalmente, a clínica vê "conectado" e nenhuma
 * mensagem chega — falha silenciosa que só aparece quando um cliente reclama.
 *
 * A instância nasce com 2 dias de avaliação e é apagada sozinha se ninguém
 * assinar. `due` diz até quando.
 */
export async function criarInstancia(
  nome:       string,
  webhookUrl: string,
): Promise<InstanciaCriada> {
  const body = await chamar(
    `${BASE}/instances/integrator/on-demand`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${partnerToken()}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        name:        nome,
        sessionName: nome,
        // Recebidas e status de entrega caem na mesma rota: o handler já
        // distingue os dois pelo formato do payload.
        receivedCallbackUrl:      webhookUrl,
        messageStatusCallbackUrl: webhookUrl,
        // Chamada de voz no WhatsApp não tem para onde ir num inbox de texto.
        callRejectAuto:    true,
        callRejectMessage: 'Não atendemos por chamada aqui. Pode escrever que respondemos por mensagem.',
      }),
    },
    'Falha ao criar a instância na Z-API',
  )

  if (!body?.id || !body?.token) {
    throw new Error('A Z-API não devolveu id e token da instância.')
  }
  return { id: body.id, token: body.token, due: body.due ?? 0 }
}

/**
 * Cancela a assinatura da instância.
 *
 * A instância segue ativa até o fim do mês corrente — a Z-API não devolve o
 * proporcional. Cancelar cedo não adianta nada; cancelar tarde custa mais um mês.
 */
export async function cancelarInstancia(id: string, token: string): Promise<void> {
  await chamar(
    urlDaInstancia(id, token, '/integrator/on-demand/cancel'),
    { method: 'POST', headers: { 'Authorization': `Bearer ${partnerToken()}` } },
    'Falha ao cancelar a instância na Z-API',
  )
}

// -- Conexão do aparelho ------------------------------------------------------

/**
 * QR code para parear o celular, já como data URL.
 *
 * O WhatsApp invalida o código a cada 20 segundos, então a tela precisa
 * repetir a chamada — não adianta buscar uma vez e deixar na tela.
 */
export async function qrCodeDaInstancia(id: string, token: string): Promise<string | null> {
  const body = await chamar(
    urlDaInstancia(id, token, '/qr-code/image'),
    { method: 'GET', headers: headersDaInstancia() },
    'Falha ao obter o QR code',
  )
  // Instância já conectada devolve `{ connected: true }` em vez do código.
  return (body?.value as string) ?? null
}

/**
 * Código de 8 dígitos para parear digitando, em vez de escanear.
 *
 * Serve para quem opera o WhatsApp no mesmo aparelho que está usando o sistema
 * e não tem uma segunda tela para ler o QR.
 */
export async function codigoDePareamento(
  id: string, token: string, telefone: string,
): Promise<string | null> {
  const body = await chamar(
    urlDaInstancia(id, token, `/phone-code/${telefone.replace(/\D/g, '')}`),
    { method: 'GET', headers: headersDaInstancia() },
    'Falha ao gerar o código de pareamento',
  )
  return (body?.code as string) ?? null
}

export interface StatusInstancia {
  connected:           boolean
  /** O celular está alcançável. Falso aqui = mensagem não sai, mesmo conectado. */
  smartphoneConnected: boolean
  error:               string | null
}

export async function statusDaInstancia(id: string, token: string): Promise<StatusInstancia> {
  const body = await chamar(
    urlDaInstancia(id, token, '/status'),
    { method: 'GET', headers: headersDaInstancia() },
    'Falha ao consultar o status',
  )
  return {
    connected:           body?.connected === true,
    smartphoneConnected: body?.smartphoneConnected === true,
    error:               (body?.error as string) || null,
  }
}

export interface DispositivoConectado {
  phone:      string | null
  name:       string | null
  imgUrl:     string | null
  isBusiness: boolean
}

/** Qual número está conectado — é o que a tela mostra depois do pareamento. */
export async function dispositivoDaInstancia(
  id: string, token: string,
): Promise<DispositivoConectado | null> {
  try {
    const body = await chamar(
      urlDaInstancia(id, token, '/device'),
      { method: 'GET', headers: headersDaInstancia() },
      'Falha ao consultar o aparelho',
    )
    if (!body?.phone) return null
    return {
      phone:      body.phone ?? null,
      name:       body.name ?? null,
      imgUrl:     body.imgUrl ?? null,
      isBusiness: body.isBusiness === true,
    }
  } catch {
    // Antes de parear, `/device` responde erro. Não é falha: é "ainda não".
    return null
  }
}

/** Desliga o celular da instância, sem cancelar a assinatura. */
export async function desconectarInstancia(id: string, token: string): Promise<void> {
  await chamar(
    urlDaInstancia(id, token, '/disconnect'),
    { method: 'GET', headers: headersDaInstancia() },
    'Falha ao desconectar',
  )
}
