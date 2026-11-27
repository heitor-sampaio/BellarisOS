import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O D4 e os atritos da 19ª simulação (2026-11-16) de atendimento, app da
 * cliente e montar a rede que se provam sem tela: quem PODE fazer (o nome, por
 * permissão), o texto e o que a tela passa a mostrar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

// ─── O banco de mentira (só o que estas leituras pedem) ─────────────────────
type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }
const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: [], error: null })
function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'range', 'limit', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(p)).then(ok, falhou)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
beforeEach(() => { pedidos.length = 0; responder = () => ({ data: [], error: null }) })
const opsDe = (tabela: string, op: string) => pedidos.filter(p => p.tabela === tabela)
  .flatMap(p => p.ops.filter(o => o.op === op).map(o => o.args))

const UNIDADE = '11111111-1111-4111-8111-111111111111'

// ─── D4: o aviso pós-venda ─────────────────────────────────────────────────
// A regra mudou em 2026-11-16 (o Heitor: o módulo Documentos é o dos MODELOS;
// colher a assinatura não pede permissão de documento). Quem vendeu colhe, e
// nenhum aviso manda falar com outra pessoa — `tests/documentos-assinar-sem-permissao.test.ts`.
describe('D4: o aviso pós-venda não aponta outra pessoa para colher', () => {
  it('o texto diz só onde estão os documentos', async () => {
    const { avisoDosDocumentosDaVenda } = await import('@/lib/documentos/aviso-da-venda')
    const contrato = { id: 'x', titulo: 'Contrato do pacote', status: 'PENDENTE', faltando: [] }
    expect(avisoDosDocumentosDaVenda([contrato])).toBe('Ficou 1 documento para a cliente assinar: Contrato do pacote. Estão na ficha, em Documentos.')
    // Quem vendeu sem ver a ficha: sem o "estão na ficha".
    expect(avisoDosDocumentosDaVenda([contrato], { veNaFicha: false })).toBe('Ficou 1 documento para a cliente assinar: Contrato do pacote.')
  })
  it('a venda do pacote não pergunta quem colhe', () => {
    const f = ler('actions/pacotes.ts')
    expect(f).not.toContain('quemColheOsDocumentos')
    expect(f).not.toContain("'documents'")
    expect(ler('components/shared/vender-pacote.tsx')).not.toContain('quemColheOsDocumentos')
  })
})

// ─── A10: o "Falta assinar" e a chegada dizem o nome de quem pode ───────────
describe('A10: quem atende sem o módulo lê quem pode, pelo nome', () => {
  // Era "marca a chegada"; o nome é "Check-in" (o Heitor, 27/11: "Fica "Check-in"" — "Fica Check-in em todos os lugares").
  it('quem faz o check-in', async () => {
    const { textoDeQuemMarcaAChegada } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemMarcaAChegada(['Renan Dias', 'Patrícia Begônia']))
      .toBe('Quem tem a Agenda em Gerenciar faz o check-in (Renan Dias e Patrícia Begônia); depois você inicia.')
    expect(textoDeQuemMarcaAChegada([])).toBe('Quem tem a Agenda em Gerenciar faz o check-in; depois você inicia.')
  })
  // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): a Agenda em Gerenciar marca a chegada de todos, sem escopo.
  it('quem marca a chegada de OUTRA pessoa é a Agenda em Gerenciar, sem escopo', async () => {
    const { quemMarcaAChegada } = await import('@/lib/equipe/quem-desfaz')
    responder = p => ({ data: p.tabela === 'role_permissions' ? [{ role_id: 'cargo' }] : [], error: null })
    await quemMarcaAChegada('rede', UNIDADE)
    const ins = opsDe('role_permissions', 'in')
    expect(ins).toContainEqual(['module', ['agenda']])
    expect(ins).toContainEqual(['level', ['MANAGE']])
    expect(opsDe('role_permissions', 'or')).toEqual([])
  })
  it('a tela do atendimento recebe e mostra os nomes', () => {
    const pagina = ler('app/_shared/sessao-de-atendimento.tsx')
    expect(pagina).toContain('quemMarcaAChegada(')
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('textoDeQuemMarcaAChegada(')
    expect(tela).not.toContain('Quem tem a Agenda em Gerenciar faz o check-in; depois você inicia.')
  })
})

// ─── A9: saiu em 2026-11-16 ─────────────────────────────────────────────────
// A ficha contava os documentos esperando a quem não tinha os Documentos. Com a
// decisão do Heitor de 2026-11-16, quem vê a ficha vê (e colhe) os documentos:
// a contagem à parte não tem mais para quem aparecer.
describe('A9: a contagem à parte saiu', () => {
  it('a ficha não tem mais o aviso de documentos esperando', () => {
    for (const f of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(ler(f), f).not.toContain('documentosEsperandoAssinatura(')
    }
    expect(ler('components/branch/client-profile.tsx')).not.toContain('data-documentos-esperando')
  })
})

