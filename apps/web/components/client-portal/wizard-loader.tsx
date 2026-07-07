'use client'

import dynamic from 'next/dynamic'

interface Procedure {
  id:           string
  name:         string
  price:        number
  duration_min: number
}

interface Professional {
  id:   string
  name: string
}

interface Props {
  slug:          string
  branchId:      string
  procedures:    Procedure[]
  professionals: Professional[]
}

// dynamic + ssr:false bypasses hydration entirely, ensuring React mounts
// the wizard fresh on the client. This prevents the silent module-load
// failure seen in Capacitor WebView during SPA navigation.
const Wizard = dynamic(
  () => import('./new-appointment-wizard').then(m => ({ default: m.NewAppointmentWizard })),
  {
    ssr:     false,
    loading: () => (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
        Carregando…
      </div>
    ),
  },
)

export function WizardLoader(props: Props) {
  return <Wizard {...props} />
}
