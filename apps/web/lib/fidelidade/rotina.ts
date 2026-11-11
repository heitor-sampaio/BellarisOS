import { dayKeyTZ, BUSINESS_TZ } from '@/lib/datetime'
import { formatarPontos } from './formato'

/**
 * A rotina da fidelidade no relógio da CLÍNICA (F62b, a regra da F62: "deixa
 * a clinica configurar o seu fuso"). Puro: o cron (`/api/cron/fidelidade`)
 * decide por aqui.
 */

/**
 * O "hoje" do bônus de aniversário de cada rede: o programa é da rede, e o dia
 * é o do fuso comum das unidades (`fusoDaRede` — como a campanha de
 * aniversário). Às 23:30 de 11/11 em Manaus (00:30 de 12/11 em Brasília) ainda
 * é o aniversário de 11/11 lá.
 */
export function diasDoBonusDeAniversario(
  redes: readonly { tenantId: string; fuso: string }[],
  agora: Date,
): { p_tenant: string; p_hoje: string }[] {
  return redes.map(r => ({ p_tenant: r.tenantId, p_hoje: dayKeyTZ(agora, r.fuso) }))
}

/** O aviso por push: "120 pontos vencem até 30/11/2026." — o dia no fuso da unidade da cliente. */
export function textoDoAvisoDeVencimento(pontos: number, ate: string, fuso: string = BUSINESS_TZ): string {
  const dia = new Date(ate).toLocaleDateString('pt-BR', { timeZone: fuso })
  return `${formatarPontos(pontos)} vencem até ${dia}. Use na próxima visita.`
}
