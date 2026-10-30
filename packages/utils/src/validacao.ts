import { maskPhone } from './format'

/**
 * O CPF digitado vale: 11 dígitos, os dois verificadores conferidos, e não é
 * uma sequência repetida (111.111.111-11 "fecha" a conta e não é de ninguém).
 * Até 2026-10-29 o cadastro só conferia o TAMANHO, e o 11111111111 virava a
 * senha inicial do login da cliente (D12 da simulação). A conta é UMA: o
 * cadastro, o acesso ao app, o Copilot e a importação usam esta.
 */
export function cpfValido(cpf: string | null | undefined): boolean {
  const c = (cpf ?? '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/**
 * O telefone NACIONAL — DDD + número, 10 (fixo) ou 11 (celular) dígitos —,
 * ou nulo. O 55 do WhatsApp (e o "+55") é tirado, como em `maskPhone`. Sem DDD
 * não se adivinha a cidade; incompleto não é telefone: "(41) 9920" passava no
 * cadastro e a ficha mostrava "(41) 9920-" (D13 da simulação de 2026-10-29).
 */
export function telefoneNacional(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  const nacional = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
  return nacional.length === 10 || nacional.length === 11 ? nacional : null
}

/**
 * O telefone de OUTRO PAÍS: começa com "+" e o código do país (que não é o 55
 * — o "+55" é o Brasil e segue `telefoneNacional`), 8 a 15 dígitos (o teto do
 * E.164). Volta como foi escrito, com os espaços repetidos juntados; letra,
 * curto ou longo demais é nulo. Decisão do Heitor (frente de cadastro,
 * 2026-10-29): o D13 passou a recusar todo número que não fosse brasileiro, e
 * a cliente de Portugal não tinha como ser cadastrada. Sem o "+" não se
 * adivinha o país: o número é lido como nacional.
 */
export function telefoneInternacional(telefone: string | null | undefined): string | null {
  const s = (telefone ?? '').trim()
  if (!s.startsWith('+') || /[^\d\s().-]/.test(s.slice(1))) return null
  const d = s.replace(/\D/g, '')
  if (d.startsWith('55') || d.length < 8 || d.length > 15) return null
  return s.replace(/\s+/g, ' ')
}

/**
 * O telefone que o CADASTRO aceita (a ficha nova e a aba Dados): o nacional,
 * gravado com a máscara, ou o de outro país, gravado como foi escrito.
 * `digitos` é a chave que compara dois telefones (o aviso de número repetido,
 * `cliente_por_telefone`).
 */
export function telefoneDoCadastro(telefone: string | null | undefined): { digitos: string; gravar: string } | null {
  const deFora = telefoneInternacional(telefone)
  if (deFora) return { digitos: deFora.replace(/\D/g, ''), gravar: deFora }
  const nacional = telefoneNacional(telefone)
  return nacional ? { digitos: nacional, gravar: maskPhone(nacional) } : null
}

/** Os tipos de documento da ficha (D-11, 2026-10-29). O CPF mora em `clients.document`; os outros, em `documento_tipo`/`documento_numero`. */
export const TIPOS_DE_DOCUMENTO = [
  { valor: 'CPF', rotulo: 'CPF' },
  { valor: 'PASSAPORTE', rotulo: 'Passaporte' },
  { valor: 'RNE', rotulo: 'RNE' },
] as const
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number]['valor']

/**
 * O número do passaporte ou do RNE (D-11, decisão do Heitor de 2026-10-29):
 * texto livre RAZOÁVEL — letras e números, com hífen, ponto ou barra no meio,
 * pelo menos um número, 5 a 20 caracteres. Volta em maiúsculas e sem espaço
 * (é a chave da unicidade na rede); o ilegível é nulo.
 */
export function documentoEstrangeiro(numero: string | null | undefined): string | null {
  const s = (numero ?? '').toUpperCase().replace(/\s+/g, '')
  if (s.length < 5 || s.length > 20 || !/\d/.test(s)) return null
  return /^[A-Z0-9][A-Z0-9./-]*[A-Z0-9]$/.test(s) ? s : null
}
