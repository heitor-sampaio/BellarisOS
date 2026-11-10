import { redirect } from 'next/navigation'

/**
 * A47 da 11ª simulação: `/[slug]/relatorios` dava 404 (a rota é
 * `/[slug]/reports`). O endereço em português leva à tela, com o que veio na
 * URL. A página de destino confere a permissão.
 */
export default async function RelatoriosRedirect({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) q.append(k, x)
  redirect(`/${slug}/reports${q.size ? `?${q}` : ''}`)
}
