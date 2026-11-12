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

/**
 * O inverso, para editar (D9 da 13ª simulação, F70): "Rua Padre Chagas, 123 —
 * Moinhos de Vento" → o logradouro com o bairro e o número, separados. Só o
 * que parece número ("123", "45A", "s/n") depois da ÚLTIMA vírgula do
 * logradouro sai dele; "Rua Sete, sala 2" fica como está.
 */
export function separarNumero(endereco: string | null | undefined): { endereco: string; numero: string } {
  const e = (endereco ?? '').trim()
  const [logradouro, ...resto] = e.split(' — ')
  const m = /^(.*),\s*(\d+[A-Za-z]?|s\/n)$/i.exec((logradouro ?? '').trim())
  if (!m) return { endereco: e, numero: '' }
  return { endereco: [m[1]!.trim(), ...resto].join(' — '), numero: m[2]! }
}
