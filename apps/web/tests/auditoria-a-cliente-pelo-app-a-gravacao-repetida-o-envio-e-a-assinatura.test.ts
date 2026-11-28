import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz quem fez e o fato (plataforma: AD-05, AD-12, AD-13, AD-20,
 * AD-22; documentos: DA-11). O texto é decisão do Claude, 28/11:
 *
 * - D7: a ficha de saúde e o termo respondidos pelo app saíam "A cliente, pelo
 *   portal", sem o nome (o gatilho grava o texto fixo). O nome é o da ficha
 *   daquela rede (`ator_cliente_id`, que o gatilho já grava: a ficha do login
 *   NA rede da linha), lido agora como os outros nomes (AD-08): "Alzira Souza,
 *   pelo app" — o "pelo app" do catálogo ("a cliente responde pelo app ou pelo
 *   link"). As linhas antigas, com o texto fixo, leem o nome também.
 * - D8: a resposta da ficha grava o prontuário e o pendente em duas idas ao
 *   banco (`gravarAnamneseGeral`), e o documento se gera de novo logo depois —
 *   eram duas linhas iguais. A mesma pessoa, a mesma ficha (ou o mesmo
 *   documento), em poucos instantes, é UMA gravação (AD-12).
 * - D9: "Enviar ao app" e "Tirar do app" diziam o mesmo ("Editou o documento
 *   da cliente (envio e quem enviou)"). O gatilho passa a guardar o
 *   `enviado_em` (a data, sem conteúdo) e a frase diz a direção.
 * - D10: a assinatura é "Assinou o documento X" (pela cliente) ou "Colheu a
 *   assinatura de Y no documento X" (pela equipe), e quem assinou como
 *   responsável legal aparece como na evidência (DA-11).
 */
let id = 9900
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-28T12:00:00.000Z', branch_id: null, client_id: 'cA', tabela: 'pre_atendimentos',
  operacao: 'editou', registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: null,
  ator_nome: 'A cliente, pelo portal', ator_tipo: 'cliente', incompleto: false, ator_cliente_id: 'cA', ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cA: 'Alzira Souza', cB: 'Berenice Galvão', cF: 'Flávia Maia' },
  membros: {}, unidades: { b1: 'Centro' }, fusos: { b1: 'America/Sao_Paulo' },
  categoriasDosAnexos: { f1: 'foto_clinica' },
  assinaturasDosDocumentos: { dF: 'Gorete Maia, responsável legal de Flávia Maia' },
}
const em = (ms: number) => new Date(Date.parse('2026-11-28T12:00:00.000Z') + ms).toISOString()

