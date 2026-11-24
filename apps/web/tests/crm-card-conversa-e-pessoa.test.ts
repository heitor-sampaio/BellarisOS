import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O card da oportunidade, o "Ir para a conversa" e os textos dos documentos.
 *
 * A16 [CLAUDE.md §14, "botão que a pessoa não pode usar: a tela esconde, e a
 * action devolve { error }"; crm-inbox.md §9.2.1, "quem só pode ver só pode
 * ver"; princípio 7]: com o CRM em Ver, o "Ir para a conversa" CRIAVA a
 * conversa (gravar pede o CRM em Gerenciar); o erro ficava no alto do corpo do
 * modal, fora da vista de quem rolou; e o modal de leitura não dizia que era
 * só leitura.
 * A17 [CLAUDE.md §1, Tags: a tag é filtro da rede; crm-inbox.md T2: "a origem
 * é a ORIGEM"; design.md, o painel "flutua por cima de tudo, inteiro na
 * tela"]: no card, a origem e a tag eram o mesmo chip — e a tag com o nome da
 * origem SUMIA; e o painel das tags, dentro do modal, era cortado.
 * A18 [crm-inbox.md §9.2.1: "A tela lê o NOME da pessoa, não a cópia"; o
 * contato é um só]: duas oportunidades do mesmo contato mostravam a cópia do
 * nome de cada uma.
 * A22 [princípio 7; crm-inbox.md: o que a EQUIPE lê é neutro]: "este cliente"
 * nos textos dos documentos.
 */

const WEB = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

/** O corpo de uma função exportada (até a próxima `export`). */
function corpoDe(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.indexOf(`export async function ${nome}(`)
  expect(i, `${nome} em ${arquivo}`).toBeGreaterThanOrEqual(0)
  const j = f.indexOf('\nexport ', i + 10)
  return f.slice(i, j < 0 ? undefined : j)
}

describe('A16: o "Ir para a conversa" de quem só vê', () => {
  it('a recusa diz o que falta, sem "lead"', async () => {
    expect(existsSync(join(WEB, 'lib/crm/conversa-da-oportunidade.ts'))).toBe(true)
    const { semConversaParaQuemSoVe, OPORTUNIDADE_SO_LEITURA } = await import('@/lib/crm/conversa-da-oportunidade')
    expect(semConversaParaQuemSoVe('Raquel')).toBe(
      'Ainda não há conversa com Raquel. Abrir uma conversa nova pede o CRM em Gerenciar.',
    )
    expect(OPORTUNIDADE_SO_LEITURA).toBe('Seu cargo só consulta as oportunidades: editar pede o CRM em Gerenciar.')
  })

  it('com o CRM em Ver, a action abre a conversa que existe, mas não CRIA (devolve { error })', () => {
    const corpo = corpoDe('actions/inbox.ts', 'openLeadConversation')
    const trava = corpo.search(/if \(!can\(ctx, 'crm', 'MANAGE'\)\)/)
    expect(trava, 'a trava do CRM em Gerenciar antes de criar').toBeGreaterThan(0)
    // Depois de procurar a que existe (a pessoa que só vê ainda a abre)…
    expect(trava).toBeGreaterThan(corpo.indexOf('passaNasCaixas'))
    // …e antes de gravar a conversa nova.
    expect(trava).toBeLessThan(corpo.indexOf('.insert('))
    expect(corpo).toMatch(/semConversaParaQuemSoVe\(/)
  })

  it('o erro aparece no cabeçalho preso do modal, onde está o botão', () => {
    const modal = fonte('components/branch/crm-lead-modal.tsx')
    const erro = modal.indexOf('data-erro-da-conversa')
    expect(erro).toBeGreaterThan(0)
    expect(modal.slice(erro - 200, erro + 200)).toMatch(/role="alert"/)
    // Dentro do bloco preso (sticky), antes do corpo do formulário.
    const preso = modal.indexOf("position: 'sticky'")
    expect(preso).toBeGreaterThan(0)
    expect(erro).toBeGreaterThan(preso)
    expect(erro).toBeLessThan(modal.indexOf('{/* Body */}'))
  })

  it('o modal de leitura diz que é só leitura, com o porquê na dica', () => {
    const modal = fonte('components/branch/crm-lead-modal.tsx')
    expect(modal).toMatch(/somenteLeitura && \(/)
    expect(modal).toMatch(/data-oportunidade-so-leitura/)
    expect(modal).toMatch(/Só leitura/)
    expect(modal).toMatch(/OPORTUNIDADE_SO_LEITURA/)
  })
})

describe('A17: a origem não é tag, e o painel das tags não corta', () => {
  it('a origem do card tem forma própria (não o chip da tag)', () => {
    const board = fonte('components/branch/crm-board.tsx')
    expect(board).not.toMatch(/<TagBadge label=\{lead\.source\}/)
    expect(board).toMatch(/data-origem-do-card/)
    expect(board).toMatch(/title=\{`Origem: \$\{lead\.source\}`\}/)
  })

  it('a tag da pessoa aparece mesmo com o nome da origem (a origem não esconde tag)', () => {
    const board = fonte('components/branch/crm-board.tsx')
    expect(board).not.toMatch(/toLowerCase\(\) !== \(lead\.source/)
  })

  it('o painel do PickerCompacto vai à camada de cima (popover), fora do corte do modal', () => {
    const picker = fonte('components/shared/picker-compacto.tsx')
    expect(picker).toMatch(/popover="manual"/)
    expect(picker).toMatch(/showPopover\(\)/)
  })
})

describe('A18: o card mostra o nome da PESSOA (o Heitor, 24/11, "1")', () => {
  it('o nome do contato vence a cópia da oportunidade; sem ele, a cópia', async () => {
    expect(existsSync(join(WEB, 'lib/crm/nome-da-pessoa.ts'))).toBe(true)
    const { nomeNoCard } = await import('@/lib/crm/nome-da-pessoa')
    expect(nomeNoCard('Betânia Correia', 'Betânia C.')).toBe('Betânia Correia')
    expect(nomeNoCard('  ', 'Betânia C.')).toBe('Betânia C.')
    expect(nomeNoCard(null, 'Betânia C.')).toBe('Betânia C.')
    expect(nomeNoCard(undefined, 'Betânia C.')).toBe('Betânia C.')
  })

  it('os dois quadros leem o nome das pessoas', () => {
    for (const p of ['app/[slug]/oportunidades/page.tsx', 'app/admin/oportunidades/page.tsx']) {
      const f = fonte(p)
      expect(f, p).toMatch(/nomesDasPessoas\(/)
      expect(f, p).toMatch(/nomeNoCard\(/)
    }
  })
})

describe('A22: os textos dos documentos não dizem "este cliente"', () => {
  it('nem a action dos documentos nem a lista da ficha', () => {
    for (const p of ['actions/documentos.ts', 'components/shared/termos-do-cliente.tsx']) {
      expect(fonte(p), p).not.toMatch(/[Ee]ste cliente|deste cliente/)
    }
  })
})
