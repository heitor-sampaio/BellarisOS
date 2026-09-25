/**
 * Os dados de identificação que só o Heitor pode preencher.
 *
 * Ficam isolados aqui de propósito: o texto da política é sobre o que o sistema
 * FAZ, e isso eu sei pelo código. Razão social, CNPJ, endereço e o e-mail do
 * encarregado são fatos do mundo — inventar qualquer um deles tornaria o
 * documento falso, e uma política de privacidade falsa é pior que nenhuma.
 *
 * Enquanto algum campo estiver vazio, a página mostra um aviso em vez do dado —
 * ela não finge que a informação existe.
 */
export const CONTROLADOR = {
  /** Razão social completa, como no CNPJ. */
  razaoSocial: '',
  /** Só os dígitos ou formatado — como preferir exibir. */
  cnpj: '',
  /** Endereço da sede. */
  endereco: '',
  /**
   * Encarregado pelo tratamento de dados (DPO), art. 41 da LGPD.
   * É o canal que o titular usa para exercer os direitos dele.
   */
  encarregado: {
    nome:  '',
    email: '',
  },
  /** Canal geral de contato, se for diferente do encarregado. */
  emailContato: '',
} as const

/** Data da última revisão do texto. Mudou o texto, muda aqui. */
export const ATUALIZADA_EM = '2026-09-25'

export function faltaPreencher(): string[] {
  const faltando: string[] = []
  if (!CONTROLADOR.razaoSocial)          faltando.push('razão social')
  if (!CONTROLADOR.cnpj)                 faltando.push('CNPJ')
  if (!CONTROLADOR.endereco)             faltando.push('endereço')
  if (!CONTROLADOR.encarregado.nome)     faltando.push('nome do encarregado')
  if (!CONTROLADOR.encarregado.email)    faltando.push('e-mail do encarregado')
  return faltando
}
