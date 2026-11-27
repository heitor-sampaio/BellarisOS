import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'

/**
 * O pagamento que veio do navegador tem a forma de um pagamento? (o contrato
 * do plano e o do atendimento avulso — `actions/documentos.ts`). A mesma
 * forma que o PDV aceita (`EntradaDoPagamento`). `teto`: o das parcelas no
 * registro (`TETO_DO_CREDIARIO`; o limite da rede vem depois).
 */
export function pagamentoValido(p: unknown, teto: number): p is PagamentoDoPlano | null {
  if (p === null) return true
  if (!p || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  const texto = (v: unknown) => typeof v === 'string' && v.length <= 40
  const data = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
  switch (x.forma) {
    case 'AVISTA':    return texto(x.metodo)
    case 'A_RECEBER': return (x.metodo === null || texto(x.metodo)) && (x.vencimento === null || data(x.vencimento))
    // A forma só (o limite da rede vem depois, `recusaDasParcelasDaRede`): o 48
    // daqui recusava o crediário que a rede faz em 60 (princípio 2, CR-02).
    // CR-01 / PDV8: sem entrada, nada entra agora e nenhuma forma é pedida (a
    // tela manda `metodo: null`); com entrada, a forma da entrada (D2 da 35ª).
    case 'PARCELADO': return (x.metodo == null ? !((x.entrada as number) > 0) : texto(x.metodo))
      && Number.isFinite(x.entrada) && (x.entrada as number) >= 0
      && Number.isInteger(x.parcelas) && (x.parcelas as number) >= 1 && (x.parcelas as number) <= teto && data(x.primeiroVencimento)
    default:          return false
  }
}

/**
 * O que se recebe AGORA pede a forma: o à vista e a entrada do crediário. O
 * crediário sem entrada e o a receber, não — nada entra agora (CR-01, PDV8).
 */
export function pedeAFormaAgora(p: PagamentoDoPlano | null | undefined): boolean {
  if (!p) return false
  if (p.forma === 'AVISTA') return true
  return p.forma === 'PARCELADO' && p.entrada > 0
}
