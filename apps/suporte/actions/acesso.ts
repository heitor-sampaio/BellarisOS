'use server'

import { headers } from 'next/headers'
import {
  entrarNaPlataforma, sairDaPlataforma, pedirNovaSenhaNaPlataforma, trocarSenhaNaPlataforma,
  type EstadoDoLogin, type EstadoDoPedido,
} from '@estetica-os/nucleo/lib/plataforma/acesso'
import { origemPublicaDe } from '@estetica-os/nucleo/lib/origem'

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
  return pedirNovaSenhaNaPlataforma(formData, origemPublicaDe(await headers()))
}

export async function trocarSenha(_estado: EstadoDoLogin, formData: FormData): Promise<EstadoDoLogin> {
  return trocarSenhaNaPlataforma(formData)
}
