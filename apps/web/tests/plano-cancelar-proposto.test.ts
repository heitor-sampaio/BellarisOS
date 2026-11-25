import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  cancelaSemDinheiro, recusaDoCancelamentoSemDinheiro, EntradaDoCancelamentoProposto,
  RECUSA_DO_PLANO_CANCELADO, RECUSA_DO_PLANO_CANCELADO_NO_APP, AVISO_DO_CANCELAMENTO_PROPOSTO,
} from '@/lib/plano-de-tratamento/cancelar-proposto'
import { retratoDoCancelamento } from '@/lib/plano-de-tratamento/retrato-do-cancelamento'
import { historicoDoCancelamento } from '@/lib/pacotes/cancelamento'

/**
 * A1a da 25ª simulação: o plano PROPOSTO (mandado à cliente, ainda não aceito)
 * e o rascunho não tinham "Cancelar" — só o aceito se cancelava (o "Cancelar
 * plano", do Financeiro em Gerenciar, com o dinheiro). O Heitor, 18/11, à
 * pergunta "o plano proposto e ainda não aceito não tem um botão 'Cancelar'.
 * Entra?": "sim".
 *
 * O proposto não tem dinheiro ("Uma coisa só foi vendida se foi paga."): é só
 * fechar o plano, com o motivo (o do aceito pede), por quem MONTA o plano
 * (`montaPlano`), numa função do banco (os documentos pendentes caem pelo
 * gatilho `documentos_do_plano_cancelado`, na mesma transação).
 */
const WEB = join(__dirname, '..')
const MIGRATION = join(WEB, '../../supabase/migrations/20261125400001_plano_cancelar_proposto.sql')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8').replace(/\r\n/g, '\n')

function corpoDe(arquivo: string, assinatura: string): string {
  const src = ler(arquivo)
  const ini = src.indexOf(assinatura)
  expect(ini, `${assinatura} existe em ${arquivo}`).toBeGreaterThan(-1)
  const fim = src.indexOf('\n}\n', ini)
  return src.slice(ini, fim)
}

describe('A1a: quais planos se cancelam sem dinheiro', () => {
  it('o rascunho e o proposto, e só eles', () => {
    expect(cancelaSemDinheiro('DRAFT')).toBe(true)
    expect(cancelaSemDinheiro('PROPOSED')).toBe(true)
    for (const st of ['ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED', null, undefined]) expect(cancelaSemDinheiro(st)).toBe(false)
  })

  it('a recusa diz por quê, e leva o aceito ao "Cancelar plano" do Financeiro', () => {
    expect(recusaDoCancelamentoSemDinheiro('DRAFT')).toBeNull()
    expect(recusaDoCancelamentoSemDinheiro('PROPOSED')).toBeNull()
    expect(recusaDoCancelamentoSemDinheiro('CANCELLED')).toBe('Este plano já foi cancelado.')
    expect(recusaDoCancelamentoSemDinheiro('REJECTED')).toBe('Este plano já foi cancelado.')
    expect(recusaDoCancelamentoSemDinheiro('ACCEPTED')).toMatch(/já foi aceito.*Financeiro em Gerenciar/)
    expect(recusaDoCancelamentoSemDinheiro('COMPLETED')).toMatch(/já foram feitas/)
  })

  it('o motivo é obrigatório, como no cancelamento do aceito (a mesma forma, princípio 7)', () => {
    expect(EntradaDoCancelamentoProposto.safeParse({ motivo: '  ' }).success).toBe(false)
    expect(EntradaDoCancelamentoProposto.safeParse({}).success).toBe(false)
    const ok = EntradaDoCancelamentoProposto.safeParse({ motivo: ' a cliente desistiu ' })
    expect(ok.success && ok.data.motivo).toBe('a cliente desistiu')
    const sem = EntradaDoCancelamentoProposto.safeParse({ motivo: '' })
    expect(!sem.success && sem.error.issues[0]?.message).toBe('Diga o motivo do cancelamento.')
  })

  it('a janela diz que não há dinheiro e o que acontece', () => {
    expect(AVISO_DO_CANCELAMENTO_PROPOSTO).toMatch(/nada foi vendido nem recebido/)
    expect(AVISO_DO_CANCELAMENTO_PROPOSTO).toMatch(/documentos/)
    expect(AVISO_DO_CANCELAMENTO_PROPOSTO).toMatch(/app/)
  })

  it('a cliente que tenta aceitar o cancelado recebe a recusa clara', () => {
    expect(RECUSA_DO_PLANO_CANCELADO).toMatch(/^Este plano foi cancelado e não pode mais ser aceito\./)
    // CA1 (o Heitor, 13/11, "Concordo"; a revisão de 24/11, Q06): a action completa com o nome da rede.
    expect(RECUSA_DO_PLANO_CANCELADO_NO_APP).toMatch(/^Este plano foi cancelado e não pode mais ser aceito\./)
  })
})

