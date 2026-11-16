import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { paginasDaBusca, paginasQueCasam } from '@/lib/busca/paginas'
import { ADMIN_MENU, BRANCH_MENU } from '@/lib/menu'
import { avisoDoPlanoFechado, textoDaSessaoJaAgendada } from '@/lib/checkout/sessoes-sem-data'
import { resumoDoCargoDeSistema, explicacaoDoCargoDeSistema } from '@/lib/cargos/de-sistema'
import { avisoDaAbaFechada } from '@/lib/clients/aba-fechada'
import { avisoDosDocumentosDaVenda } from '@/lib/documentos/aviso-da-venda'

/**
 * Os defeitos e as linhas de vocabulário da 15ª simulação (2026-11-15) que se
 * provam sem tela: o texto, a regra pura e a varredura do repositório.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('D4: nenhum caractere de controle no código', () => {
  // O 0x01 de "o crédito interno\x01não tem" (reports-bi-view.tsx) veio de uma
  // troca de texto automática; o teste da aba comercial tinha \x08 (o backspace)
  // onde era para ser \b, e não provava nada.
  const PULAR = new Set(['node_modules', '.next', 'dist', '.sim', '.turbo', 'build', 'android', 'test-results', 'playwright-report'])
  const EXTENSOES = /\.(ts|tsx|mjs|sql)$/
  // Controle C0 menos o tab, o LF e o CR — e o DEL.
  const CONTROLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/

  function arquivos(dir: string, saida: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      if (PULAR.has(nome)) continue
      const caminho = join(dir, nome)
      const st = statSync(caminho)
      if (st.isDirectory()) arquivos(caminho, saida)
      else if (EXTENSOES.test(nome)) saida.push(caminho)
    }
    return saida
  }

  it('nem em .ts, .tsx, .mjs nem .sql', () => {
    const achados: string[] = []
    for (const pasta of ['apps', 'packages', 'supabase']) {
      for (const arq of arquivos(join(RAIZ, pasta))) {
        const linhas = readFileSync(arq, 'utf8').split('\n')
        linhas.forEach((l, i) => { if (CONTROLE.test(l)) achados.push(`${relative(RAIZ, arq)}:${i + 1}`) })
      }
    }
    expect(achados).toEqual([])
  })
})

describe('D8: toda entrada do menu lateral tem ícone', () => {
  function chavesDoIcone(arquivo: string): Set<string> {
    const texto = ler(arquivo)
    const bloco = texto.slice(texto.indexOf('const ICONS'), texto.indexOf('\n}', texto.indexOf('const ICONS')))
    return new Set([...bloco.matchAll(/^\s*(\w+)\s*:\s*</gm)].map(m => m[1]!))
  }

  it('no portal da rede', () => {
    const icones = chavesDoIcone('components/admin/sidebar.tsx')
    expect(ADMIN_MENU.map(e => e.key).filter(k => !icones.has(k))).toEqual([])
  })
  it('no portal da unidade', () => {
    const icones = chavesDoIcone('components/branch/sidebar.tsx')
    expect(BRANCH_MENU.map(e => e.key).filter(k => !icones.has(k))).toEqual([])
  })
})

describe('D9 e o subtítulo "Clínica": a busca de Configurações', () => {
  const rede = paginasDaBusca(null, ALL_PERMISSIONS)

  it('"ficha de saúde" acha Configurações → Fichas', () => {
    expect(paginasQueCasam(rede, 'ficha de saúde').map(r => r.id)).toContain('settings:fichas')
    expect(paginasQueCasam(rede, 'fichas de saúde').map(r => r.id)).toContain('settings:fichas')
  })

  it('"clínica" e "filiais" ainda acham a tela, mas a palavra não vai ao subtítulo', () => {
    const geral = paginasQueCasam(rede, 'clínica').find(r => r.id === 'settings:general')
    expect(geral).toBeTruthy()
    expect(geral!.subtitulo ?? '').not.toMatch(/cl[íi]nica/i)
    const unidades = paginasQueCasam(rede, 'filiais').find(r => r.id === 'settings:unidades')
    expect(unidades).toBeTruthy()
    expect(unidades!.subtitulo ?? '').not.toMatch(/filia/i)
  })
})

describe('D6: o cargo "Não definido" não diz "Acesso total à rede"', () => {
  it('o resumo e a explicação de cada cargo de sistema', () => {
    expect(resumoDoCargoDeSistema('NAO_DEFINIDO')).toBe('Sem acesso: é o cargo de quem ainda não tem um')
    expect(resumoDoCargoDeSistema('NETWORK_ADMIN')).toBe('Acesso total à rede')
    expect(explicacaoDoCargoDeSistema('NAO_DEFINIDO')).toMatch(/não abre nenhum módulo/i)
    expect(explicacaoDoCargoDeSistema('NAO_DEFINIDO')).not.toMatch(/acesso a tudo/i)
    expect(explicacaoDoCargoDeSistema('NETWORK_ADMIN')).toMatch(/acesso a tudo na rede/i)
  })
  it('a tela de Cargos usa o resumo, e não o texto fixo', () => {
    const tela = ler('components/admin/roles-editor.tsx')
    expect(tela).not.toContain('<Fala>Acesso total à rede</Fala>')
    expect(tela).toContain('resumoDoCargoDeSistema(')
    expect(tela).toContain('explicacaoDoCargoDeSistema(')
  })
})

describe('D3: o plano fechado conta as sessões já agendadas', () => {
  it('a sessão 1 agendada antes do checkout não vira "Nenhuma agendada ainda"', () => {
    expect(avisoDoPlanoFechado(5, [2, 3, 4, 5], 1))
      .toBe('Plano fechado: 5 sessões. 1 já agendada, 4 sem data — agende pela ficha quando a cliente marcar.')
    expect(avisoDoPlanoFechado(3, [], 2)).toBe('Plano fechado: 3 sessões. Todas com data.')
    expect(avisoDoPlanoFechado(3, [2, 3], 0)).toBe('Plano fechado: 3 sessões. 2 sem data — agende pela ficha quando a cliente marcar.')
    expect(avisoDoPlanoFechado(2, [1, 2], 0)).toBe('Plano fechado: 2 sessões. Nenhuma agendada ainda — agende pela ficha quando a cliente marcar.')
  })
  it('a sessão já agendada se diz com a data, no fuso da unidade', () => {
    expect(textoDaSessaoJaAgendada('2026-11-16T17:00:00.000Z', 'America/Sao_Paulo')).toBe('já agendada: 16/11 às 14:00')
    expect(textoDaSessaoJaAgendada('2026-11-16T17:00:00.000Z', 'America/Manaus')).toBe('já agendada: 16/11 às 13:00')
  })
})

describe('D1: o aviso dos documentos da venda do pacote', () => {
  const contrato = { id: 'x', titulo: 'Contrato do pacote', status: 'INCOMPLETO', faltando: ['Endereço do cliente', 'Cidade'] }

  it('diz o que falta no cadastro', () => {
    expect(avisoDosDocumentosDaVenda([contrato], null)).toContain('Falta no cadastro: Endereço do cliente, Cidade.')
  })
  it('a quem vê os Documentos, diz onde estão; a quem não vê, diz quem tem', () => {
    expect(avisoDosDocumentosDaVenda([contrato], null)).toContain('Estão na ficha, em Documentos.')
    const semDocs = avisoDosDocumentosDaVenda([contrato], ['Marina Íris'])
    expect(semDocs).not.toContain('Estão na ficha, em Documentos.')
    // D4 da 19ª: quem COLHE é quem tem os Documentos em Gerenciar.
    expect(semDocs).toContain('quem tem os Documentos em Gerenciar: Marina Íris')
  })
  it('o documento pronto não fala de cadastro', () => {
    const pronto = { ...contrato, status: 'PENDENTE', faltando: [] }
    expect(avisoDosDocumentosDaVenda([pronto], null)).toBe('Ficou 1 documento para a cliente assinar: Contrato do pacote. Estão na ficha, em Documentos.')
  })
  it('a venda usa o aviso novo', () => {
    expect(ler('components/shared/vender-pacote.tsx')).toContain('avisoDosDocumentosDaVenda(')
  })
})

describe('D5: o plano proposto não é "enviado ao PDV"', () => {
  it('o editor do plano diz "proposto" ao propor', () => {
    const editor = ler('components/branch/treatment-plan-editor.tsx')
    expect(editor).not.toMatch(/Plano enviado ao PDV|Enviar ao PDV/)
  })
})

describe('Vocabulário da 15ª', () => {
  it('Fidelidade: a venda de produto (saiu da ficha, PDV7)', () => {
    expect(ler('components/admin/fidelidade-config.tsx')).not.toMatch(/produto vendido na ficha/i)
  })

  it('o "sem acesso" genérico não põe a culpa no cargo (pode ser a unidade ou o plano)', () => {
    expect(ler('components/shared/tela-de-erro.tsx')).not.toMatch(/Seu cargo não libera/)
    expect(ler('lib/erro-na-tela.ts')).not.toMatch(/Seu cargo não libera/)
    expect(readFileSync(join(RAIZ, 'packages/nucleo/src/lib/db.ts'), 'utf8')).not.toMatch(/Seu cargo não libera/)
  })

  it('a aba Prontuário fechada pelo "só os próprios" diz o motivo', () => {
    const prontuario = { key: 'fichas', label: 'Prontuário' }
    expect(avisoDaAbaFechada(prontuario, true)).toMatch(/só os próprios/)
    expect(avisoDaAbaFechada(prontuario, true)).not.toMatch(/cargo/i)
    expect(avisoDaAbaFechada(prontuario, false)).toBe('Suas permissões não abrem a aba Prontuário desta ficha: abrimos a Visão geral.')
    expect(avisoDaAbaFechada({ key: 'financeiro', label: 'Financeiro' }, true)).toBe('Suas permissões não abrem a aba Financeiro desta ficha: abrimos a Visão geral.')
    expect(ler('components/branch/client-profile.tsx')).not.toMatch(/Seu cargo não abre a aba/)
  })
})
