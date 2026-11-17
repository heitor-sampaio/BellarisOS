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

/**
 * A18 da 19ª simulação (princípio 3): o CEP 60150-160 preencheu o bairro
 * "Centro" para a unidade que a pessoa chama de Aldeota — é o dado da busca de
 * CEP (um CEP geral cobre mais de um bairro), e ela corrigia à mão sem aviso. O
 * bairro que veio da busca fica marcado para conferir, até a pessoa mexer.
 */
export function avisoDoBairroDoCep(bairro: string | null | undefined): string | null {
  const b = bairro?.trim()
  return b ? `O bairro “${b}” veio da busca do CEP: confira.` : null
}

/**
 * A UF que falta no endereço da unidade (A21 da 20ª simulação; princípio 2:
 * avisar, não recusar): o CEP geral não preenche o endereço, a cidade foi
 * escrita à mão e a unidade salvou sem a UF — a lista mostrava "Belém", sem
 * "· PA", e os documentos usam a UF.
 */
export function avisoDaUfQueFalta(endereco: { cidade: string | null | undefined; uf: string | null | undefined }): string | null {
  return endereco.cidade?.trim() && !endereco.uf?.trim() ? 'Falta a UF: os documentos da unidade saem sem ela.' : null
}

/**
 * A28 da 22ª simulação (princípio 3): o CEP "não encontrado" no /setup deixava
 * seguir sem cidade nem UF, e o app da cliente mostrou "100, 65075-000". O CEP
 * não encontrado diz o que fazer, e o CEP preenchido sem cidade pede a cidade
 * e a UF ali, à vista (avisa, não recusa — princípio 2).
 */
export const CEP_NAO_ENCONTRADO = 'CEP não encontrado: escreva a cidade e a UF abaixo.'

export function avisoDoEnderecoQueFalta(endereco: {
  cep: string | null | undefined; cidade: string | null | undefined; uf: string | null | undefined
}): string | null {
  const temCep = (endereco.cep ?? '').replace(/\D/g, '').length === 8
  if (temCep && !endereco.cidade?.trim()) {
    return endereco.uf?.trim() ? 'Escreva a cidade: o CEP não a trouxe.' : 'Escreva a cidade e a UF: o CEP não as trouxe.'
  }
  return avisoDaUfQueFalta(endereco)
}
