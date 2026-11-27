import { divergenciasDaBaixa, type TotalDoMapa, type OrigemDoTotal, type InsumoDaBaixa, type ProdutoDaBaixa } from '@/lib/injetaveis/dose'

/**
 * A desistência NO MEIO do atendimento (o Heitor, 2026-11-18: "Não existe isso
 * de desistir no meio do atendimento. Se isso por ventura acontecer, problema
 * de quem desistir."). A sessão já paga — do pacote, do plano ou do pré-pago —
 * NÃO volta à cliente: conta como usada (`private.pre_pago_libera`). A janela
 * diz isso antes de cancelar (princípio 3: o que a tela mostra é o que vale).
 */
export const TEXTO_DA_SESSAO_NA_DESISTENCIA =
  'Se esta sessão já foi paga (pacote, plano ou pré-pago), ela conta como usada: não fica de novo para a cliente.'

/**
 * A18 da 35ª (princípio 3; PT-13/PT-19: a APLICAÇÃO registrada neste
 * atendimento é o que foi aplicado): a janela da desistência oferecia baixar
 * "o que já foi aplicado" com a dose do insumo no procedimento (20 UI), e o
 * mapa tinha 8 UI aplicadas. Com a aplicação registrada, o produto dela vai com
 * a dose aplicada — e entra, pelo produto do estoque, se não estava marcado.
 * O planejamento sem aplicação não é o aplicado: a baixa fica a da tela. A
 * comparação é a do "Finalizar" (`divergenciasDaBaixa`: o nome do produto e a
 * medida — "U" e "UI" são a mesma); a medida que não se converte fica de fora.
 */
export function insumosDaDesistencia<I extends InsumoDaBaixa>(
  marcados: I[], totais: readonly (TotalDoMapa & { origem?: OrigemDoTotal })[], estoque: ProdutoDaBaixa[],
): InsumoDaBaixa[] {
  const aplicados = totais.filter(t => t.origem === 'APLICACAO').map(({ product, unit, total }) => ({ product, unit, total }))
  if (!aplicados.length) return marcados
  const diferencas = divergenciasDaBaixa(aplicados, marcados, estoque)
  const saida: InsumoDaBaixa[] = marcados.map(i => {
    const d = diferencas.find(x => x.productId === i.productId && x.naBaixa !== null)
    return d ? { ...i, quantity: d.doMapa } : i
  })
  for (const d of diferencas) {
    if (d.naBaixa === null && !d.medidaDoMapa) saida.push({ productId: d.productId, name: d.nome, unit: d.unidade, quantity: d.doMapa })
  }
  return saida
}
