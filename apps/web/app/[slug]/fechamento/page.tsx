import { redirect } from 'next/navigation'

/** O Fechamento do dia mora no PDV (CX4, 2026-11-14): o caminho antigo leva para lá, com o dia. */
export default async function FechamentoDaUnidadePage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ dia?: string }>
}) {
  const [{ slug }, { dia }] = await Promise.all([params, searchParams])
  redirect(`/${slug}/pdv?${new URLSearchParams({ fechar: '1', ...(dia ? { dia } : {}) })}`)
}
