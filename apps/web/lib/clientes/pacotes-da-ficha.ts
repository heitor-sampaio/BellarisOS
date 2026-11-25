import type { ProfilePackage } from '@/components/branch/client-profile'
import { camposDoPacoteDeFora } from '@/lib/pacotes/de-fora'

/**
 * Os pacotes em andamento da ficha — o mesmo nos dois portais.
 *
 * D17 da 28ª: com dois pacotes iguais ("5 drenagens", os dois pagos), a ficha
 * mostrava só o primeiro (`find`); o segundo, 0/5, sumia (princípio 3). Agora
 * cada pacote em andamento é um cartão.
 *
 * Em andamento: não cancelado (F2b: o cancelado fica só no histórico), com
 * sessão restante e dentro da validade. A ordem é a da leitura.
 */
export interface PacoteLido {
  id: string
  total_sessions: number
  used_sessions: number
  expires_at: string | null
  cancelado_em?: string | null
  service_packages?: unknown
  package_sessions?: { status: string; appointment_id: string | null }[]
  de_fora?: boolean
  usadas_antes?: number
  valor_referencia?: number | null
}

export function pacotesEmAndamento<T extends PacoteLido>(pkgs: T[], agora: Date): T[] {
  return pkgs.filter(p =>
    !p.cancelado_em &&
    p.used_sessions < p.total_sessions &&
    (!p.expires_at || new Date(p.expires_at) > agora))
}

/** O cartão de um pacote em andamento. */
export function pacoteDaFicha(pkg: PacoteLido): ProfilePackage {
  const sp = pkg.service_packages as { name?: string; procedure_id?: string; price?: number; procedures?: { name?: string; duration_min?: number } | null } | null
  const proc = sp?.procedures ?? null
  return {
    id:            pkg.id,
    name:          sp?.name ?? 'Pacote',
    totalSessions: pkg.total_sessions,
    usedSessions:  pkg.used_sessions,
    // As restantes já agendadas (A27): o cartão diz "2 sessões restantes · 1 agendada".
    scheduledSessions: (pkg.package_sessions ?? []).filter(s => s.status === 'AVAILABLE' && !!s.appointment_id).length,
    procedureId:   sp?.procedure_id ?? '',
    procedureName: proc?.name ?? sp?.name ?? '—',
    price:         Number(sp?.price ?? 0) / (pkg.total_sessions || 1),
    durationMin:   proc?.duration_min ?? 60,
    // O pacote trazido de fora (F35): "Pacote de antes" e as usadas antes do sistema (A57).
    ...camposDoPacoteDeFora(pkg),
  }
}
