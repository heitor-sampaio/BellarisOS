import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alcancaTodasAsDoMembro, FORA_DO_ALCANCE_PARA_DESATIVAR, CARGO_DE_QUEM_TEM_OUTRA_UNIDADE } from '@/lib/unidades/do-membro'
import { validarTemplate } from '@/lib/templates/core'

/**
 * A varredura de conformidade de 18/11 — plataforma, permissões, equipe,
 * unidades, documentos, WhatsApp/notificações e as telas de automações. Cada
 * bloco cita a regra. Quase tudo aqui é trava no código (teste de fonte); o
 * que tem função pura testa a função.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** O corpo de uma função do arquivo, até a próxima `export` (ou o fim). */
function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

// CLAUDE.md §6: "layout e página renderizam em PARALELO … Página sem módulo
// (os dashboards) repete a trava do layout."
describe('PLAT-01 — o painel da unidade confere a abrangência por si', () => {
  it('a página lê a unidade pelo endereço e para se ela não é uma das da pessoa', () => {
    const f = fonte('app/[slug]/dashboard/page.tsx')
    expect(f).toMatch(/if \(!alcancaUnidade\(ctx, branch\.id\)\) redirect\(/)
  })
})

// plataforma.md (H7 opção b) + CLAUDE.md §11: "Ninguém dá um cargo com mais
// acesso que o próprio": a Equipe mostra o cargo acima desligado.
describe('PLAT-02 — a Equipe da unidade desliga o cargo acima do de quem age', () => {
  it('a página calcula cargosAcimaDoMeu e passa a marca ao cadastro e ao lápis', () => {
    const f = fonte('app/[slug]/team/page.tsx')
    expect(f).toContain('cargosAcimaDoMeu(')
    expect(f).toMatch(/roles=\{comTrava\}/)
  })
  it('o cadastro da unidade desliga a opção e diz por quê', () => {
    const f = fonte('components/branch/team-form.tsx')
    expect(f).toMatch(/disabled=\{r\.acimaDoMeu\}/)
    expect(f).toContain('Só quem tem esses módulos pode dar este cargo.')
  })
})

// plataforma.md (EQ1): o cargo e o desativar valem em TODAS as unidades do
// membro — só quem alcança todas mexe. E a recusa diz o motivo, não "Membro
// não encontrado." (a pessoa está na lista).
describe('PLAT-03 — quem tem outra unidade fora do alcance', () => {
  it('a regra é uma, pura', () => {
    expect(alcancaTodasAsDoMembro(null, { branchId: 'A', outrasUnidades: ['C'] })).toBe(true)
    expect(alcancaTodasAsDoMembro(['A', 'B'], { branchId: 'A', outrasUnidades: ['B'] })).toBe(true)
    expect(alcancaTodasAsDoMembro(['A', 'B'], { branchId: 'A', outrasUnidades: ['C'] })).toBe(false)
    expect(alcancaTodasAsDoMembro(['A'], { branchId: null })).toBe(false)
  })
  it('a action devolve o motivo, e a tela esconde o desativar e trava o cargo', () => {
    expect(corpo('actions/team.ts', 'membroDaRede')).toContain('FORA_DO_ALCANCE_PARA_DESATIVAR')
    expect(FORA_DO_ALCANCE_PARA_DESATIVAR).not.toContain('não encontrado')
    const f = fonte('app/[slug]/team/page.tsx')
    expect(f).toContain('alcancaTodasAsDoMembro(')
    expect(f).toMatch(/cargoTravado=/)
    expect(fonte('components/admin/team-member-edit.tsx')).toContain('cargoTravado')
    expect(CARGO_DE_QUEM_TEM_OUTRA_UNIDADE).toMatch(/alcança todas as unidades/)
  })
})

// plataforma.md (o Heitor, 18/11: desativar unidade é da Admin da rede) +
// §14: "Botão que a pessoa não pode usar: a tela esconde, e a action devolve
// { error } em vez de lançar".
describe('PLAT-04 — desativar e reativar unidade só aparecem à Admin da rede', () => {
  it('a action devolve { error } (não lança) a quem não é a Admin', () => {
    const c = corpo('actions/branches.ts', 'toggleBranchStatus')
    expect(c).toContain('recusaDaConfigDaRede(ctx)')
    expect(c).not.toMatch(/mexeNaConfigDaRede\(ctx\)\) throw semAcesso\(\)/)
  })
  it('o detalhe da unidade só mostra os botões a quem mexe na configuração da rede', () => {
    expect(fonte('app/admin/branches/[id]/page.tsx')).toMatch(/mexeNaConfigDaRede\(ctx\)/)
  })
  it('quem chama não ignora o { error }', () => {
    expect(fonte('components/admin/desativar-unidade.tsx')).toMatch(/const r = await toggleBranchStatus\(branchId, false\)/)
    expect(fonte('components/admin/settings-branches.tsx')).toMatch(/const r = await toggleBranchStatus\(branch\.id, true\)/)
    expect(fonte('app/admin/branches/[id]/page.tsx')).toMatch(/const r = await toggleBranchStatus\(id, true\)/)
  })
})

