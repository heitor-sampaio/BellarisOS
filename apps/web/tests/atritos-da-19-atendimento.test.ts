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

// ─── D4: quem COLHE é quem tem os Documentos em Gerenciar ───────────────────
describe('D4: o aviso pós-venda aponta quem colhe, não quem só vê', () => {
  it('a lista de quem colhe lê os Documentos em Gerenciar, e só', async () => {
    const { quemColheOsDocumentos } = await import('@/lib/equipe/quem-desfaz')
    responder = p => ({ data: p.tabela === 'role_permissions' ? [{ role_id: 'cargo' }] : [], error: null })
    await quemColheOsDocumentos('rede', UNIDADE)
    const ins = opsDe('role_permissions', 'in')
    expect(ins).toContainEqual(['module', ['documents']])
    expect(ins).toContainEqual(['level', ['MANAGE']])
  })
  it('o texto diz a permissão de colher', async () => {
    const { avisoDosDocumentosDaVenda } = await import('@/lib/documentos/aviso-da-venda')
    const contrato = { id: 'x', titulo: 'Contrato do pacote', status: 'PENDENTE', faltando: [] }
    const semDocs = avisoDosDocumentosDaVenda([contrato], ['Patrícia Begônia'])
    expect(semDocs).toContain('Para colher a assinatura, fale com quem tem os Documentos em Gerenciar: Patrícia Begônia.')
    expect(semDocs).not.toContain('Estão na ficha')
    // Quem VÊ os Documentos e não colhe: estão na ficha, e quem colhe é outra pessoa.
    const soVe = avisoDosDocumentosDaVenda([contrato], ['Patrícia Begônia'], { veNaFicha: true })
    expect(soVe).toContain('Estão na ficha, em Documentos.')
    expect(soVe).toContain('quem tem os Documentos em Gerenciar: Patrícia Begônia.')
    // Quem colhe: como antes.
    expect(avisoDosDocumentosDaVenda([contrato], null)).toBe('Ficou 1 documento para a cliente assinar: Contrato do pacote. Estão na ficha, em Documentos.')
  })
  it('a venda do pacote pergunta pelo Gerenciar, não pelo Ver', () => {
    const f = ler('actions/pacotes.ts')
    expect(f).toContain('quemColheOsDocumentos(')
    expect(f).not.toContain('quemVeOsDocumentos(')
    expect(f).toMatch(/!can\(ctx, 'documents', 'MANAGE'\)/)
    expect(ler('components/shared/vender-pacote.tsx')).toContain('quemColheOsDocumentos')
  })
})

// ─── A10: o "Falta assinar" e a chegada dizem o nome de quem pode ───────────
describe('A10: quem atende sem o módulo lê quem pode, pelo nome', () => {
  it('quem colhe a assinatura', async () => {
    const { textoDeQuemColhe } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemColhe(['Patrícia Begônia']))
      .toBe('A assinatura é colhida por quem tem os Documentos em Gerenciar (Patrícia Begônia): na tela, por link ou pelo app da cliente.')
    expect(textoDeQuemColhe(['Patrícia Begônia', 'Renan Dias']))
      .toBe('A assinatura é colhida por quem tem os Documentos em Gerenciar (Patrícia Begônia e Renan Dias): na tela, por link ou pelo app da cliente.')
    expect(textoDeQuemColhe(null))
      .toBe('A assinatura é colhida por quem tem os Documentos em Gerenciar: na tela, por link ou pelo app da cliente.')
  })
  it('quem marca a chegada', async () => {
    const { textoDeQuemMarcaAChegada } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemMarcaAChegada(['Renan Dias', 'Patrícia Begônia']))
      .toBe('Quem tem a Agenda em Gerenciar marca a chegada (Renan Dias e Patrícia Begônia); depois você inicia.')
    expect(textoDeQuemMarcaAChegada([])).toBe('Quem tem a Agenda em Gerenciar marca a chegada; depois você inicia.')
  })
  it('quem marca a chegada de OUTRA pessoa é a Agenda em Gerenciar de todos (o "só os meus" marca só a dele)', async () => {
    const { quemMarcaAChegada } = await import('@/lib/equipe/quem-desfaz')
    responder = p => ({ data: p.tabela === 'role_permissions' ? [{ role_id: 'cargo' }] : [], error: null })
    await quemMarcaAChegada('rede', UNIDADE)
    const ins = opsDe('role_permissions', 'in')
    expect(ins).toContainEqual(['module', ['agenda']])
    expect(ins).toContainEqual(['level', ['MANAGE']])
    expect(opsDe('role_permissions', 'or')).toContainEqual(['scope.is.null,scope.eq.ALL'])
  })
  it('a tela do atendimento recebe e mostra os nomes', () => {
    const pagina = ler('app/_shared/sessao-de-atendimento.tsx')
    expect(pagina).toContain('quemMarcaAChegada(')
    expect(pagina).toContain('quemColheOsDocumentos(')
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('textoDeQuemMarcaAChegada(')
    expect(tela).toContain('textoDeQuemColhe(')
    expect(tela).not.toContain('Quem tem a Agenda em Gerenciar marca a chegada; depois você inicia.')
    expect(ler('components/shared/termos-do-cliente.tsx')).toContain('textoDeQuemColhe(')
  })
  it('a ficha passa quem colhe aos Documentos', () => {
    for (const f of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(ler(f), f).toContain('quemColheOsDocumentos(')
    }
    expect(ler('components/branch/client-profile.tsx')).toMatch(/quemColhe=\{termos\.quemColhe/)
  })
})

