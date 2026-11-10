/**
 * Os textos da indicação que premia (decisão do Heitor, 2026-11-10: "1 - sim").
 * Puro: a ficha de quem indicou, o app da cliente e os testes leem daqui. Quem
 * DÁ o prêmio é o banco (`private.indicacao_premiar`, no gatilho do pagamento);
 * aqui só se diz.
 */
import { formatarPontos } from './formato'
import type { PremioDeIndicacao } from './config'

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/** Uma ficha que ela indicou, como `indicacoes_da_ficha` devolve. */
export interface IndicadaNaFicha {
  id:          string
  nome:        string
  /** O prêmio ativo dado a quem indicou (nulo sem prêmio). */
  premioEm:    string | null
  /** O último prêmio estornado (o pagamento da indicada voltou). */
  estornadoEm: string | null
  /** A indicada já tem um pagamento que vale (a régua do prêmio). */
  jaPagou:     boolean
}

/**
 * O que vai entre parênteses depois do nome, na ficha de quem indicou:
 * "prêmio dado em 10/11", "prêmio estornado em 12/11 (…)", "prêmio quando ela
 * fizer o primeiro pagamento" ou "sem prêmio: …". Nulo com a fidelidade ou o
 * prêmio desligados e nada dado — nenhum sinal de pontos com o programa desligado.
 */
export function situacaoDoPremio(i: IndicadaNaFicha, regra: { fidelidadeLigada: boolean; premio: PremioDeIndicacao }): string | null {
  if (!regra.fidelidadeLigada) return null
  if (i.premioEm) return `prêmio dado em ${dia(i.premioEm)}`
  if (i.estornadoEm) return `prêmio estornado em ${dia(i.estornadoEm)}: o pagamento dela foi estornado`
  if (regra.premio === 'DESLIGADO') return null
  if (i.jaPagou) return 'sem prêmio: ela já tinha pagado antes da indicação ou do prêmio ligado'
  return 'prêmio quando ela fizer o primeiro pagamento'
}

/**
 * O "Indique uma amiga" do app: só com o prêmio ligado (nulo desligado), e diz o
 * prêmio. A cliente não cadastra a amiga pelo app — só a clínica cria ficha
 * (CLAUDE.md §5): a amiga diz o nome dela na recepção.
 */
export function textoDoIndiqueUmaAmiga(regra: { premio: PremioDeIndicacao; pontos: number; recompensa: string | null }): string | null {
  if (regra.premio === 'PONTOS' && regra.pontos > 0) {
    return `Quando a sua amiga fizer o primeiro pagamento na clínica — um atendimento ou uma compra —, você ganha ${formatarPontos(regra.pontos)}.`
  }
  if (regra.premio === 'RECOMPENSA' && regra.recompensa) {
    return `Quando a sua amiga fizer o primeiro pagamento na clínica — um atendimento ou uma compra —, você ganha um voucher: ${regra.recompensa}.`
  }
  return null
}

export const COMO_INDICAR = 'É só ela dizer o seu nome na recepção, quando for se cadastrar: a clínica faz a ficha dela e liga à sua.'
