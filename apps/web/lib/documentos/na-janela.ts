import type { ResumoDeDocumento } from './leitura'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { oQueFalta, faltaNoCadastro } from './o-que-falta'

/**
 * Um documento do agendamento como a JANELA da agenda o mostra (A34 da 6ª
 * simulação): o título, a situação e se bloqueia (nada do conteúdo), e o que
 * quem está na janela faz dali. Puro: a action (`documentosDaJanela`) e o
 * teste usam o mesmo.
 */
export interface DocumentoDaJanela {
  id: string; titulo: string; situacao: string; bloqueia: boolean; assinado: boolean
  /**
   * Quem está na janela colhe daqui (A23 da 9ª simulação: o termo
   * que bloqueia não tinha caminho na janela — era Clientes → Documentos →
   * Colher assinatura). Só no que falta assinar, com o documento pronto.
   */
  podeColher: boolean
  /** A8 da 11ª: o link de assinatura também daqui (o documento pronto, PENDENTE). */
  podeEnviarLink: boolean
  /** Há um link valendo, até quando. */
  linkAte: string | null
  /**
   * A9 da 11ª: o que falta no cadastro, dito na janela ("Faltam dados do
   * cadastro: CPF") — só se via na tela do atendimento. Sem "Cliente · ".
   */
  faltando: string[]
  /** A ficha da cliente, para "Completar o cadastro" (quem edita Clientes). */
  clienteId: string | null
  podeCompletar: boolean
  /**
   * D4 da 43ª (DG-01: "Quem colhe a assinatura define o pagamento antes dela";
   * DQ-06: a janela é lugar de colher): o contrato do procedimento que espera o
   * pagamento combinado se define daqui, com o formulário da ficha.
   */
  podeDefinirPagamento: boolean
  /** O preço do atendimento: sobre ele se dá o desconto do contrato. */
  valorDoAtendimento: number | null
  /** O combinado de antes (nulo: não combinado). */
  pagamento: { valor: PagamentoDoPlano | null; desconto: number } | null
}

const SITUACAO: Record<string, string> = {
  ASSINADO: 'Assinado', DISPENSADO: 'Dispensado', PENDENTE: 'Falta assinar', INCOMPLETO: 'Faltam dados do cadastro', A_GERAR: 'Em preparação',
}

const ABERTO = ['A_GERAR', 'INCOMPLETO', 'PENDENTE']

export function documentoNaJanela(d: ResumoDeDocumento, quem: { colhe: boolean; completa: boolean; clienteId: string | null }): DocumentoDaJanela {
  const faltando = d.status === 'INCOMPLETO' ? oQueFalta(d.faltando) : []
  return {
    id: d.id, titulo: d.titulo,
    situacao: faltando.length ? `Faltam dados: ${faltando.join(', ')}` : (SITUACAO[d.status] ?? d.status),
    bloqueia: d.exigencia === 'BLOQUEIA', assinado: d.status === 'ASSINADO' || d.status === 'DISPENSADO',
    podeColher: quem.colhe && (d.status === 'PENDENTE' || d.status === 'A_GERAR'),
    podeEnviarLink: quem.colhe && d.status === 'PENDENTE',
    linkAte: d.linkAte,
    faltando,
    clienteId: quem.clienteId,
    podeCompletar: quem.completa && faltaNoCadastro(faltando),
    podeDefinirPagamento: quem.colhe && d.pedePagamento && !d.pagamento && ABERTO.includes(d.status),
    valorDoAtendimento: d.valorDoAtendimento,
    pagamento: d.pagamento ? { valor: d.pagamento.valor, desconto: d.pagamento.desconto } : null,
  }
}
