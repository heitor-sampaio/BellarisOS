import { redirect } from 'next/navigation'

/**
 * Os construtores de ficha viraram duas abas de `/[slug]/settings`, junto com
 * cargos e integrações — como no portal da rede. Caminho antigo vira redirect.
 */
export default async function BranchFormsRedirect({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug }        = await params
  const { tab: rawTab } = await searchParams
  const tab = rawTab === 'atendimento' ? 'atendimento' : 'anamnese'

  redirect(`/${slug}/settings?tab=${tab}`)
}
