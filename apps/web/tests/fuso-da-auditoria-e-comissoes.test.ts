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

describe('numa rede de dois relógios, cada linha da Auditoria e do CSV das comissões no fuso da unidade dela (F62)', () => {
  const SP = 'America/Sao_Paulo'
  const CB = 'America/Cuiaba'
  const WEB = path.resolve(__dirname, '..')
  const fonte = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8')

  describe('a Auditoria: cada linha no fuso da unidade dela, e a sem unidade no da rede', () => {
    const reg = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
      id: 1, criado_em: '2026-11-18T22:47:00.000Z', branch_id: 'cuiaba', client_id: null, tabela: 'procedures', operacao: 'criou',
      registro_id: 'p1', colunas: [], antes: {}, depois: { name: 'Peeling' }, ator_user_id: 'u1', ator_nome: 'Lia', ator_tipo: 'membro',
      incompleto: false, ...x,
    })
    const nomes: NomesDaAuditoria = {
      clientes: {}, membros: {}, unidades: { cuiaba: 'Cuiabá Centro', bueno: 'Setor Bueno' },
      fusos: { cuiaba: CB, bueno: SP }, fusoDaRede: SP,
    }

    it('sem filtro (o recorte em Brasília), a linha de Cuiabá diz 18:47 e o relógio', async () => {
      const { gruposDaAuditoria, linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
      const [g] = gruposDaAuditoria([reg({})], nomes, '/admin/auditoria', null, SP)
      expect(g!.quando).toBe('18/11/2026 18:47')
      expect(g!.relogio).toBe('horário de Cuiabá')
      const [c] = linhasDoCsvDaAuditoria([reg({})], nomes, SP)
      expect(c!.quando).toBe('18/11/2026 18:47')
      expect(c!.relogio).toBe('horário de Cuiabá')
    })

    it('a de Goiânia, 19:47 sem nota; a sem unidade, no fuso da rede (mesmo filtrada por Cuiabá)', async () => {
      const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
      const [g] = gruposDaAuditoria([reg({ branch_id: 'bueno' })], nomes, '/admin/auditoria', null, SP)
      expect(g!.quando).toBe('18/11/2026 19:47')
      expect(g!.relogio).toBeNull()
      const [daRede] = gruposDaAuditoria([reg({ branch_id: null, tabela: 'tags', depois: { nome: 'VIP' } })], nomes, '/admin/auditoria', null, CB)
      expect(daRede!.quando).toBe('18/11/2026 19:47')
    })

    it('a tela mostra o relógio da linha, e o CSV o traz numa coluna', () => {
      expect(fonte('app', '_shared', 'auditoria.tsx')).toMatch(/l\.relogio/)
      const csv = fonte('app', 'api', 'auditoria', 'csv', 'route.ts')
      expect(csv).toMatch(/'Quando;Quem;O quê;Gravação;Unidade;Relógio'/)
      expect(csv).toMatch(/l\.relogio/)
      expect(fonte('lib', 'auditoria', 'leitura.ts')).toMatch(/fusoDaRede:/)
    })
  })

  describe('o CSV das comissões: cada linha no fuso da unidade dela', () => {
    it('a Hora e as datas da linha de Cuiabá saem no relógio de Cuiabá; o fechamento, no da rede', async () => {
      const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
      const linha = {
        id: 'x', professionalId: 'p', branchId: 'cuiaba', releasedAt: '2026-11-18T22:21:00.000Z', kind: 'LIBERACAO', motivo: null, amount: 10, status: 'OPEN',
        payoutId: null, appointmentId: null, scheduledAt: '2026-11-19T03:30:00.000Z', cliente: null, procedimento: null, origem: null, preco: null,
        regraTipo: null, regraValor: null, pacote: null, descontaTaxa: false, descontaInsumos: false, previsto: null,
        baseComPontos: null, plano: null, base: null, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
      } as unknown as Parameters<typeof csvDoExtrato>[0][number]
      const corpo = sp(csvDoExtrato([linha], new Map(), new Map([['cuiaba', 'Cuiabá Centro']]), SP, [], new Map([['cuiaba', CB]])).split('\r\n')[1]!)
      // 18:21 (não 19:21); o atendimento das 23:30 de Cuiabá é do dia 18 (não 19).
      expect(corpo.startsWith('18/11/2026;18:21;;Cuiabá Centro;18/11/2026;')).toBe(true)
    })

    it('a tela manda o fuso de cada unidade ao CSV e às datas da linha', () => {
      const tela = fonte('components', 'shared', 'financeiro-comissoes.tsx')
      // Os pagamentos (os fechamentos) no fuso da rede, como a tela (D3 da 23ª); as linhas pelo mapa.
      expect(tela).toMatch(/csvDoExtrato\(p\.extrato, nome, unidade, p\.fusoDaRede \?\? fuso, p\.fechamentos, fusos\)/)
      expect(tela).toMatch(/data\(l\.releasedAt, fusoDe\(l\)\)/)
      expect(fonte('app', '_shared', 'comissoes-da-equipe.tsx')).toMatch(/fusosDasUnidades=/)
    })
  })

})
