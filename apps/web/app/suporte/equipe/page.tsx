import { redirect } from 'next/navigation'

/** A equipe da plataforma mudou para a administração do sistema. */
export default function EquipeAntiga() {
  redirect('/sistema/equipe')
}
