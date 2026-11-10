import { formatBRL } from '@estetica-os/utils'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'
import { rotuloDaBase } from '@/lib/comissoes/config'

/**
 * Como o extrato das comissões escreve cada lançamento — na tela e no CSV
 * (11ª simulação, 2026-11-10; princípio 3). Os números vêm do banco
 * (`comissoes_extrato_com_regra`); aqui só se escreve. Puro: roda no navegador.
 */

export const ORIGEM: Record<string, string> = {
  AVULSO: 'Atendimento', PLANO: 'Plano', PACOTE: 'Sessão de pacote', PACOTE_VENDA: 'Venda de pacote', PRE_PAGO: 'Pré-pago', PRODUTO: 'Venda de produto',
  PACOTE_RESPONSAVEL: 'Pacote (responsável)', PLANO_VENDA: 'Venda de plano', PRE_PAGO_VENDA: 'Venda de pré-pago',
}

/** A origem da linha, com o nome do pacote quando é dele (2026-10-30): "Venda do pacote X", "Sessão do pacote X". */
export function origemDoLancamento(l: LancamentoDoExtrato): string {
  if (!l.origem) return ''
  if (l.pacote && l.origem === 'PACOTE_VENDA') return `Venda do pacote ${l.pacote}`
  // com-04: a comissão de quem atende sobre o valor do pacote, da profissional responsável.
  if (l.pacote && l.origem === 'PACOTE_RESPONSAVEL') return `Pacote ${l.pacote} (responsável)`
  if (l.pacote && l.origem === 'PACOTE') return `Sessão do pacote ${l.pacote}`
  // Decisão 4 da 7ª: a comissão de quem VENDEU o plano.
  if (l.plano && l.origem === 'PLANO_VENDA') return `Venda do plano ${l.plano}`
  return ORIGEM[l.origem] ?? l.origem
}

const DE_VENDA = new Set(['PLANO_VENDA', 'PACOTE_VENDA', 'PACOTE_RESPONSAVEL', 'PRODUTO', 'PRE_PAGO_VENDA'])

/** O lançamento é de uma VENDA (não de um atendimento): o título diz a venda. */
export const ehDeVenda = (l: LancamentoDoExtrato) => !!l.origem && DE_VENDA.has(l.origem)

/**
 * A43 da 11ª: a venda do plano aparecia como "Procedimento · Beatriz" (o
 * título era o procedimento, que a venda não tem). O título da venda é a
 * venda: "Venda do plano X", "Venda do pacote X", "Venda de produto: Sérum",
 * "Venda de pré-pago: Drenagem"; o do atendimento segue o procedimento.
 */
export function tituloDoLancamento(l: LancamentoDoExtrato): string {
  if (!ehDeVenda(l)) return l.procedimento ?? 'Procedimento'
  if (l.origem === 'PRODUTO') return l.procedimento ? `Venda de produto: ${l.procedimento}` : 'Venda de produto'
  if (l.origem === 'PRE_PAGO_VENDA') return l.procedimento ? `Venda de pré-pago: ${l.procedimento}` : 'Venda de pré-pago'
  return origemDoLancamento(l)
}

/** "40%" ou "R$ 30,00 fixo". */
export function regraEmTexto(l: LancamentoDoExtrato): string {
  if (l.regraTipo == null) return '—'
  return l.regraTipo === 'PERCENTAGE' ? `${String(l.regraValor).replace('.', ',')}%` : `${formatBRL(l.regraValor ?? 0)} fixo`
}

/**
 * A17 da 11ª: de onde veio o percentual da comissão de VENDA — "3% — da
 * Tatiane" (a da pessoa), "10% — do pacote" / "do produto" (a do item), "5% —
 * da clínica". A linha de antes (sem a origem gravada) diz só a regra.
 */
export function regraDoLancamento(l: LancamentoDoExtrato, nomeDaPessoa: string | null): string {
  const regra = regraEmTexto(l)
  if (l.regraDe === 'PESSOA') return `${regra} — da ${nomeDaPessoa ?? 'pessoa'}`
  if (l.regraDe === 'ITEM') return `${regra} — ${l.origem === 'PRODUTO' ? 'do produto' : 'do pacote'}`
  if (l.regraDe === 'CLINICA') return `${regra} — da clínica`
  return regra
}

/** "base cheia (sem taxa nem insumo descontados; os pontos…)" ou o que saiu dela (J-46, A10). */
export const rotuloDaBaseDoLancamento = (l: LancamentoDoExtrato) =>
  rotuloDaBase({ desconta_taxa: l.descontaTaxa, desconta_insumos: l.descontaInsumos, base_com_pontos: l.origem === 'AVULSO' ? l.baseComPontos : 'PRECO' })

const TIPO: Record<LancamentoDoExtrato['kind'], string> = { LIBERACAO: 'Liberação', AJUSTE: 'Ajuste', ESTORNO: 'Estorno', AGUARDANDO: 'Aguardando' }
const SITUACAO: Record<LancamentoDoExtrato['status'], string> = { OPEN: 'A pagar', PAID: 'Paga', AGUARDANDO: 'Aguardando o pagamento integral' }
const dia = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const reais = (v: number | null) => v == null ? '' : v.toFixed(2).replace('.', ',')
const campo = (v: string) => /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

/**
 * O CSV do extrato (D3 da 10ª: a base EFETIVA, com o preço e o que saiu dele).
 * A44 da 11ª: "Taxa da maquininha" e "Insumos" saíam 0,00 com a base cheia, e
 * quem lia achava que não houve custo — o que a configuração não desconta fica
 * VAZIO; a regra diz de onde veio (A17).
 */
export function csvDoExtrato(linhas: LancamentoDoExtrato[], nomes: Map<string, string>, unidades: Map<string, string>): string {
  const tabela = [
    ['Lançamento', 'Profissional', 'Unidade', 'Atendimento', 'Cliente', 'Procedimento', 'Origem', 'Preço', 'Desconto', 'Taxa da maquininha', 'Insumos', 'Proporção que ficou', 'Base', 'O que saiu da base', 'Regra', 'Tipo', 'Motivo', 'Valor', 'Previsto', 'Situação', 'Pago em'],
    ...linhas.map(l => [
      dia(l.releasedAt), nomes.get(l.professionalId) ?? '', unidades.get(l.branchId) ?? '', dia(l.scheduledAt),
      l.cliente ?? '', l.procedimento ?? '', origemDoLancamento(l),
      reais(l.preco), l.preco == null ? '' : reais(l.baseDesconto),
      l.preco == null || !l.descontaTaxa ? '' : reais(l.baseTaxa),
      l.preco == null || !l.descontaInsumos ? '' : reais(l.baseInsumos),
      l.preco == null || l.baseFator >= 1 ? '' : `${String(Math.round(l.baseFator * 10000) / 100).replace('.', ',')}%`,
      reais(l.base ?? l.preco), l.preco == null ? '' : rotuloDaBaseDoLancamento(l), regraDoLancamento(l, nomes.get(l.professionalId) ?? null),
      TIPO[l.kind], l.motivo ?? '',
      l.amount.toFixed(2).replace('.', ','), l.previsto == null ? '' : l.previsto.toFixed(2).replace('.', ','), SITUACAO[l.status],
      // A21 da 10ª: com o pagamento parcial, o dia em que CADA lançamento foi pago.
      l.pagoEm ? dia(l.pagoEm) : '',
    ]),
  ]
  // BOM + ponto e vírgula: é o que o Excel em pt-BR abre certo.
  return '﻿' + tabela.map(l => l.map(campo).join(';')).join('\r\n')
}
