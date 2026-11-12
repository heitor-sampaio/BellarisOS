import { casaComTermo } from '@/lib/busca/texto'
import { telefoneCasaComDigitos } from '@/lib/busca/cliente'

/**
 * A busca do inbox, no navegador — a guarda do que chega pelo realtime.
 *
 * Tem de casar com a cláusula da busca de `inbox_pagina` (migration
 * 20261112007001): a regra da busca de cliente (D6 da 8ª; C31 do levantamento,
 * F70) — sem acento, TODAS as palavras em qualquer ordem, e o telefone por
 * dígitos a partir de 3 — só quando o termo é um telefone, SEM letra —, com o
 * 55 do WhatsApp e o nono dígito tolerados (`private.telefone_casa`). Com
 * letra, os dígitos soltos ("Nome da pessoa muyl997q") achavam todo telefone
 * com "997".
 * Se as duas divergirem, o banco devolve a conversa e a tela a esconde — foi
 * o que aconteceu quando o banco passou a ignorar acento e a tela não.
 */
export function conversaCasaComBusca(c: {
  contact_name:  string | null
  last_message:  string | null
  contact_phone: string | null
  lead_tags?:    string[] | null
}, termo: string): boolean {
  const t = termo.trim()
  if (!t) return true
  if (casaComTermo(t, [c.contact_name ?? '', c.last_message ?? '', c.contact_phone ?? '', ...(c.lead_tags ?? [])])) return true
  if (/\p{L}/u.test(t)) return false
  return telefoneCasaComDigitos(c.contact_phone, t.replace(/\D/g, ''))
}
