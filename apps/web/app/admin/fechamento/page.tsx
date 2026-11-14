import { redirect } from 'next/navigation'

/** O Fechamento do dia mora no PDV (CX4, 2026-11-14): o caminho antigo leva para lá, com o dia e a unidade. */
export default async function FechamentoDaRedePage({ searchParams }: { searchParams: Promise<{ dia?: string; unidade?: string }> }) {
  const { dia, unidade } = await searchParams
  redirect(`/admin/pdv?${new URLSearchParams({ fechar: '1', ...(dia ? { dia } : {}), ...(unidade ? { unidade } : {}) })}`)
}
