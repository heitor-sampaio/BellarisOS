import { formatBRL } from '@estetica-os/utils'
import type { LancamentoDoExtrato, Fechamento } from '@/lib/comissoes/leitura'
import { rotuloDaBase } from '@/lib/comissoes/config'

/**
 * Como o extrato das comissões escreve cada lançamento — na tela e no CSV
 * (11ª simulação, 2026-11-10; princípio 3). Os números vêm do banco
 * (`comissoes_extrato_com_regra`); aqui só se escreve. Puro: roda no navegador.
 */

export const ORIGEM: Record<string, string> = {
  AVULSO: 'Atendimento', PLANO: 'Plano', PACOTE: 'Sessão de pacote', PACOTE_VENDA: 'Venda de pacote', PRE_PAGO: 'Pré-pago', PRODUTO: 'Venda de produto',
  PACOTE_RESPONSAVEL: 'Pacote (responsável)', PLANO_VENDA: 'Venda de plano', PRE_PAGO_VENDA: 'Venda de procedimento',
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
 * "Venda de procedimento: Drenagem" (A20 da 12ª); o do atendimento segue o procedimento.
 */
export function tituloDoLancamento(l: LancamentoDoExtrato): string {
  if (!ehDeVenda(l)) return l.procedimento ?? 'Procedimento'
  // A13 da 29ª: a linha de UM produto da venda diz o produto dela, não a venda inteira.
  if (l.origem === 'PRODUTO' && l.itemDoProduto) return `Venda de produto: ${produtoDaLinha(l.itemDoProduto)}`
  if (l.origem === 'PRODUTO') return l.procedimento ? `Venda de produto: ${l.procedimento}` : 'Venda de produto'
  // A20 da 12ª: a venda de procedimento avulso é "Venda de procedimento" (o nome do Vender), não "pré-pago".
  if (l.origem === 'PRE_PAGO_VENDA') return l.procedimento ? `Venda de procedimento: ${l.procedimento}` : 'Venda de procedimento'
  return origemDoLancamento(l)
}

/** "40%" ou "R$ 30,00 fixo". */
export function regraEmTexto(l: LancamentoDoExtrato): string {
  if (l.regraTipo == null) return '—'
  return l.regraTipo === 'PERCENTAGE' ? `${String(l.regraValor).replace('.', ',')}%` : `${formatBRL(l.regraValor ?? 0)} fixo`
}

/** "2× Sérum" — o produto da linha e as unidades dele (A13 da 29ª). */
const produtoDaLinha = (i: { nome: string; quantidade: number }) => `${i.quantidade}× ${i.nome}`

/**
 * A13 da 29ª simulação (princípio 3): na comissão POR PRODUTO, o Sérum (10%
 * do vendido) e o Protetor (R$ 5 por unidade) saíam com a mesma cara. A regra
 * da linha de um produto diz como valeu: "10% do vendido" (a parte dele no
 * vendido), ou "R$ 5,00 por unidade × 2" — o fixo é por unidade
 * (`produto_vender_itens` grava o valor × as unidades em `regra_valor`).
 */
function regraDoProdutoEmTexto(l: LancamentoDoExtrato, item: { nome: string; quantidade: number }): string {
  if (l.regraTipo == null) return '—'
  if (l.regraTipo === 'PERCENTAGE') return `${String(l.regraValor).replace('.', ',')}% do vendido`
  const q = Math.max(1, item.quantidade)
  const porUnidade = Math.round(((l.regraValor ?? 0) / q) * 100) / 100
  return `${formatBRL(porUnidade)} por unidade${q > 1 ? ` × ${q}` : ''}`
}

/**
 * A17 da 11ª: de onde veio o percentual da comissão de VENDA — "3% — da
 * Tatiane" (a da pessoa), "10% — do pacote" / "do produto" (a do item), "5% —
 * da clínica". A linha de antes (sem a origem gravada) diz só a regra.
 */
export function regraDoLancamento(l: LancamentoDoExtrato, nomeDaPessoa: string | null): string {
  const regra = l.origem === 'PRODUTO' && l.itemDoProduto ? regraDoProdutoEmTexto(l, l.itemDoProduto) : regraEmTexto(l)
  if (l.regraDe === 'PESSOA') return `${regra} — da ${nomeDaPessoa ?? 'pessoa'}`
  if (l.regraDe === 'ITEM') return `${regra} — ${l.origem === 'PRODUTO' ? 'do produto' : 'do pacote'}`
  if (l.regraDe === 'CLINICA') return `${regra} — da rede`
  return regra
}

/**
 * "base cheia (sem taxa nem insumo descontados; os pontos…)" ou o que saiu dela
 * (J-46, A10). Os pontos seguem o retrato da linha em TODA origem — o pacote, o
 * plano e as vendas também (item 10 das correções da auditoria, decisão do
 * Claude pelos princípios 2 e 3, 2026-11-18; era só no avulso). No R$ fixo, a
 * frase do fixo (D11 da 31ª, CB-03).
 */
export const rotuloDaBaseDoLancamento = (l: LancamentoDoExtrato) =>
  rotuloDaBase({ desconta_taxa: l.descontaTaxa, desconta_insumos: l.descontaInsumos, base_com_pontos: l.baseComPontos, regra_tipo: l.regraTipo })

const TIPO: Record<LancamentoDoExtrato['kind'], string> = { LIBERACAO: 'Liberação', AJUSTE: 'Ajuste', ESTORNO: 'Estorno', AGUARDANDO: 'Aguardando' }
const SITUACAO: Record<LancamentoDoExtrato['status'], string> = { OPEN: 'A pagar', PAID: 'Paga', AGUARDANDO: 'Aguardando o pagamento integral' }
/**
 * A situação de uma linha do extrato (A17 da 22ª simulação, princípio 3): o
 * estorno da comissão não é pago — ele DESCONTA do pagamento. Saía "Paga" no
 * CSV, como a liberação que ele desfaz.
 */
export function situacaoDoLancamento(l: Pick<LancamentoDoExtrato, 'kind' | 'status'>): string {
  if (l.kind === 'ESTORNO' && l.status === 'PAID') return 'Descontada no pagamento'
  if (l.kind === 'ESTORNO' && l.status === 'OPEN') return 'A descontar'
  return SITUACAO[l.status]
}
const dia = (iso: string | null, fuso = 'America/Sao_Paulo') => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso }) : '—'
const reais = (v: number | null) => v == null ? '' : v.toFixed(2).replace('.', ',')
/** A parte do que saiu da base que foi de pontos e voucher (A17 da 25ª); nunca mais que o total. */
const fidelidadeDaBase = (l: LancamentoDoExtrato) => Math.min(Math.max(l.baseFidelidade ?? 0, 0), l.baseDesconto)

