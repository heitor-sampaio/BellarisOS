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
  const l = logradouro!.trim()
  const sentido = SENTIDO_NO_LOGRADOURO.exec(l)
  if (sentido) return [`${l.slice(0, sentido.index).trim()}, ${n}-${sentido[1]!.toUpperCase()}`, ...resto].join(' — ')
  return [`${l}, ${n}`, ...resto].join(' — ')
}

/**
 * O número sem o logradouro (A8 da 33ª simulação; UN-05: o número entra
 * DEPOIS do logradouro): o "200" sozinho era gravado como o endereço, e a
 * edição o abria como logradouro. Um número sem a rua não é endereço — é o
 * impossível do princípio 2, e o servidor recusa (decisão do Claude, 26/11).
 */
export function numeroSemLogradouro(endereco: string | null | undefined, numero: string | null | undefined): boolean {
  return !!(numero ?? '').trim() && !(endereco ?? '').trim()
}

export const NUMERO_SEM_LOGRADOURO = 'Preencha o logradouro: o número entra depois dele.'

/**
 * O sentido da numeração (A32 da 32ª simulação, decisão do Claude, 26/11): em
 * Chapecó os Correios escrevem "Avenida Getúlio Dorneles Vargas - N" (o
 * ViaCEP o traz no logradouro), e o endereço é "Av. Getúlio Vargas, 957-S".
 * A letra é dado (sem ela, o endereço é outro): com o número, ela vai para
 * depois dele; sem número, o logradouro fica como os Correios o escrevem.
 */
const SENTIDO_NO_LOGRADOURO = /\s+-\s+([NSLOED])$/i

/**
 * O inverso, para editar (D9 da 13ª simulação, F70): "Rua Padre Chagas, 123 —
 * Moinhos de Vento" → o logradouro com o bairro e o número, separados. Só o
 * que parece número ("123", "45A", "s/n") depois da ÚLTIMA vírgula do
 * logradouro sai dele; "Rua Sete, sala 2" fica como está.
 */
export function separarNumero(endereco: string | null | undefined): { endereco: string; numero: string } {
  const e = (endereco ?? '').trim()
  const [logradouro, ...resto] = e.split(' — ')
  const comSentido = /^(.*),\s*(\d+)-([NSLOED])$/i.exec((logradouro ?? '').trim())
  if (comSentido) return { endereco: [`${comSentido[1]!.trim()} - ${comSentido[3]!.toUpperCase()}`, ...resto].join(' — '), numero: comSentido[2]! }
  const m = /^(.*),\s*(\d+[A-Za-z]?|s\/n)$/i.exec((logradouro ?? '').trim())
  if (!m) return { endereco: e, numero: '' }
  return { endereco: [m[1]!.trim(), ...resto].join(' — '), numero: m[2]! }
}
