'use server'

import { iniciarCadastroDoAutenticador, confirmarCodigo } from '@estetica-os/nucleo/lib/plataforma/verificacao'

/**
 * A verificação em duas etapas (o trabalho é do núcleo; ver lá). No sistema,
 * ADMIN e GERENTE (quem vê o sistema) — o proxy já desvia o SUPORTE, e a
 * action confere de novo.
 */
export async function iniciarVerificacao() {
  return iniciarCadastroDoAutenticador({ verSistema: true })
}

export async function confirmarVerificacao(factorId: string, codigo: string) {
  return confirmarCodigo(factorId, codigo, { verSistema: true })
}
