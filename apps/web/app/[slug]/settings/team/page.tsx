import { redirect } from 'next/navigation'

/** `/[slug]/settings/team` virou `/[slug]/team`, como na rede. */
export default async function TeamRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/team`)
}
