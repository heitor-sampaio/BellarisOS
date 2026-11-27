import type { ProfilePackage } from '@/components/branch/client-profile'
import { formatBRL } from '@estetica-os/utils'
import { camposDoPacoteDeFora } from '@/lib/pacotes/de-fora'
import { creditoValeHoje } from '@/lib/creditos/validade'

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
  package_sessions?: { status: string; appointment_id: string | null; preco?: number | string | null }[]
  de_fora?: boolean
  usadas_antes?: number
  valor_referencia?: number | null
  /** A unidade do pacote: a validade é um dia no fuso dela. */
  branches?: { fuso?: string | null } | null
}

export function pacotesEmAndamento<T extends PacoteLido>(pkgs: T[], agora: Date): T[] {
  return pkgs.filter(p =>
    !p.cancelado_em &&
    p.used_sessions < p.total_sessions &&
    // A validade é um DIA, no fuso da unidade do pacote (PP-05, como o agendar).
    creditoValeHoje(p.expires_at, p.branches?.fuso ?? undefined, agora))
}

/**
 * A1 da 37ª (PA-07, PA-11): a parte de cada sessão no rateio, agrupada pelo
 * valor, na ordem em que aparece — "R$ 124,90 × 3 · R$ 195,15 × 2". A sessão
 * sem preço gravado (o pacote de antes do rateio) vale `valor ÷ sessões`; sem
 * valor nenhum (o pacote de antes sem valor de referência), não há partes.
 */
export function partesDoPacote(
  sessoes: { preco?: number | string | null }[], total: number, valor: number | null,
): string | null {
  const reserva = valor == null ? null : Math.round(valor * 100 / Math.max(1, total)) / 100
  const grupos = new Map<number, number>()
  for (const s of sessoes) {
    const preco = s.preco != null ? Number(s.preco) : reserva
    if (preco == null) continue
    const centavos = Math.round(preco * 100)
    grupos.set(centavos, (grupos.get(centavos) ?? 0) + 1)
  }
  if (!grupos.size) return null
  return [...grupos].map(([centavos, n]) => `${formatBRL(centavos / 100)} × ${n}`).join(' · ')
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
    // A1 da 37ª: a validade e a parte de cada sessão, como o pré-pago mostra.
    venceEm:       pkg.expires_at,
    partes:        partesDoPacote(pkg.package_sessions ?? [], pkg.total_sessions,
      pkg.de_fora ? (pkg.valor_referencia == null ? null : Number(pkg.valor_referencia)) : Number(sp?.price ?? 0)),
    // O pacote trazido de fora (F35): "Pacote de antes" e as usadas antes do sistema (A57).
    ...camposDoPacoteDeFora(pkg),
  }
}

/**
 * O que o cartão do pacote VENCIDO explica (A24 da 29ª simulação, o princípio
 * 7 — só texto): o que é e o que se pode fazer. O "Cancelar pacote" é a conta
 * de sempre (vendas-financeiro:PA-16), oferecida porque a rede escolheu
 * "Pode ser cancelado, com a devolução" (PA-21).
 */
export const SOBRE_O_PACOTE_VENCIDO =
  'O pacote passou da validade: ele e as sessões que sobraram ficam aqui, fora do Tratamento em andamento. ' +
  'A rede deixa cancelar o pacote vencido (Configurações → Geral → Pacote vencido): o “Cancelar pacote” mostra a conta antes de confirmar — ' +
  'o usado, o pago e o que volta à cliente, se houver; sem nada a devolver, ele só encerra o pacote. Deixar como está também vale: o pacote segue na ficha, vencido.'
