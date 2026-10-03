import { redirect } from 'next/navigation'
import { getPlatformContext } from '@/lib/plataforma/contexto'

/** A entrada do portal. */
export default async function SuportePage() {
  await getPlatformContext()
  redirect('/suporte/chamados')
}
