export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'

export type AppointmentSource = 'INTERNAL' | 'ONLINE' | 'CLIENT_APP'

export interface AppointmentWithClient {
  id: string
  scheduledAt: Date
  durationMin: number
  price: number
  status: AppointmentStatus
  source: AppointmentSource
  clientNotes: string | null
  notes: string | null
  client: {
    id: string
    name: string
    phone: string
    avatarUrl: string | null
  }
  procedure: {
    id: string
    name: string
    category: string
    durationMin: number
    price: number
  }
  professional: {
    id: string
    name: string
    avatarUrl: string | null
  }
  room: { id: string; name: string } | null
}

export interface AppointmentWithDetails extends AppointmentWithClient {
  medicalRecordEntry: { id: string } | null
  packageSession: { id: string; clientPackageId: string } | null
  transaction: { id: string; amount: number; isPaid: boolean } | null
}
