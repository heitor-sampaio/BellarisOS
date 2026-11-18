import { documentosPuxadosDoPacote, type DocumentoPuxado, type ModeloAtivo, type ProcedimentoComDocumentos } from '@/lib/pacotes/documentos'

export type { DocumentoPuxado, ModeloAtivo, ProcedimentoComDocumentos }

/**
 * Os documentos que o PLANO puxa dos procedimentos (DC1c/PC9b no plano — o
 * Heitor, 13/11: "vai puxar os termos dos procedimentos e vai puxar também os
 * outros documentos que tiver. Ele só não puxa o contrato. [...] deve dar para
 * poder excluir o qual quiser").
 *
 * A mesma regra do pacote (`documentosPuxadosDoPacote`), sobre os
 * procedimentos de TODAS as sessões do plano — o termo e os outros de cada
 * procedimento distinto, uma vez cada; o contrato do procedimento não (vale o
 * contrato de plano da rede, que nasce no PDV com o pagamento). O plano guarda
 * o que a rede EXCLUIU (`treatment_plans.documentos_excluidos`), e o banco
 * aplica a mesma conta ao salvar o plano (`private.modelos_do_plano`; DC4: os
 * documentos nascem na criação).
 */
export function documentosPuxadosDoPlano(
  procedimentosPorSessao: readonly (readonly string[])[],
  procedimentos: readonly ProcedimentoComDocumentos[],
  modelosAtivos: readonly ModeloAtivo[],
  excluidos: readonly string[],
): DocumentoPuxado[] {
  return documentosPuxadosDoPacote(procedimentosPorSessao.flat(), procedimentos, modelosAtivos, excluidos)
}