describe('D7: o que a cliente fez pelo app é dela, com o nome', () => {
  it('"Alzira Souza, pelo app" — Respondeu a ficha de saúde', async () => {
    const { linhaDaAuditoria } = await import('@/lib/auditoria/frase')
    const l = linhaDaAuditoria(r({ colunas: ['respondido_em', 'respostas', 'status'] }), nomes, '/admin/auditoria', null)
    expect(l.quem).toBe('Alzira Souza, pelo app')
    expect(l.tipoDeAtor).toBe('cliente')
    expect(l.oQue).toBe('Respondeu a ficha de saúde')
  })

  it('o nome é o da ficha de quem agiu, lido agora (e a linha sem a ficha lida segue o que o banco gravou)', async () => {
    const { linhaDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(linhaDaAuditoria(r({ client_id: 'cB', ator_cliente_id: 'cB' }), nomes, '/admin/auditoria', null).quem).toBe('Berenice Galvão, pelo app')
    expect(linhaDaAuditoria(r({ ator_cliente_id: 'cX', client_id: 'cX' }), nomes, '/admin/auditoria', null).quem).toBe('A cliente, pelo portal')
  })

  it('a entrada no sistema diz só o nome, lido agora', async () => {
    const { linhaDaAuditoria } = await import('@/lib/auditoria/frase')
    const entrada = r({ tabela: 'clients', operacao: 'entrou', ator_nome: 'Alzira', registro_id: 'cA' })
    expect(linhaDaAuditoria(entrada, nomes, '/admin/auditoria', null).quem).toBe('Alzira Souza')
  })

  it('a leitura traz o ator_cliente_id e lê o nome dessa ficha', () => {
    const leitura = readFileSync(path.join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/const COLUNAS = '[^']*\bator_cliente_id\b[^']*'/)
    expect(leitura).toMatch(/r\.ator_cliente_id/)
  })
})

describe('D8: a mesma resposta (ou o mesmo documento) em duas idas ao banco é uma gravação', () => {
  it('o prontuário e o pendente da ficha, 40 ms um do outro: uma linha "Respondeu a ficha de saúde"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const link = r({ id: 3, criado_em: em(90), tabela: 'pre_atendimento_links', colunas: ['used_at'], ator_nome: 'O sistema', ator_tipo: 'sistema', ator_cliente_id: null, client_id: 'cB' })
    const pendente = r({ id: 2, criado_em: em(40), colunas: ['origem', 'respondido_em', 'respostas', 'status'], ator_nome: 'O sistema', ator_tipo: 'sistema', ator_cliente_id: null, client_id: 'cB' })
    const prontuario = r({ id: 1, criado_em: em(0), tabela: 'medical_records', colunas: ['general_anamnesis'], ator_nome: 'O sistema', ator_tipo: 'sistema', ator_cliente_id: null, client_id: 'cB' })
    const grupos = gruposDaAuditoria([link, pendente, prontuario], nomes, '/admin/auditoria', null)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.oQue).toBe('Respondeu a ficha de saúde')
    expect(grupos[0]!.quem).toBe('Berenice Galvão, pelo link')
    expect(grupos[0]!.detalhes).toHaveLength(3)
  })

  it('a geração do mesmo documento duas vezes seguidas: uma linha "Gerou o documento"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const gerou = (n: number, ms: number) => r({
      id: n, criado_em: em(ms), tabela: 'issued_documents', registro_id: 'd1', colunas: ['content', 'rendered_at', 'status'],
      depois: { title: 'Termo do peeling', status: 'PENDENTE' },
    })
    const grupos = gruposDaAuditoria([gerou(2, 700), gerou(1, 0)], nomes, '/admin/auditoria', null)
    expect(grupos.map(g => g.oQue)).toEqual(['Gerou o documento Termo do peeling — Alzira Souza'])
  })

  it('outra cliente, outro documento ou muito tempo depois: gravações à parte', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const resposta = (n: number, ms: number, cliente: string) => r({ id: n, criado_em: em(ms), client_id: cliente, ator_cliente_id: cliente, colunas: ['respondido_em'] })
    expect(gruposDaAuditoria([resposta(2, 50, 'cB'), resposta(1, 0, 'cA')], nomes, '/admin/auditoria', null)).toHaveLength(2)
    expect(gruposDaAuditoria([resposta(2, 10 * 60_000, 'cA'), resposta(1, 0, 'cA')], nomes, '/admin/auditoria', null)).toHaveLength(2)
    const gerou = (n: number, doc: string) => r({ id: n, criado_em: em(n * 10), tabela: 'issued_documents', registro_id: doc, colunas: ['rendered_at'], depois: { title: doc } })
    expect(gruposDaAuditoria([gerou(2, 'd2'), gerou(1, 'd1')], nomes, '/admin/auditoria', null)).toHaveLength(2)
  })
})

