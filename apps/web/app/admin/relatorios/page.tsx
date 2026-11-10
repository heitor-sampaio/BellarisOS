import { redirect } from 'next/navigation'

/**
 * A47 da 11ª simulação: `/admin/relatorios` dava 404 (a rota é `/admin/reports`,
 * e o resto do sistema está em português). O endereço em português leva à tela,
 * com o que veio na URL. A página de destino confere a permissão.
 */
export default async function RelatoriosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) q.append(k, x)
  redirect(`/admin/reports${q.size ? `?${q}` : ''}`)
}
