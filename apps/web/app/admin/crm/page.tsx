import { redirect } from 'next/navigation'

/**
 * `/admin/crm` virou duas telas: Inbox e Oportunidades.
 *
 * O redirect fica para não quebrar link salvo nem o atalho antigo do card, que
 * apontava para `?view=inbox&c=<id>`.
 */
export default async function AdminCRMRedirect({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; c?: string; funil?: string }>
}) {
  const { view, c, funil } = await searchParams

  if (view === 'inbox' || c) {
    redirect(c ? `/admin/inbox?c=${encodeURIComponent(c)}` : '/admin/inbox')
  }
  redirect(funil ? `/admin/oportunidades?funil=${encodeURIComponent(funil)}` : '/admin/oportunidades')
}
