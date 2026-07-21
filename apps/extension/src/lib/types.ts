export interface Branch {
  id: string
  name: string
  slug: string
}

export interface Procedure {
  id: string
  name: string
  duration_min: number
  price: number
  category?: string | null
}

export interface Professional {
  id: string
  name: string
}

export interface Room {
  id: string
  name: string
}

export type ExtMode = 'branch' | 'network'

export interface BranchesResponse {
  mode: ExtMode
  branches: Branch[]
}

export interface BootstrapData {
  mode: ExtMode
  branch: Branch | null
  procedures: Procedure[]
  professionals: Professional[]
  rooms: Room[]
}

export interface DayAppointment {
  id: string
  scheduledAt: string
  durationMin: number
  status: string
  professionalId: string | null
  roomId: string | null
  isEvaluation: boolean
  clientName: string | null
  procedureName: string | null
}

export interface ClientHit {
  id: string
  name: string
  phone: string | null
}

export interface NewAppointmentBody {
  branchId?: string
  clientId: string
  procedureId: string | null
  professionalId: string
  scheduledAt: string
  roomId?: string | null
  notes?: string | null
  isEvaluation?: boolean
}
