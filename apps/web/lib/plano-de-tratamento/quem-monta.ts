import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade, can } from '@/lib/auth'

/**
 * Quem MONTA o plano de tratamento — na avaliação aberta, na concluída, pelo
 * "Novo plano", e quem edita, propõe, vincula, renomeia, gera os termos e
 * cancela o proposto (UM3, o Heitor, 2026-11-23: "cada passo do atendimento,
 * um módulo"; revê a PT2): o Atendimento em Gerenciar, com a unidade do plano
 * ao alcance da pessoa (`alcancaUnidade`). A Admin da rede monta em qualquer
 * uma (`isNetworkAdmin`, o cargo de sistema no banco — §11). O "Atende" da
 * Equipe não é trava: não dá permissão nenhuma (UM5). O Prontuário em
 * Gerenciar continua decidindo só a ANOTAÇÃO clínica dentro do plano (as
 * "Observações da profissional").
 *
 * Sem `unidadeId` (o "Novo plano" do portal da rede, antes de escolher a
 * unidade): o Atendimento em Gerenciar basta para oferecer o botão; a gravação
 * confere a unidade escolhida.
 *
 * Fora de `'use server'`: é uma regra, não um endpoint.
 */
export function montaPlano(
  ctx: Pick<TenantContext, 'isNetworkAdmin' | 'permissions' | 'branchId' | 'unidades'>,
  unidadeId?: string | null,
): boolean {
  if (ctx.isNetworkAdmin) return true
  if (!can(ctx as TenantContext, 'atendimento', 'MANAGE')) return false
  return unidadeId ? alcancaUnidade(ctx, unidadeId) : true
}

/**
 * Quem busca a cliente para ligar ao plano (D5 da 35ª; PL-02: "vincula" é de
 * quem monta): o Clientes em Ver vê a ficha (nome, telefone, documento); quem
 * só monta o plano (o Atendimento em Gerenciar), só o nome — nada do cadastro,
 * que é do Clientes. Sem nenhum dos dois, ninguém.
 */
export function buscaClienteParaPlano(
  ctx: Pick<TenantContext, 'isNetworkAdmin' | 'permissions' | 'branchId' | 'unidades'>,
): 'FICHA' | 'SO_O_NOME' | null {
  if (ctx.isNetworkAdmin || can(ctx as TenantContext, 'clients', 'VIEW')) return 'FICHA'
  return montaPlano(ctx) ? 'SO_O_NOME' : null
}

// Os textos moram à parte: a lista de planejamentos (componente do navegador) os
// lê, e este arquivo puxa o lib/auth, que é do servidor.
export { TEXTO_QUEM_MONTA, RECUSA_QUEM_MONTA, RECUSA_QUEM_ATENDE } from './textos-de-quem-monta'
