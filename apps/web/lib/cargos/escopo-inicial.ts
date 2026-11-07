import type { AppModule, PermissionLevel, PermissionScope } from '@/lib/permissions'

/**
 * O escopo com que um módulo aparece na matriz do cargo (Configurações →
 * Cargos). Módulo já ligado carrega o que foi escolhido. Módulo em "Sem
 * acesso" nasce em OWN quando for habilitado: o valor gravado ali é `ALL` por
 * default do banco, nunca uma escolha de alguém — e a opção mais permissiva
 * não deve vencer por omissão nos dados sensíveis (agenda, prontuário,
 * financeiro).
 *
 * **O CRM nasce em "Todos"** (A5 da 9ª simulação, 2026-11-07; decidido pelo
 * princípio 1, padrão sensato): o cargo "Comercial" ligado em Gerenciar
 * nascia em "Só os próprios leads", e o funil da Tatiane ficava vazio dos
 * leads com outro responsável. O funil é o trabalho do time; "só os meus" é a
 * escolha da clínica para distribuir leads (a SDR) — e o "só os meus"
 * GUARDADO do CRM desligado volta ao religar (D6, 2026-10-29).
 */
export function escopoInicial(
  modulo: AppModule, p: { level: PermissionLevel; scope: PermissionScope } | undefined,
): PermissionScope {
  if (p && p.level !== 'NONE') return p.scope
  if (modulo === 'crm') return p?.scope === 'OWN' ? 'OWN' : 'ALL'
  return 'OWN'
}
