import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * A tag é da PESSOA (o Heitor, 18/11, noite: "a tag é da pessoa e pode ter
 * mais de uma tag"): UMA lista por pessoa — a ficha (`clients.tags`) e os
 * contatos dela (`contacts.tags`), mantidos iguais pelo banco —, marcada em
 * qualquer tela (ficha, painel do inbox, card da oportunidade) e válida em
 * todo filtro. A oportunidade não tem tag própria.
 *
 * E a conversa que chega pelo telefone de UMA ficha ativa se liga sozinha a
 * ela (o Heitor, 18/11, noite: "sim, liga sozinha quando bater com uma ficha
 * só"). Regra em docs/regras/crm-inbox.md §9.2.1.
 */

const WEB = resolve(__dirname, '..')
const MIGRATIONS = resolve(WEB, '../../supabase/migrations')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')
const lerMigration = (nome: string) => {
  const arq = join(MIGRATIONS, nome)
  return existsSync(arq) ? readFileSync(arq, 'utf8') : ''
}
/** O SQL sem os comentários (o texto explica o que mudou e cita o velho). */
const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '')

describe('as tags da pessoa — os ajudantes puros', async () => {
  const mod = await import('@/lib/tags/pessoa').catch(() => null)

  it('o módulo existe', () => {
    expect(mod, 'lib/tags/pessoa.ts').not.toBeNull()
  })

  it('juntarTags: sem repetir, sem distinguir a caixa, a primeira grafia vence', () => {
    expect(mod!.juntarTags(['VIP', 'Noiva'], ['vip', ' Botox ', ''])).toEqual(['VIP', 'Noiva', 'Botox'])
    expect(mod!.juntarTags([], null)).toEqual([])
  })

  it('a pessoa da oportunidade é a ficha; sem ficha, o contato', () => {
    expect(mod!.pessoaDaOportunidade({ client_id: 'c1', contato_id: 'k1' })).toEqual({ tabela: 'clients', id: 'c1' })
    expect(mod!.pessoaDaOportunidade({ client_id: null, contato_id: 'k1' })).toEqual({ tabela: 'contacts', id: 'k1' })
    expect(mod!.pessoaDaOportunidade({ client_id: null, contato_id: null })).toBeNull()
  })

  it('as tags do card são as da pessoa (o embed vem como objeto ou lista)', () => {
    expect(mod!.tagsDaPessoaDaOportunidade({
      client_id: 'c1', pessoa_ficha: { tags: ['VIP'] }, pessoa_contato: { tags: ['Outra'] },
    })).toEqual(['VIP'])
    expect(mod!.tagsDaPessoaDaOportunidade({
      client_id: null, pessoa_ficha: null, pessoa_contato: [{ tags: ['Noiva'] }],
    })).toEqual(['Noiva'])
    expect(mod!.tagsDaPessoaDaOportunidade({ client_id: null })).toEqual([])
  })

  it('o embed usa as chaves da oportunidade (sem ambiguidade de PGRST201)', () => {
    expect(mod!.EMBED_TAGS_DA_PESSOA).toContain('clients!leads_client_id_fkey(tags)')
    expect(mod!.EMBED_TAGS_DA_PESSOA).toContain('contacts!leads_contato_id_fkey(tags)')
  })
})

describe('a oportunidade não tem tag própria (o código)', () => {
  it('o núcleo não grava tag na oportunidade', () => {
    expect(ler('lib/crm/oportunidade.ts')).not.toMatch(/^\s*tags,?\s*$/m)
  })

  it('o painel do inbox não manda as tags para a oportunidade ao salvar o card', () => {
    expect(ler('components/admin/inbox-lead-panel.tsx')).not.toMatch(/fd\.set\('tags'/)
  })

  it('criar e editar a oportunidade gravam as tags na pessoa', () => {
    const src = ler('actions/leads.ts')
    expect(src).not.toMatch(/patch\.tags\s*=/)
    expect(src).not.toMatch(/from\('leads'\)\.select\('tags'\)/)
    expect(src).toMatch(/gravarTagsDaOportunidade/)
  })

  it('o quadro lê as tags da pessoa', () => {
    for (const p of ['app/[slug]/oportunidades/page.tsx', 'app/admin/oportunidades/page.tsx']) {
      expect(ler(p), p).toMatch(/EMBED_TAGS_DA_PESSOA/)
    }
  })

  it('a linha do tempo, a automação e a prévia do movimento leem as da pessoa', () => {
    expect(ler('lib/lead-events.ts')).toMatch(/EMBED_TAGS_DA_PESSOA/)
    expect(ler('lib/automacoes/contexto.ts')).toMatch(/EMBED_TAGS_DA_PESSOA/)
    expect(ler('lib/crm/automacoes-do-movimento.ts')).toMatch(/EMBED_TAGS_DA_PESSOA/)
  })

  it('"Adicionar tag" grava na pessoa — a ficha, ou o contato da oportunidade', () => {
    const src = ler('lib/automacoes/acoes-crm.ts')
    const corpo = src.slice(src.indexOf('export async function adicionarTagAoCliente'), src.indexOf('export async function removerTagDoCliente'))
    expect(corpo).toMatch(/somarTagNaPessoa/)
    expect(corpo).not.toMatch(/from\('clients'\)\.update/)
  })

  it('a importação não tem mais "Tags da oportunidade" (a coluna vai para a pessoa)', () => {
    expect(ler('lib/importacao/campos.ts')).not.toMatch(/op_tags/)
  })

  it('nenhum arquivo do app lê ou grava leads.tags', () => {
    const achados: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === 'node_modules' || nome === '.next' || nome === '.sim' || nome === 'e2e' || nome === 'tests') continue
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) { varrer(p); continue }
        if (!/\.(ts|tsx)$/.test(nome)) continue
        const src = readFileSync(p, 'utf8')
        // .from('leads') … select/update/insert com `tags` na mesma instrução
        const re = /from\('leads'\)[\s\S]{0,400}?\.(select|update|insert|upsert)\(\s*(['`{])[^)]*?\btags\b/g
        if (re.test(src)) achados.push(p.slice(WEB.length + 1))
      }
    }
    for (const d of ['app', 'actions', 'lib', 'components']) varrer(join(WEB, d))
    expect(achados).toEqual([])
  })
})

describe('a migration aditiva (20261125500001)', () => {
  const m1 = lerMigration('20261125500001_tags_da_pessoa.sql')
  const sql = semComentarios(m1)

  it('existe e termina recarregando o schema', () => {
    expect(m1).not.toBe('')
    expect(m1.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('a ligação é contacts.client_id, e não existe a volta clients.contato_id', () => {
    expect(sql).toMatch(/alter table public\.contacts\s+add column if not exists client_id uuid references public\.clients\(id\) on delete set null/)
    expect(sql).not.toMatch(/alter table public\.clients\s+add column[^;]*contato_id/)
  })

  it('um lugar só liga, e nunca religa o contato que já é de outra ficha', () => {
    const corpo = sql.slice(sql.indexOf('function private.ligar_contato_a_ficha'))
    expect(corpo.slice(0, 600)).toMatch(/k\.client_id is null/)
  })

  it('os espelhos: a ficha e os contatos dela com a mesma lista, e juntam ao se ligar', () => {
    expect(sql).toMatch(/after update of tags on public\.clients/)
    expect(sql).toMatch(/after insert or update of tags, client_id on public\.contacts/)
    expect(sql).toMatch(/juntar_tags\(new\.tenant_id, c\.tags, new\.tags\)/)
  })

  it('toda tag gravada sai com o nome do vocabulário', () => {
    expect(sql).toMatch(/before insert or update of tags on public\.clients/)
    expect(sql).toMatch(/before insert or update of tags on public\.contacts/)
    expect(sql).toMatch(/from public\.tags v where v\.tenant_id = p_tenant and lower\(v\.nome\) = lower/)
  })

  it('a conversa liga sozinha à ficha quando o telefone bate com UMA ficha ativa', () => {
    expect(m1).toContain('sim, liga sozinha quando bater com uma ficha só')
    const corpo = sql.slice(sql.indexOf('function private.ficha_unica_do_telefone'))
    expect(corpo).toMatch(/public\.fichas_do_telefone\(p_tenant, v_chave\) f\s+where f\.ativa/)
    expect(corpo).toMatch(/cardinality\(v_fichas\), 0\) <> 1/)
    // a régua da importação (D11): nacional de 10 ou 11 dígitos, ou o de fora com "+"
    expect(corpo).toMatch(/length\(v_chave\) not in \(10, 11\)/)
    expect(sql).toMatch(/after insert or update of client_id, contato_id, contact_phone on public\.conversations/)
    expect(sql).toMatch(/set client_id = v_ficha\s+where c\.id = p_conversa and c\.client_id is null/)
  })

  it('o público das campanhas é E, como todo filtro de tag', () => {
    expect(sql).toMatch(/clientes_do_publico\(uuid,jsonb\)/)
    expect(sql).toMatch(/\$t\$\(f\.tags is null or c\.tags && f\.tags\)\$t\$/)
    expect(sql).toMatch(/not exists \(select 1 from unnest\(c\.tags\) x\(t\) where lower\(btrim\(x\.t\)\) = lower\(btrim\(q\.t\)\)\)/)
  })

  it('o Copilot compara a tag pelo nome do vocabulário', () => {
    expect(sql).toMatch(/@> private\.juntar_tags\(p_tenant, array\[p_tag\], null\)/)
  })

  it('a sessão só LÊ o contato e a ficha', () => {
    expect(sql).toMatch(/drop policy if exists contacts_operacional on public\.contacts/)
    expect(sql).toMatch(/create policy contacts_select on public\.contacts\s+for select to authenticated/)
    expect(sql).toMatch(/drop policy if exists clients_insert on public\.clients/)
    expect(sql).toMatch(/drop policy if exists clients_update on public\.clients/)
  })

  it('as funções novas fechadas à sessão', () => {
    for (const f of ['juntar_tags', 'ligar_contato_a_ficha', 'ficha_unica_do_telefone', 'ligar_conversa_a_ficha']) {
      expect(sql, f).toMatch(new RegExp(`revoke execute on function private\\.${f}\\([^)]*\\) from public, anon, authenticated`))
    }
  })

  it('a oportunidade de quem tem ficha nasce com o contato da ficha (antes do telefone)', () => {
    expect(sql).toMatch(/fn_oportunidade_ganha_contato\(\)'::regprocedure/)
    expect(sql).toMatch(/where k\.client_id = new\.client_id/)
  })

  it('a ponte leva a tag do card velho para a pessoa', () => {
    expect(sql).toMatch(/after insert or update of tags on public\.leads/)
  })
})

describe('a migration que tira a tag da oportunidade (20261125500002)', () => {
  const m2 = lerMigration('20261125500002_tags_da_pessoa_sem_a_da_oportunidade.sql')
  const sql = semComentarios(m2)

  it('existe e termina recarregando o schema', () => {
    expect(m2).not.toBe('')
    expect(m2.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('tira a ponte, a coluna e o que contava as tags das oportunidades', () => {
    expect(sql).toMatch(/drop trigger if exists trg_tag_da_oportunidade_vai_para_a_pessoa on public\.leads/)
    expect(sql).toMatch(/drop function if exists public\.lead_tags_da_rede/)
    expect(sql).toMatch(/alter table public\.leads drop column if exists tags/)
  })

  it('renomear a tag não passa mais pelas oportunidades', () => {
    expect(sql).toMatch(/renomear_tag\(uuid,uuid,text\)'::regprocedure/)
    expect(sql).toMatch(/update public\.leads r set tags/)
  })

  it('o uso da tag conta PESSOAS (sem a coluna "oportunidades")', () => {
    const corpo = sql.slice(sql.indexOf('create function public.tags_da_rede'))
    expect(corpo).not.toBe('')
    expect(corpo.slice(0, 400)).not.toMatch(/oportunidades/)
    expect(sql).toMatch(/revoke execute on function public\.tags_da_rede\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.tags_da_rede\(uuid\) to service_role/)
  })
})

/**
 * Os três `?tags=` (Financeiro, Agenda, Relatórios) com o MESMO leitor
 * (`lib/tags/filtro-na-url.ts`): a vírgula do nome vai escapada (`%2C`), e a
 * tag "Pacote, 10x" não se parte em duas em tela nenhuma (decisão do Claude,
 * ajuste 6 da revisão das tags, 18/11).
 */
describe('o ?tags= das telas — um leitor só', async () => {
  const relatorio = await import('@/lib/metrics/tags-do-relatorio')
  const agenda = await import('@/lib/agenda/filtros')
  const url = await import('@/lib/tags/filtro-na-url')

  it('os Relatórios leem e escrevem a tag com vírgula inteira', () => {
    expect(relatorio.tagsDaUrl('VIP,Pacote%2C 10x')).toEqual(['VIP', 'Pacote, 10x'])
    expect(relatorio.tagsNaUrl(['Pacote, 10x', 'VIP'])).toBe('Pacote%2C 10x,VIP')
    expect(relatorio.tagsNaUrl([])).toBeNull()
  })

  it('a Agenda também: o que ela escreve na URL ela lê de volta', () => {
    const vocabulario = ['VIP', 'Pacote, 10x']
    expect(agenda.lerTagsDaUrl('Pacote%2C 10x,VIP', vocabulario)).toEqual(['Pacote, 10x', 'VIP'])
    const busca = agenda.buscaComFiltro('', { tags: ['Pacote, 10x', 'VIP'] })
    expect(agenda.lerTagsDaUrl(new URLSearchParams(busca).get('tags') ?? '', vocabulario)).toEqual(['Pacote, 10x', 'VIP'])
    expect(agenda.literalDeTags(['a"b', 'Pacote, 10x'])).toBe(url.literalDeArrayDoPostgres(['a"b', 'Pacote, 10x']))
  })

  it('as duas telas usam os ajudantes de lib/tags/filtro-na-url.ts', () => {
    expect(ler('lib/metrics/tags-do-relatorio.ts')).toMatch(/from '@\/lib\/tags\/filtro-na-url'/)
    expect(ler('lib/agenda/filtros.ts')).toMatch(/from '@\/lib\/tags\/filtro-na-url'/)
  })
})
