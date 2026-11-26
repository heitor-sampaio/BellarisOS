import { rotuloDaForma } from '@/lib/financeiro/formas'
import { rotuloDaBandeira } from '@/lib/financeiro/bandeiras'
import { textoDeQuemCadastraATaxa } from '@/lib/financeiro/quem-cadastra-a-taxa'

/**
 * A venda no cartão sem a taxa da maquininha cadastrada (F16-2: vale 0%, a
 * venda sai sem desconto da operadora), como as telas a escrevem. Os números
 * chegam prontos de lib/metrics (`getTaxasDoPeriodo`); aqui só se escreve.
 * Puro: roda no navegador.
 */
export interface VendaSemTaxa { metodo: string; vezes: number; bandeira: string | null; vendas: number; valor: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "Débito: 2 vendas, R$ 1.000,00; Crédito 3x (Visa): 1 venda, R$ 300,00". */
export function formasSemTaxaEmTexto(vendas: readonly VendaSemTaxa[]): string {
  return vendas.map(x => {
    const b = rotuloDaBandeira(x.bandeira)
    return `${rotuloDaForma(x.metodo, x.vezes)}${b ? ` (${b})` : ''}: ${x.vendas} ${x.vendas === 1 ? 'venda' : 'vendas'}, ${brl(x.valor)}`
  }).join('; ')
}

/**
 * A14 da 29ª simulação (princípio 4: "Faltou o dado, vale zero e a tela
 * avisa"): o PDV avisava "sem taxa de débito: 0%", e o DRE mostrava as taxas
 * da maquininha sem dizer que parte das vendas entrou com taxa zero. Sem
 * nenhuma, nulo.
 *
 * D6 da 34ª (MQ-10): a quem não cadastra a taxa (`quemCadastra` com os nomes,
 * `quemCadastraATaxa`), o aviso diz quem cadastra, sem o caminho das
 * Configurações; nulo (ou sem dizer): a pessoa cadastra, e o caminho fica.
 */
export function avisoDoDreSemTaxa(vendas: readonly VendaSemTaxa[] | null | undefined, quemCadastra?: readonly string[] | null): string | null {
  if (!vendas?.length) return null
  return `Sem taxa da maquininha cadastrada, a taxa destas vendas é ${brl(0)} (0%) no DRE: ${formasSemTaxaEmTexto(vendas)}. `
    + (quemCadastra ? textoDeQuemCadastraATaxa(quemCadastra) : 'Cadastre a taxa em Configurações → Comissões e taxas.')
}
