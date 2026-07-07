import { redirect } from 'next/navigation'

export default async function ClientPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/${slug}/cliente/home`)
}
