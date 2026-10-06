import 'server-only'

/**
 * O cliente da API do ASAAS (cobrança das assinaturas das redes) — v3.
 *
 * - A chave (`ASAAS_API_KEY`) só existe no servidor; `ASAAS_AMBIENTE` escolhe
 *   sandbox ou produção (padrão: sandbox — produção só de propósito).
 * - `ASAAS_BASE_URL_TESTE` é a COSTURA do E2E: aponta para o Asaas falso em
 *   127.0.0.1 (`e2e/apoio/asaas-falso.ts`). Nunca em produção.
 * - O Asaas aceita cliente DUPLICADO e não tem chave de idempotência: antes de
 *   criar, procura pelo `externalReference` (o id da rede).
 */
const BASES = {
  sandbox:  'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
} as const

export type AmbienteDoAsaas = keyof typeof BASES

export function configDoAsaas(): { ambiente: AmbienteDoAsaas; base: string; temChave: boolean; temTokenDoWebhook: boolean } {
  const ambiente: AmbienteDoAsaas = process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox'
  return {
    ambiente,
    base: process.env.ASAAS_BASE_URL_TESTE || BASES[ambiente],
    temChave: !!process.env.ASAAS_API_KEY,
    temTokenDoWebhook: (process.env.ASAAS_WEBHOOK_TOKEN ?? '').length >= 32,
  }
}

export class ErroDoAsaas extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function chamar<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
  const chave = process.env.ASAAS_API_KEY
  if (!chave) throw new ErroDoAsaas('A integração com o Asaas não está configurada (ASAAS_API_KEY).', 0)
  const { base } = configDoAsaas()
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      access_token: chave,
      'Content-Type': 'application/json',
      // Obrigatório para contas criadas depois de 13/06/2024.
      'User-Agent': 'BellarisOS',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: 'no-store',
  })
  const texto = await r.text()
  let json: unknown = null
  try { json = texto ? JSON.parse(texto) : null } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    const erros = (json as { errors?: { description?: string }[] } | null)?.errors
    const msg = erros?.map(e => e.description).filter(Boolean).join(' ') ||
      (r.status === 429 ? 'O Asaas pediu para esperar (limite de requisições).' : `O Asaas respondeu ${r.status}.`)
    throw new ErroDoAsaas(msg, r.status)
  }
  return json as T
}

export interface RedeParaOAsaas {
  id: string; nome: string; documento: string | null; email: string; telefone: string | null
}

/** O cliente da rede no Asaas: o que já existe (pelo id da rede), ou um novo. */
export async function garantirCliente(rede: RedeParaOAsaas): Promise<string> {
  if (!rede.documento) throw new ErroDoAsaas('A rede precisa de CPF ou CNPJ para ser cobrada.', 0)
  const achados = await chamar<{ data: { id: string; deleted?: boolean }[] }>(
    'GET', `/customers?externalReference=${encodeURIComponent(rede.id)}&limit=1`)
  const existente = achados.data?.find(c => !c.deleted)
  if (existente) return existente.id
  const novo = await chamar<{ id: string }>('POST', '/customers', {
    name: rede.nome, cpfCnpj: rede.documento, email: rede.email,
    mobilePhone: rede.telefone ?? undefined, externalReference: rede.id,
  })
  return novo.id
}

/** Os dados da rede mudaram no /sistema: o cliente no Asaas acompanha. */
export async function atualizarCliente(id: string, rede: Omit<RedeParaOAsaas, 'id'>): Promise<void> {
  await chamar('PUT', `/customers/${encodeURIComponent(id)}`, {
    name: rede.nome, cpfCnpj: rede.documento ?? undefined, email: rede.email, mobilePhone: rede.telefone ?? undefined,
  })
}

export interface AssinaturaDoAsaas { id: string; status?: string; deleted?: boolean }

/** A assinatura MENSAL da rede; a clínica escolhe Pix, boleto ou cartão na fatura. */
export async function criarAssinatura(p: {
  cliente: string; valorCentavos: number; vencimento: string; descricao: string; redeId: string
}): Promise<AssinaturaDoAsaas> {
  return chamar<AssinaturaDoAsaas>('POST', '/subscriptions', {
    customer: p.cliente, billingType: 'UNDEFINED', cycle: 'MONTHLY',
    value: p.valorCentavos / 100, nextDueDate: p.vencimento,
    description: p.descricao.slice(0, 500), externalReference: p.redeId,
  })
}

/** Novo valor — vale também para as cobranças já geradas e ainda em aberto. */
export async function atualizarValorDaAssinatura(id: string, valorCentavos: number, descricao: string): Promise<void> {
  await chamar('PUT', `/subscriptions/${encodeURIComponent(id)}`, {
    value: valorCentavos / 100, description: descricao.slice(0, 500), updatePendingPayments: true,
  })
}

/** Encerra a assinatura: o Asaas exclui as cobranças em aberto (as pagas ficam). */
export async function removerAssinatura(id: string): Promise<void> {
  await chamar('DELETE', `/subscriptions/${encodeURIComponent(id)}`)
}

export interface CobrancaDoAsaas {
  id: string; subscription?: string | null; customer?: string; value: number; dueDate: string
  status: string; paymentDate?: string | null; clientPaymentDate?: string | null
  invoiceUrl?: string | null; deleted?: boolean
}

/** As cobranças já geradas de uma assinatura (a reconciliação). */
export async function cobrancasDaAssinatura(id: string): Promise<CobrancaDoAsaas[]> {
  const r = await chamar<{ data: CobrancaDoAsaas[] }>('GET', `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`)
  return r.data ?? []
}
