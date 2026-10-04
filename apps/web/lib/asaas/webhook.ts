import crypto from 'node:crypto'

/**
 * O webhook do Asaas se autentica pelo header `asaas-access-token`, com o
 * token que NÓS definimos ao criar o webhook no painel (32+ caracteres). Sem
 * token configurado, recusa tudo — comparar com vazio aceitaria qualquer um.
 */
export function tokenDoWebhookConfere(recebido: string | null | undefined, esperado = process.env.ASAAS_WEBHOOK_TOKEN): boolean {
  if (!esperado || esperado.length < 32 || !recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Os eventos que mexem na cobrança (os outros só ficam registrados). */
export const EVENTOS_DE_COBRANCA = new Set([
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE',
  'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
])

export const EVENTOS_DE_ASSINATURA = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])
