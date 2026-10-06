'use server'

import { iniciarCadastroDoAutenticador, confirmarCodigo } from '@estetica-os/nucleo/lib/plataforma/verificacao'

/** A verificação em duas etapas (o trabalho é do núcleo; ver lá). */
export async function iniciarVerificacao() {
  return iniciarCadastroDoAutenticador()
}

export async function confirmarVerificacao(factorId: string, codigo: string) {
  return confirmarCodigo(factorId, codigo)
}
