import { redirect } from 'next/navigation'

export default function BranchesPage() {
  redirect('/admin/settings?tab=unidades')
}
