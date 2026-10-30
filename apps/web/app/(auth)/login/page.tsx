import { redirect } from 'next/navigation'
import { destinoPelosClaims } from '@/lib/destino-da-sessao'
import { FormularioDeLogin } from './formulario-de-login'

/**
 * O login. Com a sessão ABERTA (J-67), quem abre `/login` vai ao destino dele
 * — a cliente ao portal, a equipe ao painel — em vez de ver o formulário de
 * novo, como se ninguém tivesse entrado.
 *
 * Com `?acesso=` não: é a volta DELIBERADA de um portão (desativado,
 * plataforma) com a sessão ainda nos cookies; redirecionar daria volta.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ acesso?: string }> }) {
  const { acesso } = await searchParams
  if (!acesso) {
    const destino = await destinoPelosClaims()
    if (destino) redirect(destino)
  }
  return <FormularioDeLogin />
}
