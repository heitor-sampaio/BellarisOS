import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDeQuemRespondeAFicha } from '@/lib/equipe/textos-de-quem-pode'

/**
 * A17 da 31ª simulação (princípio 7): no "Finalizar", a ficha de saúde
 * obrigatória em branco trava quem atende sem o Prontuário em Gerenciar — a
 * trava fica (§10, "Tudo que é obrigatório barra") —, mas quem LÊ o prontuário
 * (o Prontuário em Ver) via a janela "Os campos estão marcados na página" com
 * "Responder agora", e não pode responder. A janela diz por que trava e quem
 * responde (a permissão e os nomes, como a recusa do servidor já dizia — A8 da
 * 25ª), sem o "Responder agora".
 */
const ler = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('a janela do que falta para finalizar diz quem responde a ficha de saúde', () => {
  it('o texto é o da permissão, com os nomes', () => {
    expect(textoDeQuemRespondeAFicha(['Zenilda'])).toBe(
      'Quem responde a ficha de saúde é quem tem o Prontuário em Gerenciar (Zenilda), ou a cliente, pelo app ou pelo link.')
  })

  it('a janela, a quem não escreve o clínico, diz quem responde e não oferece "Responder agora"', () => {
    const fonte = ler('components/branch/appointment-session.tsx')
    const i = fonte.indexOf('function OQueFaltaParaFinalizar')
    const janela = fonte.slice(i, fonte.indexOf('\nfunction ', i + 10))
    expect(janela).toMatch(/quemResponde/)
    expect(janela).toMatch(/textoDeQuemRespondeAFicha\(/)
    expect(janela).toMatch(/data-quem-responde-a-ficha/)
    expect(janela).toMatch(/'Entendi'|>Entendi</)
    expect(fonte).toMatch(/<OQueFaltaParaFinalizar grupos=\{oQueFalta\}[^\n]*quemResponde=\{canEditRecords \? null : quemRespondeAFicha/)
  })

  // D17 da 33ª (FI-07; o A17 da 31ª, de novo): na avaliação, a Kauane (o
  // Prontuário em Ver) chegava ao "Confirmar conclusão" sem a ficha de saúde
  // obrigatória, e só o servidor recusava — o cartão de LEITURA da ficha não
  // estava ligado ao `conferirObrigatorias`, e a tela não tinha o que conferir.
  it('o cartão da ficha de saúde em leitura também confere as obrigatórias antes do "Finalizar"', () => {
    const fonte = ler('components/branch/appointment-session.tsx')
    expect(fonte).toMatch(/\(editLocked \|\| !canEditRecords\) \? \(\s*canViewRecords && <AnamneseGeralCartao ref=\{anamneseDoCartao\} [^>]*canEdit=\{false\}/)
  })

  it('a sessão lê os nomes de quem responde só para quem vê o clínico e não o escreve', () => {
    const pagina = ler('app/_shared/sessao-de-atendimento.tsx')
    expect(pagina).toMatch(/quemRespondeAFicha=\{canViewRecords && !canEditRecords[\s\S]{0,160}quemRespondeAFichaDeSaude\(/)
  })
})
