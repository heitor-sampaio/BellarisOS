import { quantidadeComMedida } from '@/lib/estoque/medidas'

/**
 * A5 da 38ª simulação (atendimento:ES-25, "para o recall, o que o lote
 * entregou de fato"; princípio 3): a venda cancelada com o produto de volta
 * seguia no "Aplicado em" do lote como "venda · 1 un", sem a volta. Puro.
 *
 * - A venda estornada com "O produto voltou": voltou TODA (`produto_estornar_venda`
 *   devolve a cada lote o que saiu dele), no dia do estorno.
 * - Estornada sem a volta: a cliente ficou com o produto — o lote o entregou.
 * - A devolução de parte (`produto_devolver_itens`): as unidades da linha da
 *   venda, no dia do movimento da devolução. O lote de onde elas saíram não se
 *   chuta (princípio 4): diz-se a devolução da linha.
 */
export interface DevolucaoDaVenda { toda: boolean; unidades: number | null; quando: string | null }

export function devolucaoDaVenda(v: {
  estornadaEm: string | null; produtoVoltou: boolean | null; devolvidas: number | null; devolvidaEm: string | null
}): DevolucaoDaVenda | null {
  if (v.estornadaEm && v.produtoVoltou === true) return { toda: true, unidades: null, quando: v.estornadaEm }
  if (Number(v.devolvidas ?? 0) > 0) return { toda: false, unidades: Number(v.devolvidas), quando: v.devolvidaEm }
  return null
}

/** "Voltou ao estoque em 27/11"; a parte, "Devolução de 2 frascos em 27/11". */
export function rotuloDaDevolucao(d: DevolucaoDaVenda, embalagem: string, dia: (iso: string) => string): string {
  const quando = d.quando ? ` em ${dia(d.quando)}` : ''
  return d.toda ? `Voltou ao estoque${quando}` : `Devolução de ${quantidadeComMedida(d.unidades ?? 0, embalagem, 2)}${quando}`
}
