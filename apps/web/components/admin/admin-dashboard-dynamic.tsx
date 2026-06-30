'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const AdminDashboardView = dynamic(
  () => import('./admin-dashboard-view').then(m => m.AdminDashboardView),
  { ssr: false },
)

export function AdminDashboardDynamic(props: ComponentProps<typeof AdminDashboardView>) {
  return <AdminDashboardView {...props} />
}
