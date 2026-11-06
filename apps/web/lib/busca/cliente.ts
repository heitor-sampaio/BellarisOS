import { casaComTermo } from '@/lib/busca/texto'

/**
 * A busca de cliente numa regra só (D6 da 8ª simulação, 2026-11-06) — o
 * espelho, no navegador, da regra do banco (`busca_universal`,
 * `buscar_clientes`, `busca_clientes_arquivados`; migration
 * 20261106003401): sem acento, todas as palavras em qualquer ordem, e o
 * telefone por DÍGITOS quando o termo é um telefone (sem letra), com o 55 do
 * WhatsApp e o nono dígito do celular tolerados. A lista de Clientes filtrava
 * com `toLowerCase().includes` e o telefone cru: "Zelia" não achava "Zélia",
 * e "85991000034" não achava "(85) 99100-0034". Se as duas divergirem, a lista
 * esconde quem o modal e o Ctrl K acham.
 */

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Os dígitos nacionais: o 55 do país sai do número de 12 ou 13 dígitos. */
export function telefoneNacional(v: string | null | undefined): string {
  const d = soDigitos(v)
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

/** O celular com DDD (11 dígitos, o 3º é o 9) sem o nono dígito. */
function semNono(nacional: string): string {
  return nacional.length === 11 && nacional[2] === '9' ? nacional.slice(0, 2) + nacional.slice(3) : nacional
}

/** `private.telefone_casa`: o telefone gravado casa com os dígitos digitados. */
export function telefoneCasaComDigitos(telefone: string | null | undefined, digitos: string): boolean {
  if (!/^\d{3,}$/.test(digitos)) return false
  const tel = soDigitos(telefone)
  if (tel.includes(digitos)) return true
  const nac = telefoneNacional(telefone)
  const termo = telefoneNacional(digitos)
  if (termo.length < 3) return false
  return nac.includes(termo) || semNono(nac).includes(semNono(termo))
}

/** A ficha casa com o termo da busca: o nome (e o que mais vier) sem acento, ou o telefone. */
export function clienteCasaComBusca(c: { name: string; phone?: string | null; email?: string | null }, termo: string): boolean {
  const t = termo.trim()
  if (!t) return true
  if (casaComTermo(t, [c.name, c.email ?? '', soDigitos(c.phone)])) return true
  if (/\p{L}/u.test(t)) return false
  return telefoneCasaComDigitos(c.phone, soDigitos(t))
}