describe('A1a: o retrato do proposto cancelado não fala de dinheiro', () => {
  it('"cancelado antes do aceite" e os documentos que caíram — sem "usado" nem "devolver"', () => {
    const r = retratoDoCancelamento({
      cancelado_em: '2026-11-18T23:10:00Z', cancelamento_motivo: 'A cliente desistiu',
      cancelamento: { por: 'Bruna', antes_do_aceite: true, status_anterior: 'PROPOSED', sessoes: 3, documentos: 2 },
    })
    expect(r?.quando).toBe('Cancelado em 18/11/2026 às 20:10, por Bruna.')
    expect(r?.motivo).toBe('A cliente desistiu')
    expect(r?.linhas).toEqual([
      'Cancelado antes do aceite: nada foi vendido nem recebido.',
      '2 documentos que esperavam assinatura foram cancelados.',
    ])
  })

  it('um documento, no singular; nenhum, sem a linha', () => {
    const um = retratoDoCancelamento({ cancelado_em: '2026-11-18T23:10:00Z', cancelamento: { antes_do_aceite: true, documentos: 1 } })
    expect(um?.linhas).toContain('1 documento que esperava assinatura foi cancelado.')
    const nenhum = retratoDoCancelamento({ cancelado_em: '2026-11-18T23:10:00Z', cancelamento: { antes_do_aceite: true, documentos: 0 } })
    expect(nenhum?.linhas).toEqual(['Cancelado antes do aceite: nada foi vendido nem recebido.'])
  })

  it('o Histórico da ficha diz "antes do aceite", não "nada a devolver"', () => {
    const h = historicoDoCancelamento({
      cancelado_em: '2026-11-18T23:10:00Z', cancelamento_motivo: 'A cliente desistiu',
      cancelamento: { antes_do_aceite: true, documentos: 1 },
    }, 'Manchas', v => `R$ ${v}`, 'Plano')
    expect(h).toEqual({
      date: '2026-11-18T23:10:00Z', title: 'Plano cancelado: Manchas',
      subtitle: 'antes do aceite: nada foi vendido nem recebido · Motivo: A cliente desistiu', amount: null,
    })
  })

  it('o aceito cancelado segue com a conta do dinheiro', () => {
    const r = retratoDoCancelamento({ cancelado_em: '2026-11-18T23:10:00Z', cancelamento: { usado: 100, devolver: 0 } })
    expect(r?.linhas.some(l => l.startsWith('Usado, fica com a rede'))).toBe(true)
  })
})

