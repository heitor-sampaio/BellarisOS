import { redirect } from 'next/navigation'

/** `/[slug]/financial` virou `/[slug]/financeiro`. Preserva o período do link. */
export default async function FinancialRedirect({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { slug } = await params
  const sp       = new URLSearchParams(await searchParams)
  const query    = sp.toString()
  redirect(`/${slug}/financeiro${query ? `?${query}` : ''}`)
}
