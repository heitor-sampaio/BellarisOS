import type { AppModule } from '@estetica-os/types'
import { modulosForaDoPlano, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * Os módulos que a matriz de Cargos não oferece, por estarem fora do plano da
 * rede — cada um UMA vez (D12 da 33ª simulação; princípio 3: a tela dizia
 * "Fora do plano da rede: Copilot, Copilot."). `modulosForaDoPlano` já traz o
 * Copilot quando o plano não o tem; o Copilot entra de novo só quando é o
 * "sem plano" (`recursos` nulo), que libera tudo MENOS ele
 * (lib/copilot/disponivel, 2026-10-21). Puro.
 */
export function modulosForaDoPlanoNosCargos(recursos: RecursosDoPlano | null, copilotNoPlano: boolean): AppModule[] {
  const fora = modulosForaDoPlano(recursos)
  return copilotNoPlano || fora.includes('copilot') ? fora : [...fora, 'copilot']
}
