import type { TenantContext } from '@estetica-os/types'

/**
 * Quem MONTA o plano de tratamento (PT2, Bloco Plano de tratamento — a revisão
 * do Heitor de 2026-11-13): "quem monta o plano é quem atende, nem precisa de
 * permissão pra isso pq isso é proprio atendimento, faz parte" — e "não
 * necessariamente ela vai gerenciar em prontuário, então não dá para linkar
 * isso".
 *
 * Quem atende é o "Atende" da Equipe, por unidade (`users.atende_em`), que NÃO
 * é permissão (§11): marcada na unidade do plano, ela monta. A Admin da rede tem
 * tudo (`isNetworkAdmin`, o cargo de sistema no banco — §11). O Prontuário em
 * Gerenciar saiu da trava; ele continua decidindo só a ANOTAÇÃO clínica dentro
 * do plano (as "Observações da profissional").
 *
 * Sem `unidadeId` (o "Novo plano" do portal da rede, antes de escolher a
 * unidade): atender em alguma unidade basta para oferecer o botão; a gravação
 * confere a unidade escolhida.
 *
 * Fora de `'use server'`: é uma regra, não um endpoint.
 */
export function montaPlano(
  ctx: Pick<TenantContext, 'isNetworkAdmin'> & { atendeEm?: string[] },
  unidadeId?: string | null,
): boolean {
  if (ctx.isNetworkAdmin) return true
  const atende = ctx.atendeEm ?? []
  return unidadeId ? atende.includes(unidadeId) : atende.length > 0
}

/** A tela sem o "Novo plano" diz quem monta e onde se marca (A18, revisto no PT2). */
export const TEXTO_QUEM_MONTA = 'Quem monta o plano é quem atende nesta unidade, na avaliação ou aqui. Para marcar alguém, Equipe → "Atende" nesta unidade.'

/** A recusa da action a quem não atende na unidade do plano. */
export const RECUSA_QUEM_MONTA = 'Quem monta o plano é quem atende na unidade dele (Equipe → "Atende").'
