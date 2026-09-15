import { redirect } from 'next/navigation'

/** `/[slug]/crm` virou Inbox e Oportunidades. Ver o gêmeo em app/admin/crm. */
export default async function BranchCRMRedirect({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ funil?: string; c?: string }>
}) {
  const { slug } = await params
  const { funil, c } = await searchParams

  if (c) redirect(`/${slug}/inbox?c=${encodeURIComponent(c)}`)
  redirect(funil ? `/${slug}/oportunidades?funil=${encodeURIComponent(funil)}` : `/${slug}/oportunidades`)
}
