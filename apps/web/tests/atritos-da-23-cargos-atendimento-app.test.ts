import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_MENU, BRANCH_MENU, menuEntriesFor } from '@/lib/menu'
import { NO_PERMISSIONS } from '@/lib/permissions'
import type { ResolvedPermissions } from '@estetica-os/types'

/**
 * 23ª simulação (2026-11-17): menu, cargos, equipe, atendimento, agenda e app
 * da cliente.
 * - D1 [3]: o menu e o resumo do cargo mostravam Tratamentos a quem não tem a
 *   Agenda, e a página (`assertPermission(ctx, 'agenda', 'VIEW')`) barrava. A
 *   razão de antes ("quem recebe cobra o plano ali") caiu com o PDV4/PT1c/PDV7:
 *   o plano se cobra na comanda do PDV. O menu e o resumo seguem a página.
 * - A1 [3]: a linha do PDV ficava com "Sem acesso" marcado com o Financeiro em
 *   Gerenciar, que o abre. Mostra o nível que vale, travado, com o porquê.
 * - A2 [3]: o resumo do cargo diz quem inicia e conclui (revisto em 23/11:
 *   sem o "só os meus", SM1, é o Atendimento em Gerenciar, UM2).
 * - A3 [3]: o "Repassar todos" para quem atende numa unidade só confirmava
 *   "Desativar" com 4 de 5 ficando com a pessoa desativada.
 * - A21 [7]: o Planejamento mandava "Comece em Nova sessão", e quem destrava
 *   o plano é "Queixas e dores".
 * - A22 [3]: a segunda Avaliação da mesma cliente no mesmo dia nascia sem aviso.
 * - A23 [3]: "O procedimento foi realizado com sucesso?" sem resposta.
 * - A25 [7]: ao iniciar, "Aceitar plano" virava o botão grande.
 * - A26 [3]: saiu com o SM1 (23/11): não há mais "atendimento de outra pessoa".
 * - A27 [7]: a "Semana" da Minha agenda não mostrava nenhum atendimento.
 * - A35 [3]: dois "Documentos" no app — a foto ficava no do Histórico.
 * - A36 [3]: o botão do confirmar mudava de rótulo ao marcar as estrelas.
 * - A37 [7]: o cartão do plano aceito, na Início, não levava ao plano fechado.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const com = (over: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...over })

describe('D1: Tratamentos segue a página — o Atendimento em Ver (era a Agenda até 2026-11-18)', () => {
  it('quem recebe, sem a Agenda, não vê Tratamentos (nos dois portais)', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const p of [com({ cashier: 'MANAGE' }), com({ financial: 'MANAGE' }), com({ medical_records: 'MANAGE' })]) {
        expect(menuEntriesFor(menu, p).map(e => e.key)).not.toContain('planejamentos')
      }
    }
  })
  // Desde 2026-11-18 (o Heitor: "Agenda é agenda e atendimento é atendimento. Só inicia
  // e conclui atendimento quem tem gerenciar no atendimento"): o módulo Atendimento.
  it('com o Atendimento em Ver, aparece; só com a Agenda, não', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      expect(menuEntriesFor(menu, com({ agenda: 'MANAGE' })).map(e => e.key)).not.toContain('planejamentos')
      expect(menuEntriesFor(menu, com({ atendimento: 'VIEW' })).map(e => e.key)).toContain('planejamentos')
    }
  })
  it('o resumo diz que vem do Atendimento', async () => {
    const { tratamentosNoResumo } = await import('@/lib/permissions-copy')
    expect(tratamentosNoResumo({ atendimento: 'VIEW' })).toBe('Tratamentos vem do Atendimento em “Ver”: os planos de tratamento das clientes, para acompanhar.')
    expect(tratamentosNoResumo({ agenda: 'MANAGE', medical_records: 'MANAGE', cashier: 'MANAGE' })).toBeNull()
  })
})

// A1 da 23ª mudou com a regra: receber é só do PDV (PV-04 do catálogo de 24/11;
// o Heitor, 23/11, à proposta "cada passo pertence a UM módulo, e nenhuma ação
// pede dois … PDV: receber, a comanda": "concordo, pode anotar, marcar as
// questões e ajustar o codigo"). O Financeiro não abre o PDV, e o seletor do
// PDV não fica travado em "Gerenciar" por ele.
describe('A1: o PDV não é aberto pelo Financeiro, e o seletor não trava nele', () => {
  it('o nível que vale é o do próprio PDV', async () => {
    const copia = await import('@/lib/permissions-copy')
    expect('nivelDoPdvPeloFinanceiro' in copia).toBe(false)
  })
  it('a linha do PDV não passa nível travado ao seletor', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).not.toContain('nivelDoPdvPeloFinanceiro')
  })
})

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o Atendimento em Gerenciar inicia e conclui todos;
// o resumo não fala mais em "só os próprios".
describe('A2: o resumo diz quem inicia e conclui, sem "só os próprios"', () => {
  // Desde 2026-11-18 (o Heitor: "Agenda é agenda e atendimento é atendimento. Só inicia
  // e conclui atendimento quem tem gerenciar no atendimento"): o módulo Atendimento.
  it('o texto, com o Atendimento em Gerenciar', async () => {
    const { conclusaoNoResumo } = await import('@/lib/permissions-copy')
    // Com o Atendimento e o Prontuário em Gerenciar, o resumo diz (o Heitor, 25/11: "Diz \"Inicia e conclui os atendimentos.\"").
    expect(conclusaoNoResumo({ atendimento: 'MANAGE', medical_records: 'MANAGE' })).toBe('Inicia e conclui os atendimentos.')
    expect(conclusaoNoResumo({ atendimento: 'MANAGE' })).not.toContain('próprios')
    // A Agenda e o Prontuário não iniciam nem concluem.
    expect(conclusaoNoResumo({ agenda: 'MANAGE', medical_records: 'MANAGE' })).toBeNull()
  })
  it('o resumo do cargo mostra', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).toContain('conclusaoNoResumo(levels)')
    expect(f).toContain('data-resumo-conclui')
  })
})

describe('A3: o Desativar diz quantos o "Repassar todos" repassou', () => {
  it('o rótulo', async () => {
    const { rotuloDoDesativar } = await import('@/lib/equipe/textos-do-cadastro')
    expect(rotuloDoDesativar({ todosParaAlguem: true, repassados: 1, total: 5 })).toBe('Desativar e repassar 1 de 5')
    expect(rotuloDoDesativar({ todosParaAlguem: true, repassados: 5, total: 5 })).toBe('Desativar')
    // O um a um diz o mesmo (o Heitor, 27/11, R31: "O botão diz "Desativar e repassar 1 de 3" também no um a um");
    // escolhidos todos, ou nenhum, fica "Desativar".
    expect(rotuloDoDesativar({ todosParaAlguem: false, repassados: 1, total: 5 })).toBe('Desativar e repassar 1 de 5')
    expect(rotuloDoDesativar({ todosParaAlguem: false, repassados: 5, total: 5 })).toBe('Desativar')
    expect(rotuloDoDesativar({ todosParaAlguem: false, repassados: 0, total: 5 })).toBe('Desativar')
  })
  it('a janela usa', () => {
    expect(fonte('components/admin/desativar-membro.tsx')).toContain('rotuloDoDesativar(')
  })
})

describe('A21: o Planejamento diz que as dores vêm antes', () => {
  it('o texto', async () => {
    const { textoDoPlanoNaTela } = await import('@/lib/plano-de-tratamento/textos')
    expect(textoDoPlanoNaTela({ faltamAsDores: true }))
      .toBe('O plano se monta na tela do atendimento: registre as “Queixas e dores” e, no cartão “Tratamento”, use “Nova sessão” para escolher o procedimento.')
    expect(textoDoPlanoNaTela({ faltamAsDores: false }))
      .toBe('O plano se monta no cartão “Tratamento” da tela do atendimento: use “Nova sessão” para escolher o procedimento.')
  })
  it('a janela usa, e o "Ir" leva às dores quando faltam', () => {
    expect(fonte('components/branch/planejamento-tratamento.tsx')).toContain('textoDoPlanoNaTela({ faltamAsDores })')
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toContain('faltamAsDores={faltamAsDores}')
    expect(s).toMatch(/onIrAoTratamento=\{\(\) => \{[\s\S]{0,400}\[data-campo="dores"\]/)
  })
})

describe('A22: avisa a mesma cliente com o mesmo procedimento no dia', () => {
  it('o texto', async () => {
    const { textoDoMesmoProcedimentoNoDia } = await import('@/lib/appointments/mesmo-no-dia')
    expect(textoDoMesmoProcedimentoNoDia('Helena', 'Avaliação', ['10:00']))
      .toBe('Helena já tem Avaliação neste dia, às 10:00.')
    expect(textoDoMesmoProcedimentoNoDia('Helena', 'Avaliação', ['10:00', '15:30']))
      .toBe('Helena já tem Avaliação neste dia, às 10:00 e às 15:30.')
    expect(textoDoMesmoProcedimentoNoDia('Helena', 'Avaliação', [])).toBeNull()
  })
  it('o Agendar mostra', () => {
    const f = fonte('components/branch/appointment-modal.tsx')
    expect(f).toContain('avisoDoMesmoProcedimentoNoDia(')
    expect(f).toContain('data-aviso-mesmo-no-dia')
  })
})

describe('A23: o Finalizar não pergunta sem resposta', () => {
  it('o texto', () => {
    const f = fonte('components/branch/appointment-session.tsx')
    expect(f).not.toContain('O procedimento foi realizado com sucesso?')
    expect(f).toContain('Confirme que o procedimento foi feito.')
  })
})

describe('A25: o plano segue opcional durante o atendimento', () => {
  it('o "Aceitar plano" é secundário em andamento, com o título opcional', () => {
    const f = fonte('components/branch/appointment-session.tsx')
    expect(f).toMatch(/const planoDuranteOAtendimento = !isPackageSession && appointment\.status === 'IN_PROGRESS'/)
    expect(f).toMatch(/const planoSecundario = [^\n]*planoDuranteOAtendimento/)
    expect(f).toContain('data-plano-durante-o-atendimento')
  })
})

describe('A27: a Semana da Minha agenda lista os atendimentos por dia', () => {
  it('os dias com atendimento, em ordem, sem os cancelados', async () => {
    const { semanaEmLista } = await import('@/lib/agenda/minha-agenda')
    const ev = (id: string, start: string, status = 'SCHEDULED') => ({ id, start, status })
    const lista = semanaEmLista(
      [ev('b', '2026-11-17T15:00:00'), ev('a', '2026-11-17T09:00:00'), ev('c', '2026-11-19T10:00:00', 'CANCELLED'), ev('d', '2026-11-20T08:00:00')],
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
    )
    expect(lista.map(d => [d.dia, d.eventos.map(e => e.id)])).toEqual([['2026-11-17', ['a', 'b']], ['2026-11-20', ['d']]])
  })
  it('a tela usa', () => {
    const f = fonte('components/branch/professional-agenda.tsx')
    expect(f).toContain('semanaEmLista(')
    expect(f).toContain('data-semana-em-lista')
  })
})

describe('A35: um "Documentos" só no app da cliente', () => {
  it('a aba do Histórico se chama "Fotos e arquivos", e Documentos leva a ela', async () => {
    const { ROTULO_DOS_ARQUIVOS_NO_APP } = await import('@/lib/clientes/textos-do-app')
    expect(ROTULO_DOS_ARQUIVOS_NO_APP).toBe('Fotos e arquivos')
    const h = fonte('components/client-portal/historico-tabs.tsx')
    expect(h).toContain('label: ROTULO_DOS_ARQUIVOS_NO_APP')
    const d = fonte('app/[slug]/cliente/documentos/page.tsx')
    expect(d).toContain('linkDoDocumentoNoApp(slug)')
    expect(d).toContain('data-fotos-e-arquivos')
  })
})

describe('A36: o botão do confirmar tem um rótulo só', () => {
  it('o rótulo fixo, e a avaliação diz que vai junto', async () => {
    const { BOTAO_DE_CONFIRMAR_NO_APP } = await import('@/lib/clientes/textos-do-app')
    expect(BOTAO_DE_CONFIRMAR_NO_APP).toBe('Confirmar que realizei o atendimento')
    const f = fonte('components/client-portal/confirm-appointment-form.tsx')
    expect(f).toContain('BOTAO_DE_CONFIRMAR_NO_APP')
    expect(f).not.toContain('textoDoBotaoDeConfirmar(')
    expect(f).toContain('Avalie (opcional) · vai junto ao confirmar')
  })
})

describe('A37: o cartão do plano aceito leva ao plano sem abrir', () => {
  it('o "Ver o plano" fica no resumo do cartão', () => {
    const f = fonte('app/[slug]/cliente/home/page.tsx')
    expect(f).toMatch(/data-plano-fechado[\s\S]*?<summary[\s\S]*?data-ver-o-plano[\s\S]*?<\/summary>/)
  })
})