/**
 * A linha do fechamento em "Últimos fechamentos" (A32 da 10ª: até a hora do
 * pagamento). D3 da 23ª: as três datas no fuso da REDE (D12), como o CSV.
 */
export function textoDoFechamento(f: Pick<Fechamento, 'inicio' | 'fim' | 'paidAt'>, fuso?: string): string {
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso ?? 'America/Sao_Paulo' })
  // A29 da 24ª (princípio 3): a hora do pagamento também (o CSV já trazia).
  return `lançamentos de ${dia(f.inicio, fuso)} até ${dia(f.fim, fuso)}${f.fim ? ` às ${hora(f.fim)}` : ''}, pago em ${dia(f.paidAt, fuso)}${f.paidAt ? ` às ${hora(f.paidAt)}` : ''}`
}
const campo = (v: string) => /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

/**
 * O CSV do extrato (D3 da 10ª: a base EFETIVA, com o preço e o que saiu dele).
 * A44 da 11ª: "Taxa da maquininha" e "Insumos" saíam 0,00 com a base cheia, e
 * quem lia achava que não houve custo — o que a configuração não desconta fica
 * VAZIO; a regra diz de onde veio (A17).
 */
export function csvDoExtrato(
  linhas: LancamentoDoExtrato[], nomes: Map<string, string>, unidades: Map<string, string>, fuso?: string,
  /** A17 da 22ª: os pagamentos das comissões (os fechamentos), com o estornado — o extrato só dizia a situação final. */
  fechamentos: readonly Fechamento[] = [],
  /**
   * D7 da 26ª (F62b): o fuso de cada unidade (o id → o fuso). Cada linha sai no
   * relógio da unidade DELA; sem o mapa (ou a unidade nele), `fuso`. Os
   * pagamentos (os fechamentos) seguem em `fuso`, o da rede (D12, D3 da 23ª).
   */
  fusos?: ReadonlyMap<string, string>,
): string {
  // A8 da 21ª (princípio 3): a ligação do estorno com a liberação que ele desfaz
  // (a da tela, `vinculosDoExtrato`) e as linhas na ordem do tempo, com a hora —
  // "desfaz a liberação das 13:45" só se acha com a hora de cada linha.
  const hora = (iso: string, f = fuso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: f ?? 'America/Sao_Paulo' })
  const fusoDe = (l: Pick<LancamentoDoExtrato, 'branchId'>) => fusos?.get(l.branchId) ?? fuso
  const vinculos = vinculosDoExtrato(linhas, (iso, l) => hora(iso, l ? fusoDe(l) : fuso))
  const quando = (l: LancamentoDoExtrato) => new Date(l.releasedAt).getTime()
  const emOrdem = linhas.map((l, i) => ({ l, i })).sort((a, b) => quando(a.l) - quando(b.l) || a.i - b.i).map(x => x.l)
  // A20 da 23ª (princípio 3): "Desconto 0,00" com o voucher de R$ 30 parecia erro — a coluna é o
  // desconto que saiu da BASE (com a base cheia, o voucher e os pontos não saem; "O que saiu da base" diz).
  const tabela = [
    ['Lançamento', 'Hora', 'Profissional', 'Unidade', 'Atendimento', 'Cliente', 'Procedimento', 'Origem', 'Preço', 'Desconto que saiu da base', 'Pontos e voucher que saíram da base', 'Taxa da maquininha', 'Insumos', 'Proporção que ficou', 'Base', 'O que saiu da base', 'Regra', 'Tipo', 'Motivo', 'Ligação', 'Valor', 'Previsto', 'Situação', 'Pago em'],
    ...emOrdem.map(l => [
      // As datas no dia da unidade DA LINHA (F62b; D7 da 26ª).
      dia(l.releasedAt, fusoDe(l)), hora(l.releasedAt, fusoDe(l)), nomes.get(l.professionalId) ?? '', unidades.get(l.branchId) ?? '', dia(l.scheduledAt, fusoDe(l)),
      // A13 da 29ª: a linha de um produto diz o produto dela.
      l.cliente ?? '', l.origem === 'PRODUTO' && l.itemDoProduto ? produtoDaLinha(l.itemDoProduto) : l.procedimento ?? '', origemDoLancamento(l),
      // A17 da 25ª (princípio 3): os pontos e o voucher não são desconto — cada um na sua coluna.
      reais(l.preco), l.preco == null ? '' : reais(l.baseDesconto - fidelidadeDaBase(l)),
      l.preco == null ? '' : reais(fidelidadeDaBase(l)),
      l.preco == null || !l.descontaTaxa ? '' : reais(l.baseTaxa),
      l.preco == null || !l.descontaInsumos ? '' : reais(l.baseInsumos),
      l.preco == null || l.baseFator >= 1 ? '' : `${String(Math.round(l.baseFator * 10000) / 100).replace('.', ',')}%`,
      reais(l.base ?? l.preco), l.preco == null ? '' : rotuloDaBaseDoLancamento(l), regraDoLancamento(l, nomes.get(l.professionalId) ?? null),
      TIPO[l.kind], l.motivo ?? '', vinculos.get(l.id) ?? '',
      l.amount.toFixed(2).replace('.', ','), l.previsto == null ? '' : l.previsto.toFixed(2).replace('.', ','), situacaoDoLancamento(l),
      // A21 da 10ª: com o pagamento parcial, o dia em que CADA lançamento foi pago.
      l.pagoEm ? dia(l.pagoEm, fusoDe(l)) : '',
    ]),
  ]
  // A17 da 22ª (princípio 3): o pagamento estornado e pago de novo aparece — cada
  // fechamento com quando foi pago e, estornado, quando e por quê.
  const quandoFoi = (iso: string) => `${dia(iso, fuso)} ${hora(iso)}`
  if (fechamentos.length) tabela.push(
    [],
    ['Pagamentos das comissões'],
    ['Profissional', 'Unidade', 'Pago em', 'Valor', 'Situação'],
    ...[...fechamentos].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()).map(f => [
      f.professionalName, f.branchName, quandoFoi(f.paidAt), reais(f.total),
      f.estornadoAt ? `Estornado em ${quandoFoi(f.estornadoAt)}${f.estornoMotivo ? ` — ${f.estornoMotivo}` : ''}` : 'Pago',
    ]),
  )
  // BOM + ponto e vírgula: é o que o Excel em pt-BR abre certo.
  return '﻿' + tabela.map(l => l.map(campo).join(';')).join('\r\n')
}

