import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * Quem abre a Equipe (as duas páginas e o menu): quem tem a Equipe em Ver — e
 * quem muda a comissão de cada pessoa, que mora no chip da linha da Equipe: o
 * Financeiro em Gerenciar, com as comissões no plano (CM-04 do catálogo de
 * Comissões; o Heitor, 2026-11-13, sobre a comissão na Equipe: "esquece, deixa
 * como está"; D5 da 40ª simulação). Sem a Equipe, a tela não dá o lápis, o
 * cadastro nem o desativar (pedem a Equipe em Gerenciar): só o chip.
 */
export function abreAEquipe(p: ResolvedPermissions, comissoesNoPlano: boolean): boolean {
  return p.team !== 'NONE' || (p.financial === 'MANAGE' && comissoesNoPlano)
}
