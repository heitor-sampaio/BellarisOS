import {
  Bell, CalendarDays, CalendarClock, CalendarPlus, CheckCircle2, AlertCircle,
  Star, Sparkles, CreditCard, DoorOpen, UserCog,
} from 'lucide-react'

// Config visual dos tipos de notificação (cliente + staff). Ícones Lucide, cores dos tokens.
export const NOTIFICATION_TYPE_CFG: Record<string, { Icon: React.ElementType; color: string }> = {
  // Cliente
  appointment_confirmed:   { Icon: CheckCircle2, color: '#22c55e' },
  appointment_reminder:    { Icon: CalendarDays, color: 'var(--brand)' },
  appointment_cancelled:   { Icon: AlertCircle,  color: '#ef4444' },
  appointment_rescheduled: { Icon: CalendarClock, color: 'var(--brand)' },
  appointment_completed:   { Icon: CheckCircle2, color: 'var(--text-muted)' },
  payment_received:        { Icon: CreditCard,   color: '#22c55e' },
  points_earned:           { Icon: Star,         color: '#f59e0b' },
  package_activated:       { Icon: Sparkles,     color: 'var(--brand)' },
  promotion:               { Icon: Sparkles,     color: '#f59e0b' },
  // Staff
  appointment_new:         { Icon: CalendarPlus, color: 'var(--brand)' },
  appointment_reassigned:  { Icon: UserCog,      color: '#f59e0b' },
  client_checkin:          { Icon: DoorOpen,     color: '#22c55e' },
  // Fallback
  general:                 { Icon: Bell,         color: 'var(--text-muted)' },
}

export function notificationRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'agora'
  if (mins < 60) return `${mins} min atrás`
  const h = Math.floor(mins / 60)
  if (h < 24)    return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d === 1)   return 'ontem'
  return `${d} dias atrás`
}
