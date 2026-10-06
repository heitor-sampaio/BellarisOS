'use server'

import {
  entrarNaPlataforma, sairDaPlataforma, pedirNovaSenhaNaPlataforma, trocarSenhaNaPlataforma,
  type EstadoDoLogin, type EstadoDoPedido,
} from '@estetica-os/nucleo/lib/plataforma/acesso'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'
import { promoverSeForOAdmin, criarContaDoPrimeiroAdmin } from '@/lib/plataforma/primeiro-admin'

/**
 * O acesso ao sistema — o núcleo faz o trabalho (`lib/plataforma/acesso.ts`).
 * Só aqui, no sistema, mora o PRIMEIRO ADMIN (`PLATAFORMA_ADMIN_EMAIL`):
 * promovido no login, ou criado no "esqueci minha senha".
 */
export async function entrar(_estado: EstadoDoLogin, formData: FormData): Promise<EstadoDoLogin> {
  return entrarNaPlataforma('sistema', formData, async (usuario, supabase) => {
    try {
      if (await promoverSeForOAdmin(usuario) === 'promovido') await supabase.auth.refreshSession()
    } catch (e) {
      console.error('[sistema] primeiro admin:', (e as Error).message)
    }
  })
}

export async function sair(): Promise<void> {
  await sairDaPlataforma()
}

export async function pedirNovaSenha(_estado: EstadoDoPedido, formData: FormData): Promise<EstadoDoPedido> {
  return pedirNovaSenhaNaPlataforma(formData, urlDoHost('sistema'), async email => { await criarContaDoPrimeiroAdmin(email) })
}

export async function trocarSenha(_estado: EstadoDoLogin, formData: FormData): Promise<EstadoDoLogin> {
  return trocarSenhaNaPlataforma(formData)
}