describe('A1a: a action cancela pelo banco, com a trava de quem monta', () => {
  const corpo = () => corpoDe('actions/treatment-plans.ts', 'export async function cancelarPlanoProposto(')

  it('existe, confere a rede/alcance/"só os meus", quem monta e o status ANTES de gravar', () => {
    const c = corpo()
    const rpc = c.indexOf(".rpc('plano_cancelar_proposto'")
    expect(rpc).toBeGreaterThan(-1)
    expect(c.indexOf('EntradaDoCancelamentoProposto.safeParse(')).toBeLessThan(rpc)
    expect(c.indexOf('planoDoTenant(')).toBeLessThan(rpc)
    expect(c.indexOf('montaPlano(')).toBeLessThan(rpc)
    expect(c).toMatch(/return \{ error: RECUSA_QUEM_MONTA \}/)
    expect(c.indexOf('recusaDoCancelamentoSemDinheiro(')).toBeLessThan(rpc)
  })

  it('não grava o plano direto (a função do banco grava tudo junto) e devolve { error } em vez de lançar', () => {
    const c = corpo()
    expect(c).not.toMatch(/\.from\('treatment_plans'\)\s*\.(update|upsert|insert)\(/)
    expect(c).toMatch(/catch \(e\) \{\s*return \{ error: mensagemDoErro\(e\) \}/)
  })

  it('não move a oportunidade nem dispara evento (nada se move sozinho; R12)', () => {
    const c = corpo()
    expect(c).not.toMatch(/leads|lead_events|emitirEvento/)
  })

  it('o aceite da equipe recusa o cancelado com a frase clara', () => {
    const c = corpoDe('actions/treatment-plans.ts', 'export async function aceitarPlano(')
    expect(c).toMatch(/RECUSA_DO_PLANO_CANCELADO/)
    expect(c.indexOf('RECUSA_DO_PLANO_CANCELADO')).toBeLessThan(c.indexOf(".rpc('plano_aceitar'"))
  })

  it('o aceite pelo app recusa o cancelado com a frase clara (era "Plano não encontrado.")', () => {
    const c = corpoDe('actions/plano-da-cliente.ts', 'export async function aceitarPlanoPelaCliente(')
    expect(c).toMatch(/RECUSA_DO_PLANO_CANCELADO_NO_APP/)
    expect(c.indexOf('RECUSA_DO_PLANO_CANCELADO_NO_APP')).toBeLessThan(c.indexOf(".rpc('plano_aceitar'"))
  })

  it('o app não mostra o plano cancelado (a página e o Início leem só o proposto, o aceito e o concluído)', () => {
    expect(ler('app/[slug]/cliente/planos/[id]/page.tsx')).toMatch(/\.in\('status', \['PROPOSED', 'ACCEPTED', 'COMPLETED'\]\)/)
    expect(ler('app/[slug]/cliente/home/page.tsx')).toMatch(/\.in\('status', \['PROPOSED', 'ACCEPTED'\]\)/)
  })
})

describe('A1a: a tela oferece o "Cancelar plano" no rascunho e no proposto, a quem monta', () => {
  it('o botão mora nos botões de quem edita (editavel = monta e não fechado), não nos de quem só recebe', () => {
    const src = ler('components/branch/planejamento-tratamento.tsx')
    const ini = src.indexOf('const botoesDoAceite = editavel && !ehNovo ? (')
    const fimDeQuemMonta = src.indexOf(') : !editavel && podeReceber', ini)
    expect(ini).toBeGreaterThan(-1)
    const deQuemMonta = src.slice(ini, fimDeQuemMonta)
    expect(deQuemMonta).toMatch(/data-cancelar-proposto/)
    const deQuemRecebe = src.slice(fimDeQuemMonta, src.indexOf(') : null', fimDeQuemMonta))
    expect(deQuemRecebe).not.toMatch(/data-cancelar-proposto/)
    expect(src).toMatch(/<CancelarPlanoProposto /)
  })

  it('a janela chama a action e confere o { error }', () => {
    const src = ler('components/branch/cancelar-plano-proposto.tsx')
    expect(src).toMatch(/await cancelarPlanoProposto\(/)
    expect(src).toMatch(/res\.error/)
    expect(src).toMatch(/Motivo do cancelamento \*/)
    expect(src).toMatch(/AVISO_DO_CANCELAMENTO_PROPOSTO/)
  })
})

describe('A1a: a migration', () => {
  const sql = () => readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n')

  it('cria a função fechada ao servidor, com o plano travado, a rede e o status conferidos', () => {
    expect(existsSync(MIGRATION), 'a migration existe').toBe(true)
    const s = sql()
    expect(s).toMatch(/create or replace function public\.plano_cancelar_proposto\(p_tenant uuid, p_plano uuid, p_ator uuid, p_ator_nome text, p_motivo text\)/)
    expect(s).toMatch(/security definer/)
    expect(s).toMatch(/set search_path = ''/)
    expect(s).toMatch(/for update/)
    expect(s).toMatch(/is distinct from p_tenant/)
    expect(s).toMatch(/not in \('DRAFT', 'PROPOSED'\)/)
    expect(s).toMatch(/Diga o motivo do cancelamento\./)
    expect(s).toMatch(/status = 'CANCELLED'/)
    expect(s).toMatch(/'antes_do_aceite', true/)
    expect(s).toMatch(/revoke all on function public\.plano_cancelar_proposto\(uuid, uuid, uuid, text, text\) from public, anon, authenticated;/)
    expect(s).toMatch(/grant execute on function public\.plano_cancelar_proposto\(uuid, uuid, uuid, text, text\) to service_role;/)
    expect(s.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('não mexe em dinheiro, comanda nem oportunidade', () => {
    const s = sql()
    expect(s).not.toMatch(/(insert into|update|delete from) public\.(financial_transactions|comandas|leads|commission_lines)/)
  })

  it('o plano_aceitar recusa o cancelado com a frase clara (trocada no corpo vivo)', () => {
    const s = sql()
    expect(s).toMatch(/pg_temp\.trocar_no_corpo\(\s*'public\.plano_aceitar\(uuid,uuid\)'::regprocedure/)
    expect(s).toMatch(/Este plano foi cancelado e não pode mais ser aceito\./)
  })
})
