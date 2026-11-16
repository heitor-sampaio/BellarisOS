import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NODES } from '@estetica-os/types'

/**
 * Os atritos da 17ª simulação (2026-11-15) de agenda, automações, CRM,
 * importação, cadastros e vocabulário que se provam sem tela: o texto, a regra
 * pura e o que a tela passa a mostrar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

// ─── Agenda, atendimento e app da cliente ───────────────────────────────────

describe('A6: a ficha pendente diz que já foi ao app ao agendar', () => {
  it('a situação lê o aviso que saiu à cliente', () => {
    const f = ler('actions/pre-atendimento.ts')
    expect(f).toContain('noAppEm')
    expect(f).toMatch(/client_notifications[\s\S]{0,200}'pre_atendimento'/)
  })
  it('a janela diz quando foi ao app', () => {
    const f = ler('components/branch/pre-atendimento-do-agendamento.tsx')
    expect(f).toContain('situacao.noAppEm')
    expect(f).toContain('Mandada ao app da cliente ao agendar')
  })
})

describe('A7: o insumo diz quanto é da embalagem', () => {
  it('a parte da embalagem', async () => {
    const { parteDaEmbalagem } = await import('@/lib/estoque/unidade-de-consumo')
    const toxina = { unit: 'frasco', consumption_unit: 'U', units_per_package: 100 }
    expect(parteDaEmbalagem(toxina, 1)).toBe('1/100 do frasco')
    expect(parteDaEmbalagem(toxina, 20)).toBe('1/5 do frasco')
    expect(parteDaEmbalagem(toxina, 30)).toBe('3/10 do frasco')
    expect(parteDaEmbalagem(toxina, 2.5)).toBe('1/40 do frasco')
    expect(parteDaEmbalagem(toxina, 100)).toBe('1 frasco')
    expect(parteDaEmbalagem(toxina, 200)).toBe('2 frascos')
    expect(parteDaEmbalagem({ unit: 'seringa', consumption_unit: 'ml', units_per_package: 1 }, 0.5)).toBe('1/2 da seringa')
    expect(parteDaEmbalagem({ unit: 'un', consumption_unit: 'ml', units_per_package: 3 }, 0.7)).toBe('23,3% da embalagem')
    expect(parteDaEmbalagem({ unit: 'frasco', consumption_unit: null, units_per_package: null }, 1)).toBeNull()
    expect(parteDaEmbalagem(toxina, 0)).toBeNull()
    expect(parteDaEmbalagem(toxina, null)).toBeNull()
  })
  it('a linha do insumo mostra', () => {
    expect(ler('components/admin/procedure-form.tsx')).toMatch(/parteDaEmbalagem\(prod, ins\.quantity\)/)
  })
})

describe('A8: a foto enviada é "Foto" no app e entra no histórico do atendimento', () => {
  it('o app chama a foto clínica de Foto', () => {
    expect(ler('components/client-portal/historico-tabs.tsx')).toMatch(/foto_clinica:\s*'Foto'/)
  })
  it('enviar à cliente fica no histórico', async () => {
    expect(ler('actions/client-documents.ts')).toMatch(/'FOTO_ENVIADA'/)
    const { rotuloDaAcao } = await import('@/lib/clients/historico-do-agendamento')
    expect(rotuloDaAcao('FOTO_ENVIADA', null)).toBe('Foto enviada à cliente')
    expect(rotuloDaAcao('FOTO_TIRADA_DO_APP', null)).toBe('Foto tirada do app da cliente')
  })
})

describe('A9: o "Confirmar e avaliar" diz a hora da conclusão', () => {
  it('a página lê a conclusão e o formulário mostra ela', () => {
    expect(ler('app/[slug]/cliente/atendimentos/[id]/confirmar/page.tsx')).toMatch(/concluidoEm=\{/)
    // A15 da 18ª: a hora da conclusão continua, agora com a marcada ao lado quando diferem (textoDoQuandoNoConfirmar).
    expect(ler('components/client-portal/confirm-appointment-form.tsx')).toMatch(/textoDoQuandoNoConfirmar\(\{ agendadoEm: scheduledAt, concluidoEm/)
  })
})

// ─── Automações ─────────────────────────────────────────────────────────────

describe('A10: o modelo em aviso no celular não manda responder', () => {
  it('nenhuma mensagem do modelo sem WhatsApp pede resposta', async () => {
    const { MODELOS_DE_AUTOMACAO, semWhatsapp } = await import('@/lib/automacoes/modelos')
    for (const m of MODELOS_DE_AUTOMACAO) {
      for (const no of semWhatsapp(m.grafo()).nos.filter(n => n.tipo === NODES.ACAO_MENSAGEM)) {
        expect((no.config as { texto?: string }).texto ?? '', m.chave).not.toMatch(/responder/i)
      }
    }
  })
  it('com WhatsApp, o texto segue pedindo a resposta (é a conversa)', async () => {
    const { modeloDeAutomacao } = await import('@/lib/automacoes/modelos')
    const msg = modeloDeAutomacao('lembrete-antes-do-agendamento')?.grafo().nos.find(n => n.tipo === NODES.ACAO_MENSAGEM)
    expect((msg?.config as { texto?: string } | undefined)?.texto).toMatch(/responder esta mensagem/)
  })
  it('a frase sai sem deixar o texto quebrado', async () => {
    const { semPedirResposta } = await import('@/lib/automacoes/modelos')
    expect(semPedirResposta('Oi! Que tal agendar? É só responder esta mensagem.')).toBe('Oi! Que tal agendar?')
    expect(semPedirResposta('Lembrete de amanhã. Se precisar remarcar, é só responder esta mensagem.')).toBe('Lembrete de amanhã.')
    expect(semPedirResposta('Texto da rede.')).toBe('Texto da rede.')
  })
  it('o "Mandar como aviso no celular" do passo também tira a frase', () => {
    expect(ler('components/admin/automacoes/painel-do-no.tsx')).toMatch(/canal: 'push', texto: semPedirResposta\(/)
  })
})

// ─── Oportunidades (CRM) ────────────────────────────────────────────────────

describe('A11: apagar a última etapa de perda avisa antes', () => {
  it('a etapa que deixa o funil sem perda', async () => {
    const { ehAUltimaDePerda } = await import('@/lib/crm')
    const etapas = [
      { id: 'a', funnel_id: 'f', name: 'Novo', color: '#000', position: 0, outcome: 'OPEN' as const },
      { id: 'b', funnel_id: 'f', name: 'Perdido', color: '#000', position: 1, outcome: 'LOST' as const },
      { id: 'c', funnel_id: 'g', name: 'Perdido', color: '#000', position: 0, outcome: 'LOST' as const },
    ]
    expect(ehAUltimaDePerda(etapas, 'b')).toBe(true)
    expect(ehAUltimaDePerda(etapas, 'a')).toBe(false)
    expect(ehAUltimaDePerda([...etapas, { ...etapas[1]!, id: 'd' }], 'b')).toBe(false)
  })
  it('a linha pergunta antes de apagar', () => {
    const f = ler('components/branch/crm-stage-settings.tsx')
    expect(f).toContain('Este funil fica sem etapa de perda')
    expect(f).toContain('Excluir mesmo assim')
  })
})

describe('A12: clicar no nome do funil o seleciona', () => {
  it('o campo do nome seleciona ao focar, e o clique não para no campo', () => {
    const f = ler('components/branch/crm-stage-settings.tsx')
    const inicio = f.indexOf('aria-label={`Nome do funil')
    const campo = f.slice(inicio, f.indexOf('/>', inicio))
    expect(campo).toContain('onFocus={onSelect}')
    expect(campo).not.toContain('stopPropagation')
  })
})

// ─── Clientes e importação ──────────────────────────────────────────────────

describe('A14: o botão de importar diz quantos entram', () => {
  it('o texto do botão', async () => {
    const { textoDoBotaoDeImportar } = await import('@/lib/importacao/o-que-entra')
    expect(textoDoBotaoDeImportar({ destino: 'contatos', prontas: 10, juntamNaPlanilha: 0, completam: 0 })).toBe('Importar 10 linhas')
    expect(textoDoBotaoDeImportar({ destino: 'contatos', prontas: 10, juntamNaPlanilha: 1, completam: 0 }))
      .toBe('Importar 10 linhas: 9 contatos novos, 1 linha junta com outra')
    expect(textoDoBotaoDeImportar({ destino: 'clientes', prontas: 4, juntamNaPlanilha: 0, completam: 1 }))
      .toBe('Importar 4 linhas: 3 fichas novas, 1 completa quem já existe')
    expect(textoDoBotaoDeImportar({ destino: 'contatos', prontas: 2, juntamNaPlanilha: 1, completam: 1 }))
      .toBe('Importar 2 linhas: nenhum contato novo, 1 completa quem já existe, 1 linha junta com outra')
  })
  it('as linhas que juntam com outra linha da planilha', async () => {
    const { linhasQueJuntamNaPlanilha } = await import('@/lib/importacao/o-que-entra')
    const l = (numero: number, phone?: string, extra: object = {}) => ({ numero, dados: { name: `L${numero}`, phone }, erros: [] as string[], ...extra })
    // Contatos: o mesmo telefone de uma linha anterior junta, a não ser que a linha cruze com alguém que já existe.
    expect(linhasQueJuntamNaPlanilha('contatos', [l(2, '5511'), l(3, '5511'), l(4, '5522'), l(5)], new Set(), new Set())).toEqual([3])
    expect(linhasQueJuntamNaPlanilha('contatos', [l(2, '5511'), l(3, '5511')], new Set([3]), new Set())).toEqual([])
    // Clientes: a linha com o mesmo telefone junta, se não foi desmarcada.
    const comMesmo = l(3, '5511', { mesmoTelefone: { numero: 2, nome: 'L2' } })
    expect(linhasQueJuntamNaPlanilha('clientes', [l(2, '5511'), comMesmo], new Set(), new Set())).toEqual([3])
    expect(linhasQueJuntamNaPlanilha('clientes', [l(2, '5511'), comMesmo], new Set(), new Set([3]))).toEqual([])
  })
  it('a tela usa o texto', () => {
    expect(ler('components/branch/importador-de-contatos.tsx')).toContain('textoDoBotaoDeImportar(')
  })
})

describe('A15: o "Sim, é a mesma pessoa" diz que o contato passa a ter o nome da ficha', () => {
  it('o texto', async () => {
    const { textoDoSimDaPessoa } = await import('@/lib/clients/textos-do-cadastro')
    expect(textoDoSimDaPessoa({ contato: 'Camila Duarte', nome: 'Marta Seixas', email: 'marta@x.com' }))
      .toBe('O contato Camila Duarte passa a se chamar Marta Seixas, com o e-mail marta@x.com.')
    expect(textoDoSimDaPessoa({ contato: 'Camila Duarte', nome: 'Marta Seixas', email: '' }))
      .toBe('O contato Camila Duarte passa a se chamar Marta Seixas.')
    expect(textoDoSimDaPessoa({ contato: 'Marta Seixas', nome: ' marta seixas ', email: 'marta@x.com' }))
      .toBe('O contato Marta Seixas passa a ter o e-mail marta@x.com.')
    expect(textoDoSimDaPessoa({ contato: 'Marta Seixas', nome: 'Marta Seixas', email: '' })).toBeNull()
  })
  it('a tela diz, e o e-mail da ficha vai ao contato', () => {
    expect(ler('components/branch/client-form.tsx')).toContain('textoDoSimDaPessoa(')
    expect(ler('lib/clients/pessoa-do-crm.ts')).toMatch(/update\(\{ name: nomeDaFicha\.trim\(\), \.\.\.\(emailDaFicha/)
  })
})

// ─── Montar a rede ──────────────────────────────────────────────────────────

describe('A16: criar o termo ou o produto abre em outra aba, e a lista volta atualizada', () => {
  it('o produto no Estoque abre em outra aba', () => {
    const f = ler('components/admin/procedure-form.tsx')
    expect(f).toMatch(/href=\{rotaNoPortal\(pathname, null, '\/estoque'\)\} target="_blank"/)
    expect(f).toContain('o que você preencheu aqui continua')
    expect(f).toContain("addEventListener('visibilitychange'")
  })
})

describe('A17: o cargo salvo confirma, e o resumo diz o Copilot', () => {
  it('o Copilot no resumo', async () => {
    const { copilotNoResumo } = await import('@/lib/permissions-copy')
    expect(copilotNoResumo('NONE')).toBeNull()
    expect(copilotNoResumo('VIEW')).toBe('E o Copilot (o botão no canto da tela), para consultar.')
    expect(copilotNoResumo('MANAGE')).toBe('E o Copilot (o botão no canto da tela), para consultar e pedir gravações.')
  })
  it('o resumo e o aviso de salvo', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toContain('copilotNoResumo(levels.copilot)')
    expect(f).toMatch(/toast\.success\(`Cargo “\$\{role\.label\}” salvo\.`\)/)
  })
})

describe('A18: o cadastro de quem atende diz que o cargo não mostra as comissões', () => {
  it('o texto', async () => {
    const { SEM_MINHAS_COMISSOES_NO_CADASTRO } = await import('@/lib/permissions-copy')
    expect(SEM_MINHAS_COMISSOES_NO_CADASTRO).toContain('a pessoa não verá as próprias comissões')
  })
  it('as duas telas de cadastro', () => {
    for (const f of ['components/admin/team-form.tsx', 'components/branch/team-form.tsx']) {
      expect(ler(f)).toMatch(/naoVeAsComissoes[\s\S]{0,400}SEM_MINHAS_COMISSOES_NO_CADASTRO/)
    }
    expect(ler('app/admin/team/page.tsx')).toContain('naoVeAsComissoes')
    expect(ler('app/[slug]/team/page.tsx')).toContain('naoVeAsComissoes')
  })
})

describe('A19: o card da unidade sem cidade avisa', () => {
  it('o texto', () => {
    expect(ler('components/admin/settings-branches.tsx')).toContain('Sem cidade: complete o endereço.')
  })
})

describe('A20: a Equipe diz a unidade principal', () => {
  it('a principal é a primeira marcada que a tela mostra', async () => {
    const { principalDasMarcadas } = await import('@/lib/unidades/do-membro')
    expect(principalDasMarcadas(['b', 'a'], ['a', 'b'])).toBe('b')
    expect(principalDasMarcadas(['x', 'a'], ['a', 'b'])).toBe('a')
    expect(principalDasMarcadas([], ['a'])).toBeNull()
    // Na edição, a principal de antes fica enquanto estiver marcada (unidadesQueGrava).
    expect(principalDasMarcadas(['a', 'b'], ['a', 'b'], 'b')).toBe('b')
    expect(principalDasMarcadas(['a'], ['a', 'b'], 'b')).toBe('a')
  })
  it('a tela mostra com mais de uma marcada', () => {
    expect(ler('components/shared/unidades-do-membro.tsx')).toMatch(/marcadas\.length > 1[\s\S]{0,300}Principal:/)
  })
})

describe('A21: desativar quem não atende não fala da agenda', () => {
  it('"sai da agenda" só para quem atende', () => {
    const f = ler('components/admin/desativar-membro.tsx')
    expect(f).toMatch(/atende \? ', e sai da agenda' : ''/)
    expect(ler('app/admin/team/page.tsx')).toMatch(/<DesativarMembro[^>]*atende=/)
    expect(ler('app/[slug]/team/page.tsx')).toMatch(/<DesativarMembro[^>]*atende=/)
  })
})

// ─── Vocabulário ────────────────────────────────────────────────────────────

describe('A29, A30 e o gênero da tela de comissões', () => {
  it('A29: a permissão, não o cargo', () => {
    const f = ler('components/admin/settings-comissoes.tsx')
    expect(f).not.toContain('O financeiro fecha')
    expect(f).toContain('Quem tem o Financeiro em Gerenciar fecha e paga as comissões uma vez por mês.')
  })
  it('a tela de comissões fala "a cliente" sempre', () => {
    const f = ler('components/admin/settings-comissoes.tsx')
    expect(f).not.toMatch(/\bo cliente\b/i)
    expect(f).not.toContain('O profissional divide')
  })
  it('A30: quem atende não é um cargo no feminino', () => {
    expect(ler('components/client-portal/new-appointment-wizard.tsx')).not.toContain('todas as profissionais')
    expect(ler('components/admin/procedure-form.tsx')).not.toContain('todas as profissionais')
  })
})
