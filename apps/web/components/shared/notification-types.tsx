import {
  Bell, CalendarDays, CalendarClock, CalendarPlus, CheckCircle2, AlertCircle,
  Star, Sparkles, CreditCard, DoorOpen, UserCog, LifeBuoy, BellRing, ShieldCheck, Package,
} from 'lucide-react'

// Config visual dos tipos de notificação (cliente + staff). Ícones Lucide, cores dos tokens.
export const NOTIFICATION_TYPE_CFG: Record<string, { Icon: React.ElementType; color: string }> = {
  // Cliente
  appointment_confirmed:   { Icon: CheckCircle2, color: 'var(--success)' },
  appointment_reminder:    { Icon: CalendarDays, color: 'var(--brand)' },
  appointment_cancelled:   { Icon: AlertCircle,  color: 'var(--danger)' },
  appointment_rescheduled: { Icon: CalendarClock, color: 'var(--brand)' },
  appointment_completed:   { Icon: CheckCircle2, color: 'var(--text-muted)' },
  payment_received:        { Icon: CreditCard,   color: 'var(--success)' },
  points_earned:           { Icon: Star,         color: 'var(--warning)' },
  package_activated:       { Icon: Sparkles,     color: 'var(--brand)' },
  promotion:               { Icon: Sparkles,     color: 'var(--warning)' },
  // Staff
  appointment_new:         { Icon: CalendarPlus, color: 'var(--brand)' },
  appointment_reassigned:  { Icon: UserCog,      color: 'var(--warning)' },
  client_checkin:          { Icon: DoorOpen,     color: 'var(--success)' },
  // Suporte do BellarisOS: resposta a um chamado, e o suporte entrando numa conta.
  'suporte.chamado':       { Icon: LifeBuoy,     color: 'var(--brand)' },
  'suporte.acesso':        { Icon: LifeBuoy,     color: 'var(--danger)' },
  'assinatura':            { Icon: CreditCard,   color: 'var(--warning)' },
  // CRM: o retorno combinado e o ganho a marcar (9ª simulação, A42/A45).
  'crm.lembrete':          { Icon: BellRing,     color: 'var(--brand)' },
  // LGPD: o pedido de dados feito pelo app (A49 da 9ª).
  'lgpd.pedido':           { Icon: ShieldCheck,  color: 'var(--info)' },
  // Estoque: o mínimo cruzado e o lote que vence em 30 dias (A39 da 10ª).
  stock_below_minimum:     { Icon: Package,      color: 'var(--danger)' },
  batch_expiring:          { Icon: CalendarClock, color: 'var(--warning)' },
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
