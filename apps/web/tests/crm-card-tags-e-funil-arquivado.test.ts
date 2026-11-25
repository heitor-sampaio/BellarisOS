import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O card da oportunidade e a configuração dos funis.
 *
 * D12 [CLAUDE.md §11, 18/11: o WhatsApp é configuração só da Admin da rede]:
 * "Ir para a conversa" sem WhatsApp mandava pedir "a quem tem as
 * Configurações em Gerenciar" — o inbox já dizia "Peça à Admin da rede".
 * A1 [crm-inbox:TG-10, as tags se juntam; princípio 3]: no "Cadastrar como
 * cliente" do card, os chips de tag vinham desmarcados, e a ficha nascia com
 * as tags do card.
 * A2 [CLAUDE.md §14: a tela esconde o que a pessoa não pode usar]: com o CRM
 * em Ver, o card mostrava "Editar tags" e o "x" de remover tag, desligados.
 * A3 [Decisão do Claude 4 da 30ª simulação; OP-15 por analogia; princípio 7]:
 * arquivar um funil com oportunidades não perguntava, e elas sumiam do quadro
 * e dos relatórios em silêncio.
 */

const WEB = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('D12: sem WhatsApp, quem conecta é a Admin da rede', () => {
  it('o texto diz a Admin da rede a quem não configura, e o caminho a quem configura', async () => {
    const { semWhatsappParaConversar } = await import('@/lib/crm/conversa-da-oportunidade')
    const aOutros = semWhatsappParaConversar('Kauany', false)
    expect(aOutros).toContain('Peça à Admin da rede para conectar o WhatsApp')
    expect(aOutros).not.toContain('Configurações em Gerenciar')
    expect(semWhatsappParaConversar('Kauany', true)).toContain('Conecte o WhatsApp em Configurações → Integrações')
  })
  it('a action decide pela configuração da rede (o cargo gravado), não pelo critério antigo', () => {
    const t = fonte('actions/inbox.ts')
    expect(t).toContain('semWhatsappParaConversar(l.name')
    expect(t).not.toContain("Peça a quem tem as Configurações em Gerenciar para conectar o WhatsApp")
    expect(t).toMatch(/semWhatsappParaConversar\(l\.name, can\(ctx, 'settings', 'MANAGE'\) && mexeNaConfigDaRede\(ctx\)\)/)
  })
})

describe('A1: o cadastro do card mostra as tags que a ficha vai receber', () => {
  it('o card manda as tags da pessoa no prefill', () => {
    expect(fonte('components/branch/crm-board.tsx')).toMatch(/prefill=\{\{[^}]*tags: lead\.tags/)
  })
  it('o formulário as abre marcadas e fixas (elas vêm junto de qualquer jeito)', () => {
    const f = fonte('components/branch/client-form.tsx')
    expect(f).toMatch(/prefill\?:\s+\{[^}]*tags\?: string\[\]/)
    expect(f).toMatch(/useState<string\[\]>\(prefill\?\.tags \?\? \[\]\)/)
    expect(f).toContain('data-tag-que-vem')
  })
})

describe('A2: com o CRM em Ver, o card não oferece editar as tags', () => {
  it('sem o TagPicker nem o "x" de remover na leitura', () => {
    const m = fonte('components/branch/crm-lead-modal.tsx')
    expect(m).toMatch(/!somenteLeitura && <TagPicker/)
    expect(m).toMatch(/onRemove=\{somenteLeitura \? undefined : \(\) => removeTag\(t\)\}/)
  })
})

describe('A3: arquivar funil com oportunidades pergunta antes', () => {
  it('a pergunta diz quantas, quantas abertas, e que saem do quadro e dos relatórios', async () => {
    const { perguntaAoArquivarFunil } = await import('@/lib/crm/arquivar-funil')
    const p = perguntaAoArquivarFunil('Noivas 2027', { total: 2, abertas: 2 })
    expect(p).toContain('Arquivar o funil “Noivas 2027”?')
    expect(p).toContain('2 oportunidades')
    expect(p).toContain('saem do quadro e dos relatórios')
    expect(p).toContain('Reativar o funil as traz de volta')
    expect(perguntaAoArquivarFunil('Noivas 2027', { total: 3, abertas: 1 })).toContain('1 aberta')
    expect(perguntaAoArquivarFunil('Vazio', { total: 0, abertas: 0 })).toBeNull()
  })
  it('a tela conta antes de arquivar, e não recusa (o "Arquivar mesmo assim")', () => {
    const t = fonte('components/branch/crm-stage-settings.tsx')
    expect(t).toContain('oportunidadesNoFunil(funnel.id)')
    expect(t).toContain('perguntaAoArquivarFunil(')
    expect(t).toContain('Arquivar mesmo assim')
    expect(fonte('actions/crm-funnels.ts')).toContain('export async function oportunidadesNoFunil(')
  })
})
