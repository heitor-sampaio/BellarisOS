import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * "A profissional" nos textos da TELA vira neutro (a revisão de 24/11; a
 * regra do que a equipe diz em `docs/regras/crm-inbox.md`: o texto é
 * neutro). O que a tela diz fala em "quem atende" / "a pessoa", nunca no
 * feminino de um cargo. Comentário e título de teste ficam como estão.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

const SAEM: Array<[string, string]> = [
  ['components/admin/pacotes-catalogo.tsx', 'para a profissional responsável'],
  ['lib/comissoes/config.ts', 'para a profissional responsável'],
  ['components/admin/settings-geral.tsx', 'vale para a profissional'],
  ['components/branch/agenda-calendar.tsx', 'Trocar a profissional'],
  ['components/branch/agenda-calendar.tsx', "'outra profissional'"],
  ['components/branch/janela-do-agendamento-acoes.tsx', 'Trocar a profissional'],
  ['components/branch/appointment-modal.tsx', "'a profissional'"],
  ['components/branch/appointment-modal.tsx', "'A profissional'"],
  ['components/client-portal/alterar-agendamento.tsx', 'Sobre a escolha da profissional'],
  ['components/client-portal/alterar-agendamento.tsx', 'pode ser outra profissional'],
  ['components/shared/bloqueio-da-agenda.tsx', 'Escolha a profissional'],
  ['components/shared/cancelar-pacote.tsx', 'a profissional são avisadas'],
  ['components/shared/grade-de-horarios.tsx', "'a profissional'"],
  ['components/shared/grade-de-horarios.tsx', 'fora do horário dela'],
  ['components/shared/vender-pacote.tsx', 'Sobre o profissional responsável'],
  ['lib/appointments/encaixe.ts', "'A profissional'"],
  ['lib/documentos/variaveis.ts', 'conselho da profissional'],
  ['lib/documentos/variaveis.ts', 'cadastro da profissional'],
  ['actions/agenda-bloqueios.ts', 'Escolha a profissional'],
  ['actions/appointments.ts', 'Escolha a unidade e a profissional'],
  ['actions/treatment-plans.ts', 'observações da profissional antes'],
  ['actions/pacotes.ts', "papel: 'A profissional responsável'"],
  ['actions/team.ts', "|| 'A profissional'"],
]

describe('os textos da tela não falam em "a profissional"', () => {
  for (const [arquivo, frase] of SAEM) {
    it(`${arquivo}: sem "${frase}"`, () => {
      expect(fonte(arquivo)).not.toContain(frase)
    })
  }

  it('o rótulo da comissão do pacote diz "a pessoa responsável"', async () => {
    const { rotuloDaComissaoDoPacote } = await import('@/lib/comissoes/config')
    expect(rotuloDaComissaoDoPacote({ venda: null, execucao: { tipo: 'PACOTE', valorTipo: 'PERCENTAGE', valor: 10 } } as never))
      .toContain('do pacote, para a pessoa responsável')
  })

  it('a troca de quem atende pergunta "Trocar quem atende de X para Y"', () => {
    expect(fonte('components/branch/janela-do-agendamento-acoes.tsx')).toContain('Trocar quem atende de {atual} para {nova.name}?')
    expect(fonte('components/branch/agenda-calendar.tsx')).toContain('Trocar quem atende de {arraste.de} para {arraste.para}')
  })

  it('a variável do registro no conselho diz "de quem atende"', async () => {
    const { VARIAVEIS_DE_DOCUMENTO } = await import('@/lib/documentos/variaveis')
    const v = (VARIAVEIS_DE_DOCUMENTO as Record<string, { rotulo: string }>)['profissional.registro']
    expect(v?.rotulo).toBe('Registro no conselho de quem atende (CRM, COREN…)')
  })
})
