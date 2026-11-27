import { NODES, ROTULOS_DE_NO, rotuloDoEvento } from '@estetica-os/types'
import type { GrafoDeAutomacao, NoDoGrafo, TipoDeNo } from '@estetica-os/types'
import { nomeDoPasso } from './passos'

/**
 * O que a tela das automações diz de uma execução e de uma versão, em
 * português (A16, A17 e A28 da 32ª simulação; princípios 3 e 7). O detalhe da
 * execução mostrava o erro cru ("acao.mensagem: fetch failed") e pares do
 * código ("canal: push · enviada: true", "gatilho: agendamento.concluido"); a
 * versão atual dizia "no ar" com a automação em rascunho; e a execução cuja
 * condição deu "Não" dizia "Concluída". Puro: a tela e o motor importam.
 */

const CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', push: 'Aviso no celular',
}

const rotuloDoTipo = (tipo: string | null | undefined) =>
  (tipo && ROTULOS_DE_NO[tipo as TipoDeNo]) || 'Passo'

const comMaiuscula = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t)

/** O erro técnico de rede (o provedor que não respondeu): "fetch failed", ECONNREFUSED… */
const ERRO_DE_REDE = /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network ?error|AbortError|timed out|timeout/i

/**
 * A16 da 38ª (AX-06, princípio 3): o "Abrir pelo número padrão" que abriu a
 * conversa e não conseguiu mandar. A execução diz as duas coisas — a conversa
 * existe agora no inbox, e a mensagem não saiu —, não só "o número não
 * respondeu". O motor grava o erro assim; `traduzirErro` o lê.
 */
const MARCA_DA_ABERTURA = /^Abriu a conversa pelo número padrão \(([^)]*)\); o envio falhou: ([\s\S]*)$/

export function erroDaAbertura(numero: string, erro: string): string {
  return `Abriu a conversa pelo número padrão (${numero}); o envio falhou: ${erro}`
}

/**
 * O erro como a pessoa o lê. O técnico vira frase ("não conseguiu mandar a
 * mensagem (o número não respondeu)"); o que já é frase fica como está.
 */
function traduzirErro(erro: string, tipo?: string | null): { texto: string; traduzido: boolean } {
  const abertura = MARCA_DA_ABERTURA.exec(erro)
  if (abertura) {
    const abriu = `abriu a conversa pelo número padrão (${abertura[1]})`
    const resto = abertura[2]!
    return {
      traduzido: true,
      texto: ERRO_DE_REDE.test(resto)
        ? `${abriu}, mas não conseguiu mandar a mensagem (o número não respondeu).`
        : `${abriu}, mas a mensagem não saiu: ${resto}`,
    }
  }
  if (ERRO_DE_REDE.test(erro)) {
    return {
      traduzido: true,
      texto: tipo === NODES.ACAO_MENSAGEM
        ? 'não conseguiu mandar a mensagem (o número não respondeu).'
        : 'não conseguiu falar com o serviço (ele não respondeu).',
    }
  }
  return { texto: erro, traduzido: false }
}

/** O erro de um PASSO: "Não conseguiu mandar a mensagem (o número não respondeu)." */
export function erroEmPortugues(erro: string, tipo?: string | null): string {
  return comMaiuscula(traduzirErro(erro, tipo).texto)
}

/**
 * O erro da EXECUÇÃO, que o motor grava como "<tipo do passo>: <erro>"
 * ("acao.mensagem: fetch failed"): o nome do passo em português e o erro
 * traduzido — "Mandar mensagem: não conseguiu mandar a mensagem (…)".
 */
export function erroDaExecucao(erro: string): string {
  const m = /^([a-z]+\.[a-z_]+): ([\s\S]*)$/.exec(erro)
  if (!m || !ROTULOS_DE_NO[m[1] as TipoDeNo]) return traduzirErro(erro).traduzido ? erroEmPortugues(erro) : erro
  return `${rotuloDoTipo(m[1])}: ${traduzirErro(m[2]!, m[1]).texto}`
}

