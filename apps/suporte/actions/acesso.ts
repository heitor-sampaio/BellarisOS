'use server'

import {
  entrarNaPlataforma, sairDaPlataforma, pedirNovaSenhaNaPlataforma, trocarSenhaNaPlataforma,
  type EstadoDoLogin, type EstadoDoPedido,
} from '@estetica-os/nucleo/lib/plataforma/acesso'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * O acesso ao suporte — o núcleo faz o trabalho (`lib/plataforma/acesso.ts`).
 */
export async function entrar(_estado: EstadoDoLogin, formData: FormData): Promise<EstadoDoLogin> {
  return entrarNaPlataforma('suporte', formData)
}

export async function sair(): Promise<void> {
  await sairDaPlataforma()
}

export async function pedirNovaSenha(_estado: EstadoDoPedido, formData: FormData): Promise<EstadoDoPedido> {
  return pedirNovaSenhaNaPlataforma(formData, urlDoHost('suporte'))
}

export async function trocarSenha(_estado: EstadoDoLogin, formData: FormData): Promise<EstadoDoLogin> {
  return trocarSenhaNaPlataforma(formData)
}
