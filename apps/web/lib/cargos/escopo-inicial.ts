import type { AppModule, PermissionLevel, PermissionScope } from '@/lib/permissions'

/**
 * O escopo com que um módulo aparece na matriz do cargo (Configurações →
 * Cargos). `null` = SEM ESCOLHA: a tela pede ao ligar o módulo.
 *
 * - Módulo já ligado carrega o que foi escolhido.
 * - Módulo desligado com "só os meus" guardado devolve o "só os meus" ao
 *   religar (revisão do Heitor, 2026-10-29, D6).
 * - O resto nasce SEM ESCOLHA (A2 da 12ª simulação, 2026-11-11; princípio 3):
 *   o `ALL` gravado num módulo desligado é o default do banco, nunca uma
 *   escolha, e o OWN que a tela pré-marcava (desde a A5 da 9ª, o CRM em
 *   "Todos") fez a Contadora ser salva com "Só as próprias comissões" por
 *   engano. Como o gatilho da campanha (D8 da 11ª), quem liga o módulo diz o
 *   que o cargo enxerga.
 */
export function escopoInicial(
  _modulo: AppModule, p: { level: PermissionLevel; scope: PermissionScope } | undefined,
): PermissionScope | null {
  if (p && p.level !== 'NONE') return p.scope
  if (p?.scope === 'OWN') return 'OWN'
  return null
}
