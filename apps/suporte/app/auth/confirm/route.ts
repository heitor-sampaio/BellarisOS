import { type NextRequest } from 'next/server'
import { confirmarLinkDeEmail } from '@estetica-os/nucleo/lib/plataforma/acesso'

/** A volta do link de e-mail (recuperar a senha): abre a sessão NESTE host. */
export async function GET(req: NextRequest) {
  return confirmarLinkDeEmail(req)
}