// plataforma.md: "Revogar: a própria pessoa (a conta é dela) e a Admin da rede."
// A autorização dada em Configurações → Suporte não tem chamado: sem isto a
// pessoa não a via nem revogava em lugar nenhum.
describe('PLAT-05 — a pessoa vê e revoga a autorização da própria conta na Ajuda', () => {
  it('meusChamados devolve a autorização vigente da conta de quem pergunta', () => {
    const c = corpo('actions/chamados.ts', 'meusChamados')
    expect(c).toContain('minhaAutorizacao')
    expect(c).toContain("from('support_grants')")
    expect(c).toContain('ctx.internalUserId')
  })
  it('a lista da Ajuda mostra o aviso com o Revogar', () => {
    const f = fonte('components/shared/ajuda.tsx')
    expect(f).toContain('data-minha-autorizacao')
    expect(f).toMatch(/revogarAutorizacaoDeSuporte\(/)
  })
})

// CLAUDE.md §11 (C58, F70): o "tudo" da Admin da rede vem do CARGO gravado,
// nunca da claim `role`.
describe('PLAT-07 — a conta suspensa decide quem administra pelo cargo gravado', () => {
  it('não lê a claim role', () => {
    const f = fonte('app/conta-suspensa/page.tsx')
    expect(f).not.toMatch(/meta\.role === 'NETWORK_ADMIN'/)
    expect(f).toContain('ehAdminDaRede')
  })
})

// CLAUDE.md §6: rota pública se declara no proxy; o endereço de uma unidade
// nunca é o nome de uma rota (`schedule-studio` não é `/schedule`).
describe('PLAT-08 — /schedule público é o caminho exato, não o prefixo', () => {
  it('o proxy casa /schedule e /schedule/…, não /schedule-studio', () => {
    const f = fonte('lib/supabase/middleware.ts')
    expect(f).not.toMatch(/pathname\.startsWith\('\/schedule'\)/)
    expect(f).toContain("pathname === '/schedule' || pathname.startsWith('/schedule/')")
  })
})

// whatsapp-push.md (o Heitor, 25/09): "Responsável" é quem tem o módulo em
// Gerenciar — e a Admin da rede tem todos (o cargo de sistema não grava linha
// em role_permissions).
describe('WPP-01 — a Admin da rede é responsável por todo módulo', () => {
  it('responsaveisPeloModulo inclui o cargo de sistema da Admin da rede', () => {
    const c = corpo('lib/notifications/interessados.ts', 'responsaveisPeloModulo')
    expect(c).toContain("'NETWORK_ADMIN'")
    expect(c).toContain("'is_system'")
  })
})

// whatsapp-push.md: "Template só sai com variável que o sistema preenche — com
// nome. O formato posicional da Meta ({{1}}) é recusado antes de gravar."
describe('WPP-02 — o template com {{1}} é recusado ao salvar', () => {
  const base = { name: 'lembrete', body_text: 'Oi {{nome}}, tudo bem?', example_values: { nome: 'Ana' } }
  it('no corpo, no cabeçalho e no rodapé', () => {
    const erro = (t: Parameters<typeof validarTemplate>[0]) => validarTemplate(t).some(e => /\{\{1\}\}/.test(e))
    expect(erro({ ...base, body_text: 'Oi {{1}}, tudo bem?' } as never)).toBe(true)
    expect(erro({ ...base, header_text: 'Olá {{ 2 }}' } as never)).toBe(true)
    expect(erro({ ...base, footer_text: 'Até {{3}}' } as never)).toBe(true)
    expect(erro(base as never)).toBe(false)
  })
})

// whatsapp-push.md: "quem acha um número por id (`numeroDaRede`, o salvar, o
// padrão) recusa o removido".
describe('WPP-03 — o número removido não se salva, não vira padrão nem ganha pessoas', () => {
  it('as três actions filtram removido_em', () => {
    for (const nome of ['salvarNumeroWhatsApp', 'definirNumeroPadrao', 'atualizarVinculosDoNumero']) {
      expect(corpo('actions/integrations.ts', nome), nome).toContain(".is('removido_em', null)")
    }
  })
  it('e a função do banco também', () => {
    const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const nome = readdirSync(dir).filter(n => /definir_vinculos|vinculos_do_numero/.test(n) && n >= '20261124800001').sort().pop()
    expect(nome, 'migration nova de definir_vinculos_do_numero').toBeTruthy()
    const sql = readFileSync(join(dir, nome!), 'utf8')
    expect(sql).toMatch(/w\.removido_em is null/)
    expect(sql).toMatch(/notify pgrst, 'reload schema'/)
  })
})

// documentos.md (A10 da 20ª) + §14: "Botão que a pessoa não pode usar: a tela
// esconde". Completar a ficha é editar a cliente (Clientes em Gerenciar).
describe('DOC-01 — "Completar a ficha" só para quem edita a cliente', () => {
  it('o link pede a marca, e a tela a dá por Clientes em Gerenciar', () => {
    expect(fonte('components/shared/painel-de-documentos.tsx')).toMatch(/l\.podeCompletar && l\.clienteId/)
    expect(fonte('app/_shared/documentos-emitidos.tsx')).toMatch(/can\(ctx, 'clients', 'MANAGE'\)/)
  })
})

// automacoes.md (D-2, o Heitor, 2026-10-29): "quem não tem 'A rede inteira'
// não as alcança, tenha o módulo que tiver".
describe('AUT-02 — as leituras das automações são só de quem tem a rede inteira', () => {
  const leituras: [string, string][] = [
    ['actions/automacoes.ts', 'listarAutomacoes'], ['actions/automacoes.ts', 'getAutomacao'],
    ['actions/automacoes.ts', 'versoesDaAutomacao'], ['actions/automacoes.ts', 'opcoesDoEditor'],
    ['actions/automacoes.ts', 'amostraDoEvento'], ['actions/automacoes.ts', 'listarExecucoes'],
    ['actions/automacoes.ts', 'passosDaExecucao'], ['actions/automacoes.ts', 'contarBuscaDeClientes'],
    ['actions/automacoes.ts', 'contarAntesDeLigar'],
    ['actions/eventos.ts', 'listarEventosDeDominio'], ['actions/eventos.ts', 'resumoDoCatalogo'],
  ]
  it.each(leituras)('%s → %s', (arquivo, nome) => {
    expect(corpo(arquivo, nome)).toContain('assertDaRede(ctx)')
  })
})

// automacoes.md: Ver dá as leituras (o histórico, as versões, os limites);
// editar e ligar é de Gerenciar.
describe('AUT-03 — quem só vê abre Execuções, Versões e Limites', () => {
  it('o segmento das gavetas não fica atrás do podeEditar', () => {
    const f = fonte('components/admin/automacoes/editor.tsx')
    const barra = f.slice(f.indexOf('{/* -- Barra'), f.indexOf('{antesDeLigar && ('))
    const segmento = barra.indexOf('className="auto-segmento"')
    expect(segmento).toBeGreaterThan(0)
    // O último `{podeEditar && (` aberto antes do segmento fecha antes dele.
    const antes = barra.slice(0, segmento)
    const abre = antes.lastIndexOf('{podeEditar && (')
    expect(abre < 0 || antes.indexOf(')}', abre) > 0).toBe(true)
  })
})

// automacoes.md (CF2): o lugar é Automações → "O que já aconteceu".
describe('AUT-04 — o ensaio sem fato aponta o lugar que existe', () => {
  it('nada de "Configurações → Eventos"', () => {
    expect(fonte('actions/automacoes.ts')).not.toContain('Configurações → Eventos')
    expect(fonte('actions/automacoes.ts')).toContain('Automações → O que já aconteceu')
  })
})