/**
 * O vínculo das linhas do estorno no extrato (A8 da 19ª simulação,
 * 2026-11-16; princípio 3). O pagamento estornado e recebido de novo deixa
 * três linhas — "+500, −500, +500" —, e nada dizia que a do meio desfaz a
 * primeira. O estorno se liga à liberação do MESMO pagamento (`transacaoId`;
 * sem ela — o estorno sem lançamento, ou a liberação da conclusão, D3 da 20ª
 * —, a do mesmo atendimento e valor), e a liberação seguinte do mesmo
 * atendimento é "de novo". `hora` escreve a hora no fuso da unidade — D7 da
 * 26ª: recebe a linha citada, para o relógio da unidade DELA.
 */
export function vinculosDoExtrato(
  linhas: readonly LancamentoDoExtrato[], hora: (iso: string, linha?: LancamentoDoExtrato) => string,
): Map<string, string> {
  const vinculos = new Map<string, string>()
  const quando = (l: LancamentoDoExtrato) => new Date(l.releasedAt).getTime()
  const estornos = linhas.filter(l => l.kind === 'ESTORNO')
  if (!estornos.length) return vinculos
  const liberacoes = linhas.filter(l => l.kind === 'LIBERACAO')
  const desfeitas = new Set<string>()
  for (const e of estornos) {
    const antes = liberacoes.filter(l => quando(l) <= quando(e) && !desfeitas.has(l.id))
    const mesmoAtendimentoEValor = (l: LancamentoDoExtrato) =>
      !!e.appointmentId && l.appointmentId === e.appointmentId && Math.abs(l.amount + e.amount) < 0.005
    // D3 da 20ª: pago ANTES da conclusão, a comissão foi liberada pela
    // conclusão, sem o lançamento. Sem a liberação daquele pagamento, o
    // estorno desfaz a liberação SEM pagamento do mesmo atendimento e valor.
    const doPagamento = e.transacaoId ? antes.filter(l => l.transacaoId === e.transacaoId) : []
    const alvo = (doPagamento.length
      ? doPagamento
      : antes.filter(l => (!e.transacaoId || !l.transacaoId) && mesmoAtendimentoEValor(l)))
      .sort((a, b) => quando(b) - quando(a))[0]
    if (!alvo) continue
    desfeitas.add(alvo.id)
    vinculos.set(e.id, `desfaz a liberação das ${hora(alvo.releasedAt, alvo)}`)
  }
  for (const l of liberacoes) {
    if (desfeitas.has(l.id) || !l.appointmentId) continue
    const antes = estornos
      .filter(e => e.appointmentId === l.appointmentId && vinculos.has(e.id) && quando(e) <= quando(l))
      .sort((a, b) => quando(b) - quando(a))[0]
    if (antes) vinculos.set(l.id, `de novo, depois do estorno das ${hora(antes.releasedAt, antes)}`)
  }
  return vinculos
}
