import { maskCPF } from '@estetica-os/utils'

/**
 * O documento da cliente para MOSTRAR (A45 da 11ª: "CPF 00515996270" no
 * checkout): o CPF (11 dígitos) com a máscara; o passaporte e o RNE, como
 * vieram — o `maskCPF` tira as letras e os mutilaria.
 */
export function documentoNaTela(doc: string): string {
  return doc.replace(/\D/g, '').length === 11 && !/[a-z]/i.test(doc) ? maskCPF(doc) : doc
}
