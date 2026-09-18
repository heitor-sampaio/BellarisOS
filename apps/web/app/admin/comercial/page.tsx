import { redirect } from 'next/navigation'

/**
 * O painel comercial virou a aba "Comercial" de Relatórios.
 *
 * Funil, conversão e ranking são relatório, e o módulo que os governa sempre
 * foi `reports` — a tela tinha destino próprio sem ter assunto próprio. Caminho
 * antigo vira redirect, preservando o funil escolhido.
 *
 * O período não passa adiante: as opções daqui (7d, 30d, mês, tudo) não são as
 * mesmas do seletor de Relatórios, e mandar uma chave desconhecida cairia em
 * "mês" de qualquer jeito.
 */
export default async function ComercialRedirect({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string }>
}) {
  const { funil } = await searchParams
  const params = new URLSearchParams({ tab: 'comercial' })
  if (funil) params.set('funil', funil)

  redirect(`/admin/reports?${params.toString()}`)
}
