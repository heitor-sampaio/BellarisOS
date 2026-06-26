export interface CepResult {
  address: string
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
    return { address, city: data.localidade, uf: data.uf }
  } catch {
    return null
  }
}