describe('D9: enviar ao app e tirar do app são fatos diferentes', () => {
  const envio = (antes: unknown, depois: unknown) => r({
    tabela: 'client_documents', registro_id: 'f1', client_id: 'cA', ator_user_id: 'u1', ator_nome: 'Dra. Marluce', ator_tipo: 'membro',
    ator_cliente_id: null, colunas: ['enviado_em', 'enviado_por', 'enviado_por_nome'], antes: { enviado_em: antes }, depois: { enviado_em: depois },
  })

  it('"Enviou ao app uma foto clínica" / "Tirou do app uma foto clínica"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(envio(null, '2026-11-28T12:00:00Z'), nomes)).toBe('Enviou ao app uma foto clínica — Alzira Souza')
    expect(fraseDaAuditoria(envio('2026-11-28T12:00:00Z', null), nomes)).toBe('Tirou do app uma foto clínica — Alzira Souza')
  })

  it('a gravação de antes (só o nome da coluna) não chuta a direção', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const antiga = r({ tabela: 'client_documents', registro_id: 'f1', ator_tipo: 'membro', ator_cliente_id: null, colunas: ['enviado_em', 'enviado_por'] })
    expect(fraseDaAuditoria(antiga, nomes)).toBe('Mudou o envio ao app de uma foto clínica — Alzira Souza')
  })

  it('a categoria do anexo se lê também no envio', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib', 'auditoria', 'nomes-dos-anexos-e-devolucoes.ts'), 'utf8')
    expect(fonte).toMatch(/r\.colunas\.includes\('enviado_em'\)/)
  })

  it('o gatilho de client_documents guarda o enviado_em (só a data; o resto segue sem valor)', () => {
    const PASTA = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const com = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
      .map(f => readFileSync(path.join(PASTA, f), 'utf8'))
      .filter(s => /on public\.client_documents/.test(s) && s.includes('private.auditar('))
    const vale = com[com.length - 1] ?? ''
    for (const t of ['auditoria_ins', 'auditoria_upd', 'auditoria_del']) {
      expect(vale).toMatch(new RegExp(`create trigger ${t}[^;]*on public\\.client_documents[^;]*private\\.auditar\\('normal', '', 'enviado_em', '', ''\\)`))
    }
    expect(vale.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})

describe('D10: a assinatura é o fato, e quem assinou como responsável aparece como na evidência', () => {
  const assinatura = (x: Partial<RegistroDaAuditoria> = {}) => {
    const base = { criado_em: em(0), ...x }
    return [
      r({ ...base, tabela: 'document_sign_links', client_id: x.client_id ?? 'cA', colunas: ['revoked_at'] }),
      r({ ...base, tabela: 'issued_documents', registro_id: x.registro_id ?? 'd1', colunas: ['signed_at', 'status'],
        antes: { status: 'PENDENTE' }, depois: { title: 'Termo do peeling', status: 'ASSINADO' } }),
      r({ ...base, tabela: 'document_signatures', client_id: null, operacao: 'criou' }),
    ]
  }

  it('pelo app: "Assinou o documento Termo do peeling — Alzira Souza", de "Alzira Souza, pelo app"', async () => {
    const { gruposDaAuditoria, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(assinatura(), nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Assinou o documento Termo do peeling — Alzira Souza')
    expect(g!.quem).toBe('Alzira Souza, pelo app')
    expect(fraseDaAuditoria(assinatura()[1]!, nomes)).toBe('Assinou o documento Termo do peeling — Alzira Souza')
  })

  it('pelo link, a responsável legal: "Gorete Maia, responsável legal de Flávia Maia, pelo link"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(assinatura({ client_id: 'cF', registro_id: 'dF', ator_nome: 'O sistema', ator_tipo: 'sistema', ator_cliente_id: null }),
      nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Assinou o documento Termo do peeling — Flávia Maia')
    expect(g!.quem).toBe('Gorete Maia, responsável legal de Flávia Maia, pelo link')
  })

  it('pela equipe na tela: quem agiu é o membro, e a frase diz de quem colheu', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const daEquipe = { ator_user_id: 'u1', ator_nome: 'Dra. Paula', ator_tipo: 'membro' as const, ator_cliente_id: null }
    const [menor] = gruposDaAuditoria(assinatura({ client_id: 'cF', registro_id: 'dF', ...daEquipe }), nomes, '/admin/auditoria', null)
    expect(menor!.quem).toBe('Dra. Paula')
    expect(menor!.oQue).toBe('Colheu a assinatura de Gorete Maia, responsável legal de Flávia Maia, no documento Termo do peeling')
    const [adulta] = gruposDaAuditoria(assinatura({ client_id: 'cB', ...daEquipe }), nomes, '/admin/auditoria', null)
    expect(adulta!.oQue).toBe('Colheu a assinatura de Berenice Galvão no documento Termo do peeling')
  })

  it('o PDF assinado: sozinho é "Gerou o PDF assinado…"; logo depois da assinatura, da mesma pessoa, entra nela', async () => {
    const { gruposDaAuditoria, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const pdf = r({ criado_em: em(1500), tabela: 'issued_documents', registro_id: 'd1', colunas: ['signed_pdf_path', 'signed_pdf_sha256'], depois: { title: 'Termo do peeling', status: 'ASSINADO' } })
    expect(fraseDaAuditoria(pdf, nomes)).toBe('Gerou o PDF assinado do documento Termo do peeling — Alzira Souza')
    const grupos = gruposDaAuditoria([pdf, ...assinatura()], nomes, '/admin/auditoria', null)
    expect(grupos.map(g => g.oQue)).toEqual(['Assinou o documento Termo do peeling — Alzira Souza'])
  })

  it('a leitura busca quem assinou (a evidência) pelo documento assinado', () => {
    const leitura = readFileSync(path.join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/assinaturasDosDocumentos\(ctx, registros\)/)
  })
})
