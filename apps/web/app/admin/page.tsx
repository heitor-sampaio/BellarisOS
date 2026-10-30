import { redirect } from 'next/navigation'

/**
 * `/admin` sozinho (J-67): era 404 para todo mundo — não havia página na raiz
 * do portal da rede. Vai ao painel; quem não é da rede, o layout leva ao
 * destino dele (a cliente ao portal, a equipe de unidade à unidade). Só
 * redireciona: não lê dado nenhum.
 */
export default function RaizDoPortalDaRede() {
  redirect('/admin/dashboard')
}
