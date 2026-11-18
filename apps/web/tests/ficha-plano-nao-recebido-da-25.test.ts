import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { textoDoPlanoNaoRecebidoNaFicha } from '@/lib/plano-de-tratamento/textos'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const sp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

/**
 * A2 da 25ª simulação (princípio 3): o "A receber" da ficha não mostrava o
 * plano aceito e ainda não recebido, e a tela não dizia por quê. A regra é
 * que o plano só é venda quando é pago (o Heitor, 18/11: "Uma coisa só foi
 * vendida se foi paga.") — o aceite não lança dinheiro nenhum, e o "A
 * receber" é o que foi lançado. A ficha agora diz o plano que falta receber,
 * quanto, e onde se recebe.
 */
describe('A2: a ficha diz o plano aceito e ainda não recebido', () => {
  it('um plano', () => {
    expect(sp(textoDoPlanoNaoRecebidoNaFicha([{ nome: 'Rejuvenescimento', valor: 420 }])))
      .toBe('Plano “Rejuvenescimento” aceito e ainda não recebido: R$ 420,00. Não entra no “A receber” até ser pago: a comanda do plano está no PDV.')
  })
  it('dois planos', () => {
    expect(sp(textoDoPlanoNaoRecebidoNaFicha([{ nome: 'A', valor: 420 }, { nome: 'B', valor: 1420 }])))
      .toBe('2 planos aceitos e ainda não recebidos: R$ 1.840,00. Não entram no “A receber” até serem pagos: as comandas dos planos estão no PDV.')
  })
  it('nenhum, nada', () => {
    expect(textoDoPlanoNaoRecebidoNaFicha([])).toBeNull()
  })
  it('a leitura da ficha traz os planos e a ficha os mostra', () => {
    expect(ler('lib/clientes/financeiro-da-ficha.ts')).toMatch(/planosNaoRecebidos/)
    const banner = ler('components/shared/comandas-abertas-da-ficha.tsx')
    expect(banner).toMatch(/textoDoPlanoNaoRecebidoNaFicha\(/)
    expect(banner).toMatch(/data-plano-nao-recebido/)
    expect(ler('components/branch/client-profile.tsx')).toMatch(/<ComandasAbertasDaFicha[^>]*planos=\{planosNaoRecebidos\}/)
  })
})
