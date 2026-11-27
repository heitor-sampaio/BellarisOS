import { anamneseRespondida, type AnamneseGeral } from '@/lib/anamnese-geral'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { obrigatoriasNovasQueFaltam } from '@/lib/atendimento/obrigatorias'

/**
 * Em que modo o link da ficha de saúde abre, depois da identidade (FI-13). Puro.
 *
 * - COMPLETO: sem resposta gravada, ou fora da validade (o pendente pede a ficha inteira).
 * - CONFERIR: a ficha que a EQUIPE preencheu — "Está tudo certo" ou "Corrigir
 *   respostas", e ela passa a ser da cliente (A52 da 7ª). Vale para o link
 *   mandado ANTES de a equipe preencher (`conferir`, do banco) e — D16 da 33ª —
 *   para o link NOVO, mandado depois: a Marivalda preencheu a ficha da A07 na
 *   unidade, a Rosilene mandou outro link, e ele abria em "Algo mudou na sua
 *   saúde? Nada mudou", como se a cliente tivesse respondido. A do formato
 *   antigo (LEGADO) também é da equipe (`quemRespondeu`: "pela equipe").
 * - CONFIRMAR: dentro da validade, a que a própria cliente respondeu — "algo mudou?".
 */
export function modoDaFichaPeloLink({ conferir, modoDoPendente, atual }: {
  conferir: boolean
  modoDoPendente: 'COMPLETO' | 'CONFIRMAR'
  atual: AnamneseGeral | null
}): 'COMPLETO' | 'CONFIRMAR' | 'CONFERIR' {
  // Sem resposta anterior (ou com a ficha gravada vazia), não há o que conferir nem confirmar.
  if (!anamneseRespondida(atual)) return 'COMPLETO'
  if (conferir) return 'CONFERIR'
  if (modoDoPendente !== 'CONFIRMAR') return 'COMPLETO'
  return atual.origem === 'EQUIPE' || atual.origem === 'LEGADO' ? 'CONFERIR' : 'CONFIRMAR'
}

/**
 * D7 da 35ª (PT-12, FI-07): o pendente "algo mudou?" (CONFIRMAR, aberto dentro
 * da validade) de quem respondeu numa versão SEM a obrigatória que a rede
 * acrescentou depois pede a ficha inteira (COMPLETO), já preenchida com as de
 * antes — "Nada mudou" não responde a pergunta nova. `rows`: as perguntas que o
 * pendente pede (a ficha atual); a conta é a do Finalizar (`obrigatoriasNovasQueFaltam`).
 */
export function modoDoPendentePelaFichaAtual(
  modo: 'COMPLETO' | 'CONFIRMAR', rows: AnamnesisRow[], atual: AnamneseGeral | null,
): 'COMPLETO' | 'CONFIRMAR' {
  return modo === 'CONFIRMAR' && obrigatoriasNovasQueFaltam(rows, atual).length > 0 ? 'COMPLETO' : modo
}
