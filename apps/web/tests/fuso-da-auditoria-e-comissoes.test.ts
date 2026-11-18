import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'
import { fraseDaAuditoria, gruposDaAuditoria, linhasDoCsvDaAuditoria } from '@/lib/auditoria/frase'
import { textoDoFechamento } from '@/lib/comissoes/extrato-texto'

/**
 * D2 e D3 da 23ª simulação (2026-11-17), numa rede de Campo Grande (UTC−4).
 *
 * D2 [3, F62b]: a Auditoria dizia a hora de Brasília — a coluna "Quando" (o
 * fechamento das 18:36 às 19:36), o "Agendou … para 19/11/2026 17:00" de um
 * agendamento das 16:00 e o CSV. `quandoDaAuditoria` tem o fuso opcional, e
 * ninguém o passava. A coluna vai no fuso do portal; a hora do agendamento
 * citado, no fuso da unidade dele.
 *
 * D3 [3, D12]: os "Últimos fechamentos" das comissões diziam "até 17/11/2026 às
 * 19:37" (Brasília) com o CSV em 18:37: as três datas vão no fuso da rede.
 */

const CG = 'America/Campo_Grande'
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: 1, criado_em: '2026-11-17T22:36:00.000Z', branch_id: 'bC', client_id: 'cB', tabela: 'appointments', operacao: 'criou',
  registro_id: 'a1', colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Vítor', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cB: 'Bianca Lopes' }, membros: {}, unidades: { bC: 'Centro' }, fusos: { bC: CG },
}

describe('D2: a Auditoria no fuso', () => {
  it('"Agendou … para" diz a hora no fuso da unidade do agendamento', () => {
    const frase = fraseDaAuditoria(r({ depois: { scheduled_at: '2026-11-19T20:00:00.000Z' } }), nomes)
    expect(sp(frase)).toBe('Agendou Bianca Lopes para 19/11/2026 16:00')
  })

  it('"Remarcou … para" também', () => {
    const frase = fraseDaAuditoria(r({ operacao: 'editou', colunas: ['scheduled_at'], depois: { scheduled_at: '2026-11-18T14:00:00.000Z' } }), nomes)
    expect(sp(frase)).toBe('Remarcou o agendamento de Bianca Lopes para 18/11/2026 10:00')
  })

  it('a coluna "Quando" da tela e do CSV vai no fuso que a tela passa', () => {
    const reg = r({ tabela: 'tags', client_id: null, branch_id: null, depois: { nome: 'VIP' } })
    expect(gruposDaAuditoria([reg], nomes, '/admin/auditoria', null, CG)[0]!.quando).toBe('17/11/2026 18:36')
    expect(linhasDoCsvDaAuditoria([reg], nomes, CG)[0]!.quando).toBe('17/11/2026 18:36')
  })

  it('a tela e o CSV passam o fuso (o helper tem o fuso opcional, e ninguém o passava)', () => {
    const WEB = path.resolve(__dirname, '..')
    const tela = fs.readFileSync(path.join(WEB, 'app', '_shared', 'auditoria.tsx'), 'utf8')
    const csv = fs.readFileSync(path.join(WEB, 'app', 'api', 'auditoria', 'csv', 'route.ts'), 'utf8')
    expect(tela).toMatch(/gruposDaAuditoria\([^)]*,\s*fuso\)/)
    expect(csv).toMatch(/linhasDoCsvDaAuditoria\([^)]*,\s*fuso\)/)
    // A frase não chama o quando sem o fuso (a hora do agendamento é da unidade dele).
    const frase = fs.readFileSync(path.join(WEB, 'lib', 'auditoria', 'frase.ts'), 'utf8')
    expect(frase.match(/quandoDaAuditoria\([^,()]+\)/g) ?? []).toEqual([])
  })
})

describe('D3: os "Últimos fechamentos" no fuso da rede', () => {
  it('o início, o fim com a hora e o pago, as três no fuso', () => {
    const texto = textoDoFechamento({
      inicio: '2026-11-17T04:00:00.000Z', fim: '2026-11-17T22:37:00.000Z', paidAt: '2026-11-17T22:37:30.000Z',
    }, CG)
    // A29 da 24ª: o pago também diz a hora (no fuso da rede).
    expect(sp(texto)).toBe('lançamentos de 17/11/2026 até 17/11/2026 às 18:37, pago em 17/11/2026 às 18:37')
  })

  it('a linha do fechamento usa o texto com o fuso', () => {
    const tela = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'shared', 'financeiro-comissoes.tsx'), 'utf8')
    expect(tela).not.toMatch(/data\(f\.(inicio|fim)\)|hora\(f\.fim\)/)
    expect(tela).toMatch(/textoDoFechamento\(f, fusoDaRede\)/)
  })
})
