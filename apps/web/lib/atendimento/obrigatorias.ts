import { primeiraObrigatoriaVazia, obrigatoriasVazias, type AnamnesisRow, type AnamnesisFieldType } from '@/lib/anamnesis'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO, anamneseRespondida, type AnamneseGeral } from '@/lib/anamnese-geral'

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
  return f ? { onde: 'anamnese', campo: f.id, rotulo: f.label, mensagem: `Falta responder "${f.label}" na ficha de saúde.` } : null
}

/** Os rótulos de TODAS as obrigatórias vazias da anamnese (A30: a tela diz a lista inteira de uma vez). */
export function rotulosQueFaltamNaAnamnese(rows: AnamnesisRow[], respostas: Record<string, unknown>): string[] {
  return obrigatoriasVazias(rows, respostas, TIPOS_FORA_DO_PRE_ATENDIMENTO).map(f => f.label)
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
  return f ? { onde: 'ficha', campo: f.id, rotulo: f.label, mensagem: `Falta preencher "${f.label}" na ficha de atendimento.` } : null
}

/**
 * Os rótulos de TODAS as obrigatórias vazias da ficha do procedimento (a conta
 * de `faltaNaFichaDoProcedimento`, sem parar na primeira): a tela de quem não
 * vê o clínico os recebe do servidor antes do "Confirmar conclusão" (AT-03).
 */
export function rotulosQueFaltamNaFicha(
  rows: AnamnesisRow[], respostas: Record<string, unknown>, o: { semInjetaveis?: boolean } = {},
): string[] {
  const ignorar: AnamnesisFieldType[] = o.semInjetaveis ? ['injectable_map'] : []
  return obrigatoriasVazias(rows, respostas, ignorar).map(f => f.label)
}

/**
 * D7 e A17 da 35ª (FI-07: "contam as perguntas da ficha ATUAL"; PT-12: a
 * ficha volta a pedir resposta "de outra versão"): a ficha RESPONDIDA numa
 * versão sem a obrigatória que a rede acrescentou depois está pendente. Os
 * rótulos das obrigatórias da ficha atual que as respostas gravadas não cobrem
 * — a conta do Finalizar (`faltaNaAnamnese`), para o app oferecer a ficha e a
 * aba Prontuário mostrar a pergunta. A nunca respondida (ou vazia) devolve
 * vazio: essa é a "não respondida" (`avisoDaFichaNaoRespondida`).
 */
export function obrigatoriasNovasQueFaltam(rows: AnamnesisRow[], anamnese: AnamneseGeral | null | undefined): string[] {
  if (!anamneseRespondida(anamnese)) return []
  return rotulosQueFaltamNaAnamnese(rows, anamnese.respostas)
}

/**
 * A15 da 35ª (AT-05, a Decisão E1): na janela do "Finalizar", quem LÊ o
 * prontuário e não o escreve vê quem preenche a ficha de atendimento — pela
 * permissão e com os nomes (`quemRespondeAFichaDeSaude`: o Prontuário em
 * Gerenciar), como a ficha de saúde já dizia (`textoDeQuemRespondeAFicha`).
 */
export function textoDeQuemPreencheAFicha(quem: string[] | null | undefined): string {
  const lista = quem ?? []
  const nomes = lista.length <= 1 ? (lista[0] ?? '') : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`
  return `Quem preenche a ficha de atendimento é quem tem o Prontuário em Gerenciar${nomes ? ` (${nomes})` : ''}.`
}

/** O selo da pendência no cartão da ficha de saúde (A17 da 35ª). */
export function textoDaPendenciaDaFicha(rotulos: string[]): string {
  return `Falta responder: ${rotulos.map(r => `"${r}"`).join(', ')}`
}

/**
 * A faixa da ficha de saúde NUNCA respondida no atendimento (15ª A7;
 * princípios 3 e 7): o "Finalizar" barra pelas obrigatórias dela, e a tela só
 * avisava da ficha vencida. Diz quantas obrigatórias faltam, para responder
 * ali ou mandar o link antes. Nula com a ficha respondida ou sem pergunta.
 *
 * A5 da 26ª (princípio 3): a contagem lia a ficha GRAVADA — digitando aqui,
 * seguia "4 obrigatórias". Com `naTela` (as respostas digitadas), conta o
 * que ainda falta nela, e some quando nada obrigatório falta (o Finalizar
 * leva as respostas e não barra).
 */
export function avisoDaFichaNaoRespondida(
  nome: string, anamnese: AnamneseGeral | null | undefined, rows: AnamnesisRow[],
  naTela?: Record<string, unknown> | null,
): string | null {
  const respostas = anamnese?.respostas ?? {}
  if (anamneseRespondida(anamnese)) return null
  if (!rows.some(r => (r.fields ?? []).some(f => f.type !== 'section' && !TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type)))) return null
  const digitou = !!naTela && Object.keys(naTela).length > 0
  const n = rotulosQueFaltamNaAnamnese(rows, digitou && naTela ? naTela : respostas).length
  if (digitou && n === 0) return null
  const quem = nome || 'quem está sendo atendido'
  return `A ficha de saúde de ${quem} ainda não foi respondida${n ? ` (${n} obrigatória${n > 1 ? 's' : ''})` : ''}.`
}

/**
 * O aviso do bloco do plano (A36 da 24ª, princípio 3): o "Gerar plano" barra
 * pelas obrigatórias da ficha de saúde — o bloco diz quais antes do clique,
 * como faz com as queixas.
 */
export function avisoDaFichaParaOPlano(rows: AnamnesisRow[], respostas: Record<string, unknown>): string | null {
  const faltam = rotulosQueFaltamNaAnamnese(rows, respostas)
  return faltam.length ? `Para gerar o plano, falta responder na ficha de saúde: ${faltam.map(r => `"${r}"`).join(', ')}.` : null
}
