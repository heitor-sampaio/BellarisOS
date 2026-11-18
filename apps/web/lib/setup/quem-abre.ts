import { comAviso } from '@/lib/aviso-da-url'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

type QuemAbre = { isNetworkAdmin: boolean; branchId: string | null }

/**
 * Para onde vai quem abre o /setup sem poder usá-lo; nulo = abre o assistente.
 *
 * O setup é configuração da rede toda — só da Admin da rede (o Heitor, 18/11:
 * "Configuração da rede toda só pela conta admin"), que `actions/setup.ts` já
 * cobra. Quem é de unidade vai ao painel dela (C61, F70); quem tem "A rede
 * inteira" sem ser a Admin, ao painel da rede. Os dois com o aviso.
 */
export function saidaDoSetup(ctx: QuemAbre, slugDaUnidade: string | null): string | null {
  if (mexeNaConfigDaRede(ctx)) return null
  if (ctx.branchId === null) return comAviso('/admin/dashboard', 'setup-da-rede')
  return slugDaUnidade ? comAviso(`/${slugDaUnidade}/dashboard`, 'setup-da-rede') : '/'
}
