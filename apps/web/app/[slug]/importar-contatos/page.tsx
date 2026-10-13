import { redirect } from 'next/navigation'

/** O importador mora em Configurações → Importações (2026-10-13). */
export default async function ImportarContatosDaUnidadePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/${slug}/settings?tab=importacoes`)
}
