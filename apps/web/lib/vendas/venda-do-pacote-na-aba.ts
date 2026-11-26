/**
 * A venda do pacote enquanto o contrato espera a assinatura (A6 da 34ª
 * simulação, princípio 7): no PDV, depois de assinar o contrato ("primeiro
 * colhe assinatura, depois paga" — PC2), a venda voltava zerada (a aba, quem
 * vendeu, a forma, as parcelas).
 *
 * Mora no sessionStorage, por unidade e cliente: sobrevive à tela que se monta
 * de novo e ao recarregar, e MORRE com a aba (a regra do passo do checkout do
 * plano, `lib/checkout/passo-do-checkout.ts`). Só o que a pessoa escolheu, nada
 * que o servidor não confira de novo: a venda confere o contrato assinado e o
 * pagamento. Vender ou cancelar apaga. Todo acesso é protegido: o
 * armazenamento pode faltar.
 */
import type { EstadoDoPagamento } from '@/components/shared/campos-do-pagamento'
import type { EstadoDoDesconto } from '@/components/shared/campo-do-desconto'

export interface VendaDoPacoteNaAba {
  pacoteId:      string
  estado:        EstadoDoPagamento
  desconto:      EstadoDoDesconto
  vendedorId:    string
  semVendedor:   boolean
  responsavelId: string
}

const FORMAS = ['NADA_AGORA', 'AVISTA', 'PARCELADO', 'A_RECEBER'] as const

export function chaveDaVendaDoPacote(unidadeId: string, clienteId: string): string {
  return `bellaris:venda-do-pacote:${unidadeId}:${clienteId}`
}

function daSessao(): Storage | null {
  try { return typeof window === 'undefined' || !window ? null : window.sessionStorage ?? null } catch { return null }
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const inteiro = (v: unknown, padrao: number) => (Number.isInteger(v) && (v as number) >= 1 ? (v as number) : padrao)

/** O estado do pagamento guardado, conferido campo a campo (o que não confere, não volta). */
function estadoConferido(e: unknown): EstadoDoPagamento | null {
  if (!e || typeof e !== 'object') return null
  const v = e as Record<string, unknown>
  if (!FORMAS.includes(v.forma as typeof FORMAS[number])) return null
  const outras = Array.isArray(v.outras)
    ? v.outras.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object').map(p => ({
        metodo: texto(p.metodo), valor: texto(p.valor), vezes: inteiro(p.vezes, 1), bandeira: texto(p.bandeira), maquininha: texto(p.maquininha),
      }))
    : undefined
  return {
    forma: v.forma as EstadoDoPagamento['forma'],
    metodo: texto(v.metodo), entrada: texto(v.entrada), parcelas: inteiro(v.parcelas, 1),
    data: texto(v.data), vencimento: texto(v.vencimento), vezes: inteiro(v.vezes, 1), bandeira: texto(v.bandeira),
    ...(typeof v.maquininha === 'string' ? { maquininha: v.maquininha } : {}),
    ...(outras ? { outras } : {}),
    ...(typeof v.entregue === 'string' ? { entregue: v.entregue } : {}),
  }
}

export function lerVendaDoPacote(unidadeId: string, clienteId: string): VendaDoPacoteNaAba | null {
  try {
    const bruto = daSessao()?.getItem(chaveDaVendaDoPacote(unidadeId, clienteId))
    if (!bruto) return null
    const v = JSON.parse(bruto) as Partial<Record<keyof VendaDoPacoteNaAba, unknown>>
    const estado = estadoConferido(v.estado)
    if (typeof v.pacoteId !== 'string' || !v.pacoteId || !estado) return null
    const d = v.desconto as Record<string, unknown> | undefined
    return {
      pacoteId: v.pacoteId,
      estado,
      desconto: d && (d.tipo === 'VALOR' || d.tipo === 'PERCENTUAL') && typeof d.texto === 'string'
        ? { tipo: d.tipo, texto: d.texto, ...(typeof d.motivo === 'string' ? { motivo: d.motivo } : {}) }
        : { tipo: 'VALOR', texto: '' },
      vendedorId: texto(v.vendedorId),
      semVendedor: v.semVendedor === true,
      responsavelId: texto(v.responsavelId),
    }
  } catch { return null }
}

export function guardarVendaDoPacote(unidadeId: string, clienteId: string, venda: VendaDoPacoteNaAba): void {
  try { daSessao()?.setItem(chaveDaVendaDoPacote(unidadeId, clienteId), JSON.stringify(venda)) } catch { /* sem o armazenamento, a tela segue sem ele */ }
}

export function esquecerVendaDoPacote(unidadeId: string, clienteId: string): void {
  try { daSessao()?.removeItem(chaveDaVendaDoPacote(unidadeId, clienteId)) } catch { /* idem */ }
}