const quantas = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** O resumo de um passo em linguagem de gente — nunca "chave: valor" do código. */
export function descreverResumo(tipo: string | null | undefined, resumo: Record<string, unknown> | null | undefined): string {
  if (!resumo || !Object.keys(resumo).length) return '—'

  // O que carrega a decisão vem primeiro e sozinho.
  if (resumo.erro)      return erroEmPortugues(String(resumo.erro), tipo)
  if (resumo.motivo)    return String(resumo.motivo)
  if (resumo.adiado)    return String(resumo.adiado)
  if (resumo.faria)     return `Faria: ${resumo.faria}`
  if (resumo.pulou)     return `Esperaria ${resumo.pulou}`
  if (resumo.resultado) return `Resultado: ${resumo.resultado}`
  if (resumo.saida)     return `Seguiu por "${resumo.saida}"`

  switch (tipo) {
    case NODES.GATILHO_EVENTO:
    case NODES.GATILHO_AGENDA: {
      const g = resumo.gatilho as string | undefined
      return !g || g === 'agenda' || tipo === NODES.GATILHO_AGENDA ? 'No horário marcado' : rotuloDoEvento(g)
    }
    case NODES.ACAO_MENSAGEM: {
      if (resumo.enviada !== true) break
      if (resumo.canal === 'push') {
        return `Aviso no celular: enviado${resumo.semConversa ? ' (não havia conversa aberta)' : ''}`
      }
      const canal = CANAL[String(resumo.canal ?? '')] ?? 'Mensagem'
      // R10: a cliente não tinha conversa, e a rede escolheu abrir pelo número padrão.
      const abriu = resumo.abriuConversa ? ' (abriu a conversa pelo número padrão)' : ''
      const modelo = resumo.modelo ? ' · o modelo aprovado' : ''
      return `${canal}: enviada${abriu}${modelo}${resumo.texto && !resumo.modelo ? ` · “${resumo.texto}”` : ''}`
    }
    case NODES.ACAO_NOTIFICAR_EQUIPE:
      if (typeof resumo.avisados === 'number') return `Avisou ${quantas(resumo.avisados, 'pessoa', 'pessoas')}`
      break
    case NODES.ACAO_DESFECHO:
      if (resumo.desfecho) return `Marcou como ${resumo.desfecho}`
      break
    case NODES.ACAO_MOVER_ETAPA:
      if (resumo.movido) return resumo.de ? `Moveu de “${resumo.de}” para “${resumo.para}”` : `Moveu para “${resumo.para}”`
      break
    case NODES.ACAO_ANOTAR:
      if (resumo.anotado) return 'Anotou na linha do tempo'
      break
    case NODES.ACAO_TAG_CLIENTE:
      if (resumo.alterado) return `Adicionou a tag “${resumo.tag}”`
      break
    case NODES.ACAO_REMOVER_TAG:
      if (resumo.alterado) return `Tirou a tag “${resumo.tag}”`
      break
    case NODES.ACAO_ATRIBUIR:
      if (resumo.atribuido) {
        return resumo.responsavel === 'sem mudança' ? 'O responsável já era esse' : `Responsável: ${resumo.responsavel}`
      }
      break
    case NODES.BUSCAR_CLIENTES:
      if (typeof resumo.encontrados === 'number') {
        return `Achou ${quantas(resumo.encontrados, 'cliente', 'clientes')}${resumo.aviso ? ` · ${resumo.aviso}` : ''}`
      }
      break
  }
  return 'Feito'
}

/**
 * A versão atual na aba Versões (A16 da 32ª; RX-04, princípio 3): "no ar" só
 * com a automação ligada — em rascunho ou desligada, ela é a atual e não está
 * no ar.
 */
export function rotuloDaVersaoAtual(status: string): string {
  if (status === 'ATIVA') return 'no ar'
  return status === 'PAUSADA' ? 'atual · desligada, não está no ar' : 'atual · rascunho, não está no ar'
}

/**
 * Como terminou a execução que não fez o que o fluxo pedia (A28, D6 e D15 da
 * 32ª; princípio 3). No banco ela continua `ok` — não falhou nada —, mas a
 * lista não diz "Concluída": diz "Parou" (a condição deu "Não" e o caminho
 * termina ali) ou "Não mandou" (a mensagem não saiu), com o motivo.
 */
export interface FimDaExecucao {
  rotulo: 'Parou' | 'Não mandou' | 'Guardada no sino'
  motivo: string
}

export function fimDoPasso(
  no: NoDoGrafo,
  grafo: GrafoDeAutomacao,
  resumo: Record<string, unknown> | undefined,
  saida: string | undefined,
  seguiu: boolean,
): FimDaExecucao | null {
  if (no.tipo === NODES.CONDICAO_SE && saida === 'nao' && !seguiu) {
    return { rotulo: 'Parou', motivo: `A condição “${nomeDoPasso(no, grafo)}” não valeu.` }
  }
  if (no.tipo === NODES.ACAO_MENSAGEM && resumo?.enviada === false) {
    const motivo = String(resumo.motivo ?? 'A mensagem não saiu.')
    return resumo.guardada ? { rotulo: 'Guardada no sino', motivo } : { rotulo: 'Não mandou', motivo }
  }
  return null
}
