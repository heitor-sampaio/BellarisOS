'use server'

import { iniciarCadastroDoAutenticador, confirmarCodigo } from '@estetica-os/nucleo/lib/plataforma/verificacao'

/**
 * A verificação em duas etapas (o trabalho é do núcleo; ver lá). No sistema,
 * só ADMIN — o proxy já desvia o SUPORTE, e a action confere de novo.
 */
export async function iniciarVerificacao() {
  return iniciarCadastroDoAutenticador({ papel: 'ADMIN' })
}

export async function confirmarVerificacao(factorId: string, codigo: string) {
  return confirmarCodigo(factorId, codigo, { papel: 'ADMIN' })
}
