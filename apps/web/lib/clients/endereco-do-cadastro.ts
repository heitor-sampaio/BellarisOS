/**
 * O endereço do cadastro, do formulário para as colunas da ficha (A29 da 22ª
 * = A39 da 23ª simulação, 2026-11-17): o Novo cliente não tinha endereço, e o
 * contrato do pacote precisa dele. Os nomes dos campos são os da aba Dados
 * (`updateClientContactData`): CEP só com os dígitos, UF em maiúsculas, o
 * campo vazio vira nulo. Pura — o teste a chama sem banco.
 */
export interface EnderecoDoCadastro {
  zip_code:           string | null
  address:            string | null
  address_number:     string | null
  address_complement: string | null
  neighborhood:       string | null
  city:               string | null
  state:              string | null
}

const texto = (fd: FormData, campo: string, max = 200): string | null => {
  const v = String(fd.get(campo) ?? '').trim().slice(0, max)
  return v || null
}

export function enderecoDoFormulario(fd: FormData): EnderecoDoCadastro {
  const cep = String(fd.get('zip_code') ?? '').replace(/\D/g, '').slice(0, 8)
  const uf = texto(fd, 'state', 2)
  return {
    zip_code:           cep || null,
    address:            texto(fd, 'address'),
    address_number:     texto(fd, 'address_number', 20),
    address_complement: texto(fd, 'address_complement', 100),
    neighborhood:       texto(fd, 'neighborhood', 100),
    city:               texto(fd, 'city', 100),
    state:              uf ? uf.toUpperCase() : null,
  }
}

/** Só o que veio preenchido — o "unificar com a ficha que já existe" não apaga o endereço dela. */
export function soOPreenchido(e: EnderecoDoCadastro): Partial<EnderecoDoCadastro> {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== null)) as Partial<EnderecoDoCadastro>
}
