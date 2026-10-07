import { getCachedRede } from '../redes/cache'
import { temFuncionalidade, type ChaveDeFuncionalidade } from './recursos'

/**
 * A rede tem esta funcionalidade no PLANO? — para o que roda SEM tela e sem
 * `ctx`: crons, automações, push ao paciente, a API de Conversões. Lê o retrato
 * pelo mesmo cache do `buildContext` (`rede:<id>`). Sem plano (ou rede não
 * achada), tudo liberado — o mesmo critério do resto (lib/planos/recursos.ts).
 */
export async function redeTemRecurso(tenantId: string, chave: ChaveDeFuncionalidade): Promise<boolean> {
  const rede = await getCachedRede(tenantId)
  return temFuncionalidade(rede?.recursos ?? null, chave)
}
