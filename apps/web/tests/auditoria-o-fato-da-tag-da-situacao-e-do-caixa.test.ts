import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * plataforma:AD-13 (princípio 3: o registro diz o que aconteceu). A Auditoria
 * dizia "Apagou a tag" ao juntar duas tags (tags:TG-08, "Não existe apagar
 * tag"), "Editou a unidade (ativo)" ao desativar a unidade, "Editou a automação
 * (situação)" ao ligá-la, "Criou o fundo de troco" e "Pagou R$ 380,00 (Pix)"
 * sem dizer qual despesa.
 */

let id = 9900
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T14:00:00.000Z', branch_id: 'bJ', client_id: null, tabela: 'branches', operacao: 'editou',
  registro_id: 'bJ', colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Heloísa', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cV: 'Vilma' }, membros: {}, unidades: { bJ: 'Jacarandá Manaus' },
  lancamentos: { ft1: { tipo: 'EXPENSE', valor: 380, forma: 'PIX', parcela: null, de: null, descricao: 'Conta de luz', categoria: 'Energia' } },
}
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const frase = async (x: Partial<RegistroDaAuditoria>) => {
  const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
  return sp(fraseDoGrupo([r(x)], nomes))
}

describe('A4: juntar a tag é juntar, não apagar', () => {
  it('a tag juntada sozinha', async () => {
    expect(await frase({ tabela: 'tags', operacao: 'apagou', branch_id: null, registro_id: 't1', antes: { nome: 'vip' } }))
      .toBe('Juntou a tag vip à que já existia com o mesmo nome')
  })
  it('a tag juntada com as fichas e os contatos que a tinham', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'tags', operacao: 'apagou', branch_id: null, registro_id: 't1', antes: { nome: 'vip' } }),
      r({ tabela: 'clients', branch_id: null, client_id: 'cV', registro_id: 'cV', colunas: ['tags'] }),
      r({ tabela: 'clients', branch_id: null, client_id: 'cX', registro_id: 'cX', colunas: ['tags'] }),
      r({ tabela: 'contacts', branch_id: null, registro_id: 'k1', colunas: ['tags'] }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Juntou a tag vip à que já existia com o mesmo nome (2 fichas e 1 contato)')
  })
})