// ─── A9: quem não tem os Documentos sabe que há documento esperando ─────────
describe('A9: a ficha diz o documento esperando a quem não tem os Documentos', () => {
  it('o texto', async () => {
    const { textoDosDocumentosEsperando } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDosDocumentosEsperando(1, ['Patrícia Begônia']))
      .toBe('1 documento esperando a assinatura da cliente. Quem colhe é quem tem os Documentos em Gerenciar (Patrícia Begônia).')
    expect(textoDosDocumentosEsperando(2, []))
      .toBe('2 documentos esperando a assinatura da cliente. Quem colhe é quem tem os Documentos em Gerenciar.')
  })
  it('a contagem lê os abertos da cliente, na rede', async () => {
    const { documentosEsperandoAssinatura } = await import('@/lib/documentos/esperando')
    responder = p => ({ data: p.tabela === 'issued_documents' ? [{ id: 'a' }, { id: 'b' }] : [], error: null })
    expect(await documentosEsperandoAssinatura('rede', 'cliente')).toBe(2)
    const eqs = opsDe('issued_documents', 'eq')
    expect(eqs).toContainEqual(['tenant_id', 'rede'])
    expect(eqs).toContainEqual(['client_id', 'cliente'])
    expect(opsDe('issued_documents', 'in')).toContainEqual(['status', ['A_GERAR', 'INCOMPLETO', 'PENDENTE']])
  })
  it('as duas fichas contam e a aba mostra', () => {
    for (const f of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(ler(f), f).toContain('documentosEsperandoAssinatura(')
    }
    const tela = ler('components/branch/client-profile.tsx')
    expect(tela).toContain('data-documentos-esperando')
    expect(tela).toContain('textoDosDocumentosEsperando(')
  })
})

// ─── A11: o avulso aguardando o PDV diz quem recebe ─────────────────────────
describe('A11: "Aguardando o pagamento no PDV" diz quem recebe, a quem não recebe', () => {
  it('o texto', async () => {
    const { textoDeQuemRecebe } = await import('@/lib/equipe/textos-de-quem-pode')
    expect(textoDeQuemRecebe(['Sabrina Lima', 'Vítor Azaleia']))
      .toBe('Quem recebe é quem tem o PDV ou o Financeiro em Gerenciar: Sabrina Lima e Vítor Azaleia.')
    expect(textoDeQuemRecebe([])).toBe('Quem recebe é quem tem o PDV ou o Financeiro em Gerenciar.')
  })
  it('a página lê quem recebe e a tela mostra', () => {
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/quemRecebe=\{[^}]*quemRecebeNoPdv\(/)
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('data-quem-recebe')
    expect(tela).toContain('textoDeQuemRecebe(')
  })
})

// ─── A12: remarcar pelo app diz que o horário fica confirmado ───────────────
describe('A12: o remarcado pelo app diz que o horário novo fica confirmado (H3)', () => {
  it('o texto', async () => {
    const { textoDoRemarcado } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00. O horário novo fica confirmado.')
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
    expect(avisoDoBairroDoCep('Centro')).toBe('O bairro “Centro” veio da busca do CEP: confira.')
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
describe('A20: o aviso do escopo pendente fica no módulo destacado', () => {
  it('a linha do módulo destacado leva o aviso, fixo', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toContain('data-falta-no-modulo')
    expect(f).toMatch(/aviso=\{destaque === module \? falta : null\}/)
  })
})
