import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Entrada de estoque é só por estoque_entrada / estoque_inicial / estoque_ajuste
 * (docs/regras/atendimento.md, "O que nunca fazer"): a linha do saldo travada,
 * tudo numa transação. Até 2026-10-21 o createProduct gravava movimento, saldo,
 * lote e despesa soltos (a simulação de um dia de clínica viu). Nenhum código
 * dos apps insere movimento ou lote direto pelo PostgREST.
 */
const WEB = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next', 'e2e', 'tests', 'android', '.sim', 'public'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('estoque', () => {
  it('ninguém insere movimento ou lote direto', () => {
    const fora = arquivos(WEB).filter(f => /from\(\s*'(stock_movements|product_batches)'\s*\)\s*\.\s*(insert|upsert)/.test(fs.readFileSync(f, 'utf8')))
    expect(fora.map(f => path.relative(WEB, f))).toEqual([])
  })
})

// Os motivos da perda (o Heitor, 18/11: "motivos de perda configuraveis, poder
// adicionar/editar/excluir"): deixam de ser a lista fixa e viram um cadastro da
// rede, ao lado das categorias, marcas e fornecedores; a perda vai pela função
// (`estoque_perda_em`), que grava o motivo da rede.
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')
const MIGRATIONS = join(WEB, '..', '..', 'supabase', 'migrations')
const migracaoDoEstoque = (trecho: string) => {
  const nome = readdirSync(MIGRATIONS).find(f => f.startsWith('202612011') && f.includes(trecho))
  return nome ? readFileSync(join(MIGRATIONS, nome), 'utf8') : null
}
const UUID = '0b7c2a8e-6f1d-4c3a-9e2b-5d4f3a2b1c0d'

