'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const ReportsBiView = dynamic(
  () => import('./reports-bi-view').then(m => m.ReportsBiView),
  { ssr: false },
)

export function ReportsBiDynamic(props: ComponentProps<typeof ReportsBiView>) {
  return <ReportsBiView {...props} />
}
