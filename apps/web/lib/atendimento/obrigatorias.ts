import { primeiraObrigatoriaVazia, type AnamnesisRow, type AnamnesisFieldType } from '@/lib/anamnesis'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO } from '@/lib/anamnese-geral'

/**
 * "Tudo que for obrigatório é obrigatório e barra qualquer progressão se não
 * for feito" (revisão do Heitor, 2026-10-29). A pergunta obrigatória sem
 * resposta — na ficha do procedimento ou na anamnese (a ficha de saúde) —
 * barra o "Finalizar atendimento", o "Enviar para a recepção" e o "Fechar
 * agora". Até aqui o "Finalizar" concluía assim mesmo ("a cliente já foi
 * atendida", §10 e D2 de 28/10).
 *
 * As contas são PURAS: a tela aponta o campo com elas, e o servidor
 * (`oQueFaltaParaSeguir`, `obrigatorias-no-servidor.ts`) recusa com elas —
 * a trava não é só do navegador. A mensagem é a mesma nos dois.
 */

export interface FaltaNoAtendimento {
  onde:     'anamnese' | 'ficha'
  campo:    string
  rotulo:   string
  mensagem: string
}

/** A anamnese: as respostas que valem (a da tela, senão a gravada) contra a ficha de pré-atendimento ATUAL da rede. */
export function faltaNaAnamnese(rows: AnamnesisRow[], respostas: Record<string, unknown>): FaltaNoAtendimento | null {
  const f = primeiraObrigatoriaVazia(rows, respostas, TIPOS_FORA_DO_PRE_ATENDIMENTO)
  return f ? { onde: 'anamnese', campo: f.id, rotulo: f.label, mensagem: `Falta responder "${f.label}" na anamnese.` } : null
}

/**
 * A ficha do procedimento: as respostas que valem contra a ficha ligada ao
 * procedimento AGORA. Sem o recurso de injetáveis, o planejador não se
 * preenche (o campo é só para ver) e não barra.
 */
export function faltaNaFichaDoProcedimento(
  rows: AnamnesisRow[], respostas: Record<string, unknown>, o: { semInjetaveis?: boolean } = {},
): FaltaNoAtendimento | null {
  const ignorar: AnamnesisFieldType[] = o.semInjetaveis ? ['injectable_map'] : []
  const f = primeiraObrigatoriaVazia(rows, respostas, ignorar)
  return f ? { onde: 'ficha', campo: f.id, rotulo: f.label, mensagem: `Falta preencher "${f.label}" na ficha do procedimento.` } : null
}
