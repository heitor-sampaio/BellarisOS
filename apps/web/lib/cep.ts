export interface CepResult {
  /** Logradouro e bairro juntos ("Rua X — Bairro"), como a ficha usa. */
  address: string
  /** Os dois separados, para o formulário que tem campo de bairro. */
  street: string
  neighborhood: string
  city: string
  uf: string
}

export async function fetchCep(rawCep: string): Promise<CepResult | null> {
  const digits = rawCep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    const address = [data.logradouro, data.bairro].filter(Boolean).join(' — ')
    return { address, street: data.logradouro ?? '', neighborhood: data.bairro ?? '', city: data.localidade, uf: data.uf }
  } catch {
    return null
  }
}
