import { redirect } from 'next/navigation'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'

/** A entrada do portal. */
export default async function SuportePage() {
  await getPlatformContext()
  redirect('/chamados')
}
