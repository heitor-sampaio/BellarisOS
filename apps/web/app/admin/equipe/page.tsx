import { redirect } from 'next/navigation'

/**
 * A29 da 16ª simulação: `/admin/equipe` dava 404 (a rota é `/admin/team`). O
 * endereço em português leva à tela; a página de destino confere a permissão.
 */
export default function EquipeRedirect() {
  redirect('/admin/team')
}