describe('os motivos da perda são um cadastro da rede (atendimento.md §9.5)', () => {
  const sql = () => {
    const s = migracaoDoEstoque('motivos_de_perda')
    expect(s, 'a migration 202612011…_estoque_motivos_de_perda.sql').not.toBeNull()
    return s!
  }

  it('a tabela é da rede, com o nome único sem caixa nem espaços', () => {
    const s = sql()
    expect(s).toMatch(/create table if not exists public\.estoque_motivos_de_perda/)
    expect(s).toMatch(/tenant_id\s+uuid not null references public\.tenants\(id\) on delete cascade/)
    expect(s).toMatch(/on public\.estoque_motivos_de_perda \(tenant_id, public\.chave_do_nome\(nome\)\)/)
  })

  it('a sessão não lê nem grava (tabela nova nasce sem política permissiva), e o suporte não grava', () => {
    const s = sql()
    expect(s).toMatch(/enable row level security/)
    // O Heitor, 19/11 (CLAUDE.md §4): a sessão nunca grava e só lê SINAIS.
    expect(s).not.toMatch(/create policy (?!suporte_sem_escrita_)\w+ on public\.estoque_motivos_de_perda/)
    expect(s).not.toMatch(/for (select|insert|update|delete|all) to (authenticated|anon|public)/)
    for (const p of ['suporte_sem_escrita_ins', 'suporte_sem_escrita_upd', 'suporte_sem_escrita_del'])
      expect(s).toMatch(new RegExp(`create policy ${p} on public\\.estoque_motivos_de_perda as restrictive`))
  })

  it('a rede nasce com os motivos de hoje, como linhas editáveis (as que existem e as novas)', () => {
    const s = sql()
    expect(s).toMatch(/private\.estoque_motivos_de_perda_semear\(p_tenant uuid\)/)
    for (const nome of ['Vencido', 'Quebrou', 'Amostra', 'Uso interno']) expect(s).toContain(`'${nome}'`)
    expect(s).toMatch(/after insert on public\.tenants/)
    expect(s).toMatch(/select private\.estoque_motivos_de_perda_semear\(t\.id\) from public\.tenants t/)
  })

  it('excluir não apaga a história: o movimento guarda o NOME e a ligação vira nula', () => {
    const s = sql()
    expect(s).toMatch(/add column if not exists motivo_da_perda_id uuid/)
    expect(s).toMatch(/references public\.estoque_motivos_de_perda\(id\) on delete set null/)
    // A lista fixa sai do banco: o motivo gravado é o nome; a perda continua exigindo um.
    expect(s).toMatch(/drop constraint if exists stock_movements_motivo_da_perda_check/)
    expect(s).toMatch(/type <> 'LOSS'/)
    // As perdas de antes ganham o nome e a ligação.
    expect(s).toMatch(/when 'USO_INTERNO' then 'Uso interno'/)
  })

  it('sem chave estrangeira para duas tabelas na chave primária (PGRST201)', () => {
    const s = sql()
    const tabela = s.match(/create table if not exists public\.estoque_motivos_de_perda \(([\s\S]*?)\r?\n\);/)
    expect(tabela).not.toBeNull()
    expect((tabela![1]!.match(/references/g) ?? []).length).toBe(1)
  })

  it('a perda grava o motivo da REDE (pelo id, ou pelo nome) no corpo vivo de estoque_perda_em', () => {
    const s = sql()
    expect(s).toMatch(/pg_temp\.trocar_no_corpo\(\s*'public\.estoque_perda_em\(uuid,uuid,uuid,numeric,boolean,text,text,text\)'::regprocedure/)
    expect(s).toMatch(/from public\.estoque_motivos_de_perda mp/)
    expect(s).toMatch(/join public\.products p on p\.id = p_produto and p\.tenant_id = mp\.tenant_id/)
    expect(s).toMatch(/\(private\.motivo_da_perda_de\(p_produto, p_motivo\)\)\.id is null/)
    expect(s).toMatch(/motivo_da_perda, motivo_da_perda_id\)/)
  })

  it('o relatório de perdas agrupa pelo motivo (o nome de hoje; o excluído, o gravado) e traz os lotes', () => {
    const s = sql()
    expect(s).toMatch(/drop function if exists public\.metrics_perdas\(uuid, uuid\[\], timestamptz, timestamptz\)/)
    expect(s).toMatch(/coalesce\(mp\.nome, m\.motivo_da_perda\)/)
    expect(s).toMatch(/lotes jsonb/)
    expect(s).toMatch(/revoke execute on function public\.metrics_perdas\(uuid, uuid\[\], timestamptz, timestamptz\) from public, anon, authenticated/)
    expect(s.trim()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('o nome que a tela mostra é o gravado; os motivos do sistema têm o rótulo deles', async () => {
    const { rotuloDoMotivo, lerMotivoDaPerda, MOTIVOS_INICIAIS_DA_PERDA } = await import('@/lib/estoque/perda')
    expect(MOTIVOS_INICIAIS_DA_PERDA).toEqual(['Vencido', 'Quebrou', 'Amostra', 'Uso interno'])
    expect(rotuloDoMotivo('Frasco aberto vencido')).toBe('Frasco aberto vencido')
    expect(rotuloDoMotivo('INVENTARIO')).toBe('Inventário')
    expect(rotuloDoMotivo('BRINDE')).toBe('Brinde da fidelidade')
    expect(rotuloDoMotivo('VENDA_ESTORNADA')).toBe('Venda estornada (não voltou)')
    expect(rotuloDoMotivo('USO_INTERNO'), 'a chave de antes ainda se lê').toBe('Uso interno')
    expect(rotuloDoMotivo(null)).toBe('—')
    expect(lerMotivoDaPerda(UUID)).toBe(UUID)
    expect(lerMotivoDaPerda('VENCIDO'), 'o formulário manda o id do motivo da rede').toBeNull()
  })

  it('o cadastro é o das categorias, marcas e fornecedores: quem tem o Estoque em Gerenciar', () => {
    const acoes = ler('actions/stock.ts')
    expect(acoes).toMatch(/export type ListaDoEstoque = 'categorias' \| 'marcas' \| 'fornecedores' \| 'motivos'/)
    expect(acoes).toMatch(/motivos:\s+\{ tabela: 'estoque_motivos_de_perda'/)
    const janela = ler('components/admin/cadastro-do-estoque.tsx')
    expect(janela).toMatch(/motivos: \{\s+titulo: 'Motivos de perda'/)
    for (const pagina of ['app/admin/estoque/page.tsx', 'app/[slug]/estoque/page.tsx'])
      expect(ler(pagina), pagina).toMatch(/<CadastroDoEstoque lista="motivos" itens=\{listas\.motivos\} \/>/)
    expect(ler('lib/estoque/produtos-da-tela.ts')).toMatch(/from\('estoque_motivos_de_perda'\)/)
  })

  it('a Perda escolhe entre os motivos da rede (não a lista fixa)', () => {
    const modal = ler('components/admin/admin-stock-manage-modal.tsx')
    expect(modal).not.toContain('MOTIVOS_DA_PERDA')
    expect(modal).toMatch(/motivosDePerda\.map\(m => <option key=\{m\.id\} value=\{m\.id\}>\{m\.nome\}<\/option>\)/)
  })
})
