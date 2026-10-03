import { contemSemAcento } from '@/lib/texto'

/**
 * A busca do inbox, no navegador — a guarda do que chega pelo realtime.
 *
 * Tem de casar com a cláusula da busca de `inbox_pagina` (migration
 * 20261003000001): sem acento, e o telefone também por dígitos a partir de 3.
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
  if (contemSemAcento([c.contact_name, c.last_message, c.contact_phone, ...(c.lead_tags ?? [])], t)) return true
  const digitos = t.replace(/\D/g, '')
  return digitos.length >= 3 && (c.contact_phone ?? '').replace(/\D/g, '').includes(digitos)
}
