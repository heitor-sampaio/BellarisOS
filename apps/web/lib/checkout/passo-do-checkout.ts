/**
 * Onde o checkout do plano estava (A45 da 7ª simulação, 2026-11-05): o
 * recarregar voltava ao passo "Plano", e a recepção refazia o pagamento — o que
 * já tinha sido assinado continuava valendo, mas a tela não sabia.
 *
 * Mora no sessionStorage, por plano: sobrevive ao recarregar e MORRE com a aba
 * (a regra do rascunho do atendimento, `lib/atendimento/rascunho.ts`). Só o que
 * a pessoa escolheu — o passo e o pagamento —, nada que o servidor não confira
 * de novo: os documentos se montam outra vez com o pagamento guardado, e o
 * contrato já assinado para ele não se substitui. Fechar ou cancelar o
 * checkout o apaga. Todo acesso é protegido: o armazenamento pode faltar.
 */

export interface PassoDoCheckout {
  step:          number
  formaPgto:     'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'
  paymentMethod: string
  entrada:       string
  parcelas:      number
  vezesCartao:   number
  bandeira:      string
  primeiroVenc:  string
  desconto:      { tipo: 'VALOR' | 'PERCENTUAL'; texto: string; motivo?: string }
  vendedorId:    string
  semVendedor:   boolean
}

const FORMAS = ['NADA_AGORA', 'AVISTA', 'PARCELADO', 'A_RECEBER'] as const

export function chaveDoPassoDoCheckout(planId: string): string {
  return `bellaris:checkout-do-plano:${planId}`
}

function daSessao(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

/** O que estava guardado, conferido campo a campo (o que não confere, não volta). */
export function lerPassoDoCheckout(planId: string): PassoDoCheckout | null {
  try {
    const bruto = daSessao()?.getItem(chaveDoPassoDoCheckout(planId))
    if (!bruto) return null
    const v = JSON.parse(bruto) as Partial<PassoDoCheckout>
    if (typeof v.step !== 'number' || v.step < 0 || v.step > 3 || !FORMAS.includes(v.formaPgto as typeof FORMAS[number])) return null
    const d = v.desconto
    return {
      step:          Math.trunc(v.step),
      formaPgto:     v.formaPgto as PassoDoCheckout['formaPgto'],
      paymentMethod: typeof v.paymentMethod === 'string' ? v.paymentMethod : '',
      entrada:       typeof v.entrada === 'string' ? v.entrada : '',
      parcelas:      Number.isInteger(v.parcelas) && v.parcelas! >= 1 && v.parcelas! <= 12 ? v.parcelas! : 3,
      vezesCartao:   Number.isInteger(v.vezesCartao) && v.vezesCartao! >= 1 && v.vezesCartao! <= 12 ? v.vezesCartao! : 1,
      bandeira:      typeof v.bandeira === 'string' ? v.bandeira : '',
      primeiroVenc:  typeof v.primeiroVenc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.primeiroVenc) ? v.primeiroVenc : '',
      desconto:      d && (d.tipo === 'VALOR' || d.tipo === 'PERCENTUAL') && typeof d.texto === 'string'
        ? { tipo: d.tipo, texto: d.texto, ...(typeof d.motivo === 'string' ? { motivo: d.motivo } : {}) }
        : { tipo: 'VALOR', texto: '' },
      vendedorId:    typeof v.vendedorId === 'string' ? v.vendedorId : '',
      semVendedor:   v.semVendedor === true,
    }
  } catch { return null }
}

export function gravarPassoDoCheckout(planId: string, p: PassoDoCheckout): void {
  try { daSessao()?.setItem(chaveDoPassoDoCheckout(planId), JSON.stringify(p)) } catch { /* sem o armazenamento, a tela segue sem ele */ }
}

export function limparPassoDoCheckout(planId: string): void {
  try { daSessao()?.removeItem(chaveDoPassoDoCheckout(planId)) } catch { /* idem */ }
}
