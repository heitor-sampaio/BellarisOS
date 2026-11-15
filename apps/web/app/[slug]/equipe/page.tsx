import { redirect } from 'next/navigation'

/** A29 da 16ª: `/[slug]/equipe` leva a `/[slug]/team`; a página de destino confere a permissão. */
export default async function EquipeRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/team`)
}
