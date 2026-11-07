/**
 * O número do endereço da unidade (A7 da 9ª simulação, 2026-11-07): o CEP
 * preenche o logradouro e o bairro ("Rua Padre Chagas — Moinhos de Vento"), e
 * a unidade nova não tinha onde pôr o número. Ele entra depois do logradouro:
 * "Rua Padre Chagas, 123 — Moinhos de Vento". Sem número, o endereço como está.
 * Puro: a tela e o servidor dividem.
 */
export function enderecoComNumero(endereco: string | null | undefined, numero: string | null | undefined): string | null {
  const e = (endereco ?? '').trim()
  const n = (numero ?? '').trim()
  if (!n) return e || null
  if (!e) return n
  const [logradouro, ...resto] = e.split(' — ')
  return [`${logradouro!.trim()}, ${n}`, ...resto].join(' — ')
}
