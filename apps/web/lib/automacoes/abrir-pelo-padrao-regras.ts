import { NODES } from '@estetica-os/types'

/**
 * O que o "Abrir pelo número padrão" (AX-06, R10 — o Heitor, 26/11, na página
 * de perguntas: "Está no escopo: construir (com os modelos aprovados pela Meta
 * na automação)") pede da REDE para funcionar — conferido no servidor ao
 * ligar a automação e ao salvar a que está ligada (`problemasDaAberturaNaRede`,
 * `actions/automacoes.ts`). A validação pura do grafo (`validar.ts`) não sabe
 * qual é o número padrão nem quais modelos a Meta aprovou: isto sabe.
 *
 * Só o impossível recusa (princípio 2): sem número padrão não há por onde
 * abrir; na Cloud API, sem o modelo aprovado a Meta recusa a primeira
 * mensagem, e a variável sem valor sairia em branco.
 */

export interface ModeloAprovado {
  id:        string
  nome:      string
  /** As variáveis do modelo, na ordem (`extrairVariaveis`). */
  variaveis: string[]
}

export interface RedeParaAbrir {
  /** O número padrão ATIVO da rede; `oficial` = Cloud API. */
  padrao:  { label: string; oficial: boolean } | null
  /** Os modelos APROVADOS da conta (WABA) do número padrão, que o sistema monta. */
  modelos: ModeloAprovado[]
}

interface NoLido { id?: string; tipo: string; config?: unknown; nome?: string }

export function problemasDaAberturaPeloPadrao(nos: NoLido[], rede: RedeParaAbrir): string[] {
  const problemas: string[] = []
  for (const no of nos) {
    if (no.tipo !== NODES.ACAO_MENSAGEM) continue
    const c = (no.config ?? {}) as { canal?: string; semConversa?: string; templateId?: string | null; variaveisDoTemplate?: Record<string, string> }
    if (c.semConversa !== 'abrir_pelo_padrao' || c.canal !== 'whatsapp') continue
    const passo = no.nome ? `"${no.nome}"` : '"Mandar mensagem"'

    if (!rede.padrao) {
      problemas.push(`Em ${passo}, "Abrir pelo número padrão" pede um número padrão de WhatsApp, e a rede não tem: escolha um em Configurações → Integrações.`)
      continue
    }
    if (!rede.padrao.oficial) continue

    if (!c.templateId) {
      problemas.push(`Em ${passo}, o número padrão (${rede.padrao.label}) é da API oficial: para abrir a conversa, escolha um modelo aprovado pela Meta.`)
      continue
    }
    const modelo = rede.modelos.find(m => m.id === c.templateId)
    if (!modelo) {
      problemas.push(`Em ${passo}, o modelo escolhido não está entre os aprovados da conta do número padrão (${rede.padrao.label}): escolha outro.`)
      continue
    }
    const faltam = modelo.variaveis.filter(v => !(c.variaveisDoTemplate?.[v] ?? '').trim())
    if (faltam.length) {
      problemas.push(`Em ${passo}, preencha no modelo "${modelo.nome}": ${faltam.map(v => `{{${v}}}`).join(', ')}.`)
    }
  }
  return problemas
}
