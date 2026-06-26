export interface ClientWithLoyalty {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string
  birthDate: Date | null
  avatarUrl: string | null
  tags: string[]
  notes: string | null
  isActive: boolean
  appAccountCreatedAt: Date | null
  loyaltyAccount: {
    id: string
    balance: number
  } | null
}

export interface ClientSummary {
  id: string
  name: string
  phone: string
  document: string | null
  avatarUrl: string | null
  tags: string[]
  isActive: boolean
}
