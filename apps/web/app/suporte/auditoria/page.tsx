import { redirect } from 'next/navigation'

/** A auditoria mudou para a administração do sistema. */
export default function AuditoriaAntiga() {
  redirect('/sistema/auditoria')
}