// ─── A11: o avulso aguardando o PDV diz quem recebe ─────────────────────────
describe('A11: "Aguardando o pagamento no PDV" diz quem recebe, a quem não recebe', () => {
  it('o texto', async () => {
    const { textoDeQuemRecebe } = await import('@/lib/equipe/textos-de-quem-pode')
    // PV-04 (catálogo de 24/11; o Heitor, 23/11: "cada passo pertence a UM módulo … PDV: receber" — "concordo"):
    // receber é só do PDV, e o texto deixou de citar o Financeiro em Gerenciar.
    expect(textoDeQuemRecebe(['Sabrina Lima', 'Vítor Azaleia']))
      .toBe('Quem recebe é quem tem o PDV em Gerenciar: Sabrina Lima e Vítor Azaleia.')
    expect(textoDeQuemRecebe([])).toBe('Quem recebe é quem tem o PDV em Gerenciar.')
  })
  it('a página lê quem recebe e a tela mostra', () => {
    // A8 da 20ª: lê quem recebe NA UNIDADE (quemRecebeNaUnidade, que parte de quemRecebeNoPdv) e diz quando só a rede recebe.
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/quemRecebe=\{[^}]*quemRecebeNaUnidade\(/)
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('data-quem-recebe')
    expect(tela).toContain('textoDeQuemRecebe(')
  })
})

// ─── A12: remarcar pelo app diz como o horário fica ─────────────────────────
// O Heitor, 25/11: "Ela já desmarcou uma vez, pode acabar desmarcando de novo,
// melhor reconfirmar." — a remarcação pelo app volta a Agendado (era a H3).
describe('A12: o remarcado pelo app diz que o horário novo fica Agendado até ser confirmado', () => {
  it('o texto', async () => {
    const { textoDoRemarcado } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00. O horário novo fica como Agendado até ser confirmado.')
  })
})

// ─── A13: enquanto as salas carregam, o seletor não diz "Sem sala definida" ─
describe('A13: as salas carregando', () => {
  it('o seletor diz que está conferindo', () => {
    const f = ler('components/branch/appointment-modal.tsx')
    expect(f).toContain('Conferindo as salas…')
    expect(f).toMatch(/carregandoSalas && salaEscolhida === null \? 'Conferindo as salas…' : 'Sem sala definida'/)
  })
})

// ─── A14: "Mostrar cancelados" não se corta no celular ──────────────────────
describe('A14: a barra da Agenda quebra a linha em vez de cortar o botão', () => {
  it('o grupo das ações da Agenda quebra', () => {
    expect(ler('components/branch/agenda-calendar.tsx'))
      .toMatch(/flexWrap: 'wrap'[^\n]*\}\}>\s*\n\s*<button type="button" onClick=\{alternarCancelados\}/)
  })
})

// ─── A15: o nome da foto é o do prontuário ──────────────────────────────────
describe('A15: o campo do nome da foto diz que é o nome no prontuário', () => {
  it('a dica diz o que a cliente lê no app', async () => {
    const { DICA_DO_NOME_DA_FOTO, tituloDoArquivoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(DICA_DO_NOME_DA_FOTO).toContain(tituloDoArquivoNoApp({ name: 'x', category: 'foto_clinica', momento: null }))
  })
  it('a foto do atendimento usa o rótulo e a dica', () => {
    const f = ler('components/branch/fotos-do-atendimento.tsx')
    expect(f).toContain('rotuloDoNome="Nome no prontuário *"')
    expect(f).toContain('dicaDoNome={DICA_DO_NOME_DA_FOTO}')
    const form = ler('components/branch/client-documents-tab.tsx')
    expect(form).toContain('{rotuloDoNome}')
    expect(form).toContain('data-dica-do-nome')
  })
})

// ─── A18: o bairro que veio do CEP fica marcado para conferir ───────────────
describe('A18: o /setup diz que o bairro veio da busca do CEP', () => {
  it('o texto', async () => {
    const { avisoDoBairroDoCep } = await import('@/lib/cep')
    // A9 da 23ª: o texto aponta o logradouro, onde o bairro entrou.
    expect(avisoDoBairroDoCep('Centro')).toBe('O bairro “Centro” veio da busca do CEP e entrou no logradouro: confira.')
    expect(avisoDoBairroDoCep('')).toBeNull()
    expect(avisoDoBairroDoCep(null)).toBeNull()
  })
  it('o setup mostra o aviso', () => {
    const f = ler('components/setup/setup-wizard.tsx')
    expect(f).toContain('avisoDoBairroDoCep(')
    expect(f).toContain('data-confira-o-bairro')
  })
})

// ─── A20: o que falta escolher no cargo aparece NO módulo ───────────────────
describe('A20: o que falta escolher no cargo (o relatório) fica no módulo destacado', () => {
  it('a linha do módulo destacado leva o aviso, fixo', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toContain('data-falta-no-modulo')
    expect(f).toMatch(/aviso=\{destaque === module \? falta : null\}/)
  })
})
