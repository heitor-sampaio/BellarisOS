import { redirect } from 'next/navigation'

/** `/[slug]/stock` virou `/[slug]/estoque` — mesmo nome que a rede já usava. */
export default async function StockRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/estoque`)
}
