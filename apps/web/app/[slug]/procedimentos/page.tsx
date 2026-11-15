import { redirect } from 'next/navigation'

/** A29 da 16ª: `/[slug]/procedimentos` leva a `/[slug]/procedures`; a página de destino confere a permissão. */
export default async function ProcedimentosRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/procedures`)
}
