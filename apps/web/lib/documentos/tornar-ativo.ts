import { ROTULO_DO_TIPO, type TipoDeModelo } from './variaveis'

/**
 * A pergunta do "Tornar ativo" do contrato de plano ou de pacote (A32 da 15ª
 * simulação; a regra de 02/11: campo que muda algo pede aviso e confirmação).
 * Era um clique só, e o contrato que a rede usava ficava inativo calado.
 */
export function confirmacaoDeTornarAtivo({ tipo, novo, atual }: { tipo: TipoDeModelo; novo: string; atual: string | null }): string {
  const inicio = `O ${ROTULO_DO_TIPO[tipo].toLowerCase()} “${novo}” passa a valer`
  return atual ? `${inicio}; “${atual}” fica inativo.` : `${inicio}.`
}
