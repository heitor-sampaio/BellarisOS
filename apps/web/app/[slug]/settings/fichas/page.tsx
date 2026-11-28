import { redirect } from 'next/navigation'

/**
 * Os construtores de ficha viraram duas abas de `/[slug]/settings`, junto com
 * cargos e integrações — como no portal da rede. Caminho antigo vira redirect.
 * As duas viraram uma, a aba Fichas (D17 da 41ª: o redirect ia a `?tab=` de
 * antes, que não existe mais, e a tela mostrava o id interno).
 */
export default async function BranchFormsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/settings?tab=fichas`)
}
