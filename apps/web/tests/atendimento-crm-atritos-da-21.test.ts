import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A12, A14, A15 e A32 da 21ª simulação (2026-11-17): o atendimento, a agenda e o CRM.
 *
 * A12 [3]: quem atende sem o Prontuário em Gerenciar iniciava e só depois via,
 * num texto cinza pequeno, que não ia concluir. O aviso trava o fim do
 * atendimento: fica à vista, ANTES do "Marcar chegada e iniciar".
 * A14 [3, 7]: "Guardado só nesta aba…" não dizia o que se perde; e o
 * Planejamento mandava montar o plano "em Tratamento" sem levar até lá.
 * A15 [7]: a base da ocupação ia na linha da agenda com parênteses aninhados —
 * o detalhe vai para a dica.
 * A32 [3]: excluir a etapa com oportunidades perguntava "Excluir?" e só depois
 * recusava com "oportunidade(s)". A pergunta já diz quantas e o que fazer.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('A12: quem não conclui lê isso à vista, antes de iniciar', () => {
  // O botão era "Marcar chegada e iniciar"; o nome é "Check-in" (o Heitor, 27/11: "Fica "Check-in"" — "Fica Check-in em todos os lugares").
  const botoes: [string, string][] = [
    ['components/branch/appointment-session.tsx', `'Iniciando…' : 'Check-in e iniciar'`],
    ['components/branch/appointment-sheet.tsx', '<Play size={14} /> Check-in e iniciar'],
  ]
  for (const [arquivo, botao] of botoes) {
    it(`${arquivo}: o aviso vem antes do "Check-in e iniciar", com cara de aviso`, () => {
      const f = fonte(arquivo)
      const aviso = f.indexOf('data-quem-conclui')
      expect(aviso).toBeGreaterThan(-1)
      expect(f.indexOf(botao)).toBeGreaterThan(-1)
      expect(aviso).toBeLessThan(f.indexOf(botao))
      const bloco = f.slice(aviso, aviso + 900)
      expect(bloco).toContain('var(--warning-soft)')
      expect(bloco).toContain('Você não inicia nem conclui este atendimento.')
      expect(bloco).toContain('textoDeQuemConclui(')
    })
  }
})

describe('A14: o rascunho diz o que se perde, e o Planejamento leva ao Tratamento', () => {
  it('o aviso do rascunho diz que fechar a aba perde o digitado', () => {
    const f = fonte('components/branch/appointment-session.tsx')
    expect(f).not.toContain('Guardado só nesta aba')
    expect(f).toContain('Fica só nesta aba: fechar a aba antes do “Finalizar atendimento” perde o que foi digitado.')
  })
  it('o Planejamento tem o "Ir ao Tratamento", que fecha a janela e leva ao cartão', () => {
    const plano = fonte('components/branch/planejamento-tratamento.tsx')
    expect(plano).not.toContain('Monte o plano desta avaliação na própria tela, em Tratamento.')
    // A21 da 23ª: o texto mora em textoDoPlanoNaTela, sem "desta avaliação" (A21 da 22ª).
    expect(plano).toContain('textoDoPlanoNaTela({ faltamAsDores })')
    expect(fonte('lib/plano-de-tratamento/textos.ts')).toContain('O plano se monta no cartão “Tratamento” da tela do atendimento')
    expect(plano).toContain('Ir ao Tratamento')
    expect(plano).toContain('onIrAoTratamento')
    expect(fonte('components/branch/painel-planejamento.tsx')).toContain('onIrAoTratamento={onIrAoTratamento}')
    const sessao = fonte('components/branch/appointment-session.tsx')
    expect(sessao).toMatch(/onIrAoTratamento=\{/)
    expect(sessao).toContain('[data-editor-do-tratamento]')
    expect(fonte('components/branch/treatment-plan-editor.tsx')).toContain('data-editor-do-tratamento')
  })
})

describe('A15: a base da ocupação da agenda mora na dica', () => {
  it('a linha diz só a porcentagem; a conta vai na dica', () => {
    const f = fonte('components/branch/agenda-calendar.tsx')
    expect(f).not.toContain('({baseDaOcupacaoDaTela})')
    const dica = f.indexOf('<Dica rotulo={DEFINICOES.ocupacao.rotulo}')
    expect(dica).toBeGreaterThan(-1)
    expect(f.indexOf('data-base-da-ocupacao')).toBeGreaterThan(dica)
  })
})

describe('A32: excluir a etapa com oportunidades diz quantas e o que fazer, antes', () => {
  it('a pergunta com oportunidades', async () => {
    const { perguntaAoExcluirEtapa } = await import('@/lib/crm')
    expect(perguntaAoExcluirEtapa('Novo', false, 2)).toBe('A etapa “Novo” tem 2 oportunidades. Mova-as para outra etapa no quadro antes de excluir.')
    expect(perguntaAoExcluirEtapa('Novo', true, 1)).toBe('A etapa “Novo” tem 1 oportunidade. Mova-a para outra etapa no quadro antes de excluir.')
    expect(perguntaAoExcluirEtapa('Novo', false, 0)).toBe('Excluir a etapa “Novo”? Não dá para desfazer.')
  })
  it('o funil com oportunidades, sem o "(s)"', async () => {
    const { recusaDoFunilComOportunidades } = await import('@/lib/crm')
    expect(recusaDoFunilComOportunidades(1)).toBe('Este funil tem 1 oportunidade. Mova-a para outro funil ou arquive este.')
    expect(recusaDoFunilComOportunidades(3)).toBe('Este funil tem 3 oportunidades. Mova-as para outro funil ou arquive este.')
  })
  it('nenhuma recusa diz "oportunidade(s)"', () => {
    expect(fonte('actions/crm-stages.ts')).not.toContain('oportunidade(s)')
    expect(fonte('actions/crm-funnels.ts')).not.toContain('oportunidade(s)')
  })
  it('a linha conta as oportunidades antes de perguntar, e sem "Excluir" quando há', () => {
    expect(fonte('actions/crm-stages.ts')).toMatch(/export async function oportunidadesNaEtapa\(/)
    const f = fonte('components/branch/crm-stage-settings.tsx')
    const excluir = f.slice(f.indexOf('async function handleDelete'), f.indexOf('return (', f.indexOf('async function handleDelete')))
    expect(excluir).toContain('oportunidadesNaEtapa(')
    expect(f).toMatch(/perguntaAoExcluirEtapa\([^)]*oportunidades/)
    expect(f).toMatch(/oportunidades\s*>\s*0/)
  })
})