describe('A4: a junção diz em qual tag ela entrou', () => {
  it('com o destino que renomear_tag grava, a frase diz "em" qual', async () => {
    expect(await frase({ tabela: 'tags', operacao: 'apagou', branch_id: null, registro_id: 't1', antes: { nome: 'vip' }, depois: { juntada_em: 'VIP' } }))
      .toBe('Juntou a tag vip em VIP')
  })
  it('com as fichas e os contatos que a tinham', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'tags', operacao: 'apagou', branch_id: null, registro_id: 't1', antes: { nome: 'Noiva' }, depois: { juntada_em: 'Noivas' } }),
      r({ tabela: 'clients', branch_id: null, client_id: 'cV', registro_id: 'cV', colunas: ['tags'] }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Juntou a tag Noiva em Noivas (1 ficha)')
  })
  it('a migration: renomear_tag diz o destino ao gatilho só em volta do apagar, e o gatilho o grava só no apagar de tags', () => {
    const dir = path.resolve(__dirname, '../../../supabase/migrations')
    const nome = fs.readdirSync(dir).find(n => n.startsWith('20261206600001_'))
    expect(nome, 'a migration da faixa 20261206600001').toBeTruthy()
    const sql = fs.readFileSync(path.join(dir, nome!), 'utf8')
    expect(sql).toMatch(/perform set_config\('bellaris\.tag_juntada_em', v_final, true\);\s*delete from public\.tags where id = p_tag;\s*perform set_config\('bellaris\.tag_juntada_em', '', true\);/)
    expect(sql).toMatch(/when tg_op = 'DELETE' and v_tab = 'tags' and coalesce\(current_setting\('bellaris\.tag_juntada_em', true\), ''\) <> ''/)
    expect(sql).toMatch(/plan_cache_mode = force_generic_plan/)
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe('A5: desativar, reativar, arquivar, ligar e desligar são o fato', () => {
  it('a unidade', async () => {
    expect(await frase({ colunas: ['is_active'], antes: { name: 'Jacarandá Manaus', is_active: true }, depois: { name: 'Jacarandá Manaus', is_active: false } }))
      .toBe('Desativou a unidade Jacarandá Manaus')
    expect(await frase({ colunas: ['is_active'], antes: { name: 'Jacarandá Manaus', is_active: false }, depois: { name: 'Jacarandá Manaus', is_active: true } }))
      .toBe('Reativou a unidade Jacarandá Manaus')
  })
  it('a automação', async () => {
    const a = { tabela: 'automations', branch_id: null, registro_id: 'a1', colunas: ['status'] }
    expect(await frase({ ...a, antes: { nome: 'Lembrete', status: 'PAUSADA' }, depois: { nome: 'Lembrete', status: 'ATIVA' } }))
      .toBe('Ligou a automação Lembrete')
    expect(await frase({ ...a, antes: { nome: 'Lembrete', status: 'RASCUNHO' }, depois: { nome: 'Lembrete', status: 'ATIVA' } }))
      .toBe('Ligou a automação Lembrete')
    expect(await frase({ ...a, antes: { nome: 'Lembrete', status: 'ATIVA' }, depois: { nome: 'Lembrete', status: 'PAUSADA' } }))
      .toBe('Desligou a automação Lembrete')
  })
  it('o procedimento, a origem e a sala (com o que mais mudou junto)', async () => {
    expect(await frase({ tabela: 'procedures', registro_id: 'p1', colunas: ['is_active', 'price'], antes: { name: 'Limpeza de pele', is_active: true, price: 100 }, depois: { name: 'Limpeza de pele', is_active: false, price: 120 } }))
      .toBe('Desativou o procedimento Limpeza de pele (e editou: preço)')
    expect(await frase({ tabela: 'crm_origens', branch_id: null, registro_id: 'o1', colunas: ['ativo'], antes: { nome: 'Instagram', ativo: true }, depois: { nome: 'Instagram', ativo: false } }))
      .toBe('Desativou a origem Instagram')
    expect(await frase({ tabela: 'rooms', registro_id: 's1', colunas: ['is_active'], antes: { name: 'Sala 2', is_active: false }, depois: { name: 'Sala 2', is_active: true } }))
      .toBe('Reativou a sala Sala 2 em Jacarandá Manaus')
  })
  it('a ficha da cliente arquivada e reativada', async () => {
    const c = { tabela: 'clients', branch_id: null, client_id: 'cV', registro_id: 'cV', colunas: ['is_active'] }
    expect(await frase({ ...c, antes: { is_active: true }, depois: { is_active: false } })).toBe('Arquivou a ficha de Vilma')
    expect(await frase({ ...c, antes: { is_active: false }, depois: { is_active: true } })).toBe('Reativou a ficha de Vilma')
  })
  it('a tag arquivada e reativada', async () => {
    const t = { tabela: 'tags', branch_id: null, registro_id: 't1', colunas: ['arquivada_em'] }
    expect(await frase({ ...t, antes: { nome: 'VIP', arquivada_em: null }, depois: { nome: 'VIP', arquivada_em: '2026-11-25T14:00:00Z' } }))
      .toBe('Arquivou a tag VIP')
    expect(await frase({ ...t, antes: { nome: 'VIP', arquivada_em: '2026-11-25T14:00:00Z' }, depois: { nome: 'VIP', arquivada_em: null } }))
      .toBe('Reativou a tag VIP')
  })
  it('a fidelidade ligada e desligada', async () => {
    const f = { tabela: 'loyalty_configs', branch_id: null, registro_id: 'l1', colunas: ['enabled'] }
    expect(await frase({ ...f, antes: { enabled: false }, depois: { enabled: true } })).toBe('Ligou a fidelidade')
    expect(await frase({ ...f, antes: { enabled: true }, depois: { enabled: false } })).toBe('Desligou a fidelidade')
  })
})

describe('A6: o fundo de troco e a despesa paga dizem o fato', () => {
  it('o fundo de troco informado e trocado', async () => {
    const f = { tabela: 'fundos_de_troco', registro_id: 'f1' }
    expect(await frase({ ...f, operacao: 'criou', colunas: [], depois: { valor: 300 } })).toBe('Informou o fundo de troco de R$ 300,00')
    expect(await frase({ ...f, colunas: ['valor', 'informado_em'], antes: { valor: 200 }, depois: { valor: 300 } }))
      .toBe('Informou o fundo de troco de R$ 300,00 (era R$ 200,00)')
  })
  it('a despesa paga diz qual', async () => {
    expect(await frase({ tabela: 'financial_transactions', registro_id: 'ft1', colunas: ['paid_at', 'is_paid', 'payment_method'], antes: { paid_at: null, is_paid: false }, depois: { paid_at: '2026-11-25T14:00:00Z', is_paid: true, payment_method: 'PIX' } }))
      .toBe('Pagou a despesa Conta de luz (R$ 380,00, Pix)')
  })
})
