import { describe, it, expect } from 'vitest'
import { planoParaOTitular, linhaDoPlano, linhaDaComunicacao } from '@/lib/lgpd/plano'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

// A21 da 6ª simulação: o plano saía no pacote LGPD sem itens nem valor, e a
// comunicação, no PDF, sem a hora.
describe('o plano e as comunicações no pacote LGPD', () => {
  const plano = planoParaOTitular({
    created_at: '2026-11-03T13:00:00Z', status: 'ACCEPTED', branch_id: 'b1',
    treatment_plan_sessions: [
      { sort_order: 1, treatment_plan_session_procedures: [{ price: 300, procedures: { name: 'Limpeza' } }] },
      { sort_order: 0, treatment_plan_session_procedures: [{ price: '800', procedures: { name: 'Botox' } }, { price: 1200, procedures: { name: 'Preenchimento' } }] },
    ],
  }, 'Aceito', 'Moinhos')
  it('as sessões na ordem, com os procedimentos e os valores, e o total', () => {
    expect(plano.total).toBe(2300)
    expect(plano.sessoes).toEqual([
      { numero: 1, procedimentos: [{ procedimento: 'Botox', valor: 800 }, { procedimento: 'Preenchimento', valor: 1200 }] },
      { numero: 2, procedimentos: [{ procedimento: 'Limpeza', valor: 300 }] },
    ])
  })
  it('a linha do PDF diz cada sessão; a comunicação diz o dia e a hora (Brasília)', () => {
    const linha = linhaDoPlano(plano, () => '03/11/2026').replace(/ /g, ' ')
    expect(linha).toBe('03/11/2026 — Aceito — Moinhos — R$ 2.300,00 — sessão 1: Botox R$ 800,00 + Preenchimento R$ 1.200,00 — sessão 2: Limpeza R$ 300,00')
    expect(linhaDaComunicacao({ created_at: '2026-11-03T13:45:00Z', title: 'Lembrete' })).toBe('03/11/2026, 10:45 — Lembrete')
  })
})

// Sobra da F41 (9ª simulação): o plano CANCELADO saía só com "Cancelado" — sem
// o dia nem o que ele passou a valer (o usado), como o pacote cancelado diz.
describe('o plano cancelado no pacote LGPD', () => {
  const plano = planoParaOTitular({
    created_at: '2026-11-03T13:00:00Z', status: 'CANCELLED', branch_id: 'b1',
    cancelado_em: '2026-11-07T15:00:00Z', valor_cancelado: 1500,
    treatment_plan_sessions: [
      { sort_order: 0, treatment_plan_session_procedures: [{ price: 800, procedures: { name: 'Botox' } }] },
      { sort_order: 1, treatment_plan_session_procedures: [{ price: 1500, procedures: { name: 'Preenchimento' } }] },
    ],
  }, 'Cancelado', 'Moinhos')
  it('diz quando, o que valeu (as sessões feitas) e o que caiu', () => {
    expect(plano.cancelamento).toEqual({ em: '2026-11-07T15:00:00Z', valorUsado: 800, valorQueCaiu: 1500 })
  })
  it('a linha do PDF diz o cancelamento', () => {
    const linha = linhaDoPlano(plano, v => (v.startsWith('2026-11-07') ? '07/11/2026' : '03/11/2026')).replace(/ /g, ' ')
    expect(linha).toContain('cancelado em 07/11/2026: valeu R$ 800,00 (as sessões feitas); as que sobraram (R$ 1.500,00) saíram do plano')
  })
  it('o plano que não foi cancelado não tem cancelamento', () => {
    expect(planoParaOTitular({ created_at: '2026-11-03T13:00:00Z', status: 'ACCEPTED', branch_id: null }, 'Aceito', null).cancelamento).toBeNull()
  })
})

describe('o pacote da LGPD leva a ficha do procedimento legível, no JSON e no PDF (princípio 3)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  const ROWS = [
    { id: 'r1', fields: [{ id: 'area', type: 'text', label: 'Área tratada' }] },
    { id: 'r2', fields: [{ id: 'cuidados', type: 'checkbox', label: 'Cuidados', options: ['Gelo', 'Protetor'] }] },
    { id: 'r3', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Mapa de aplicação', options: ['Toxina'] }] },
    { id: 'r4', fields: [{ id: 'foto', type: 'photo', label: 'Foto de antes' }] },
  ]
  const MAPA = {
    view: 'rosto_f', planejamento: { id: 'p1', nome: 'Toxina testa' }, retratoEm: '2026-11-18T13:00:00.000Z',
    points: [
      { id: 'a', x: 0.1, y: 0.1, product: 'Toxina', dose: 4, unit: 'U', applied: null, regiao: 'glabela' },
      { id: 'b', x: 0.2, y: 0.2, product: 'Toxina', dose: 2, unit: 'U', applied: null },
    ],
  }
  const RESPOSTAS = { area: 'Testa', cuidados: ['Gelo', 'Protetor'], mapa: MAPA, foto: 'tenant/abc/cliente/foto.jpg' }

  describe('a ficha do procedimento sai no pacote da LGPD, pergunta a pergunta', () => {
    it('lê o formato que a conclusão e o salvar gravam ({ name, rows, answers })', async () => {
      const { fichaDoProcedimentoLegivel } = await import('@/lib/lgpd/prontuario-legivel')
      const f = fichaDoProcedimentoLegivel({ formId: 'f1', name: 'Ficha de toxina', rows: ROWS, answers: RESPOSTAS })
      expect(f?.ficha).toBe('Ficha de toxina')
      expect(f?.respostas.map(r => r.pergunta)).toEqual(['Área tratada', 'Cuidados', 'Mapa de aplicação', 'Foto de antes'])
      expect(f?.respostas[0]).toEqual({ pergunta: 'Área tratada', resposta: 'Testa' })
      expect(f?.respostas[1]).toEqual({ pergunta: 'Cuidados', resposta: 'Gelo, Protetor' })
    })
    it('o formato em português ({ nome, respostas }) também, para não perder nenhuma gravação', async () => {
      const { fichaDoProcedimentoLegivel } = await import('@/lib/lgpd/prontuario-legivel')
      const f = fichaDoProcedimentoLegivel({ nome: 'Ficha antiga', rows: ROWS, respostas: { area: 'Queixo' } })
      expect(f).toEqual({ ficha: 'Ficha antiga', respostas: [{ pergunta: 'Área tratada', resposta: 'Queixo' }] })
    })
    it('o mapa de aplicação sai legível: os pontos, o produto e a quantidade — nunca "[object Object]"', async () => {
      const { fichaDoProcedimentoLegivel } = await import('@/lib/lgpd/prontuario-legivel')
      const f = fichaDoProcedimentoLegivel({ name: 'Ficha de toxina', rows: ROWS, answers: RESPOSTAS })!
      const mapa = f.respostas.find(r => r.pergunta === 'Mapa de aplicação')!
      expect(mapa.resposta).toBe('Toxina testa: 2 pontos — Toxina 6 U (planejado)')
      expect(mapa.pontos).toEqual([
        { regiao: 'glabela', produto: 'Toxina', dose: 4, unidade: 'U', aplicada: null },
        { regiao: null, produto: 'Toxina', dose: 2, unidade: 'U', aplicada: null },
      ])
      expect(JSON.stringify(f)).not.toContain('[object Object]')
      // A foto não mostra o caminho do arquivo (J-65: nada de id).
      expect(f.respostas.find(r => r.pergunta === 'Foto de antes')?.resposta).toBe('Foto anexada')
      expect(JSON.stringify(f)).not.toContain('foto.jpg')
    })
    it('o mapa aplicado diz o aplicado, e o sem ponto diz que não há ponto', async () => {
      const { respostasLegiveis } = await import('@/lib/lgpd/prontuario-legivel')
      const aplicado = { ...MAPA, points: MAPA.points.map(p => ({ ...p, applied: p.dose })) }
      expect(respostasLegiveis({ rows: ROWS }, { mapa: aplicado })[0]!.resposta).toBe('Toxina testa: 2 pontos — Toxina 6 U (aplicado)')
      expect(respostasLegiveis({ rows: ROWS }, { mapa: { ...MAPA, points: [] } })[0]!.resposta).toBe('Toxina testa: nenhum ponto marcado')
    })
    it('o PDF traz a ficha pergunta a pergunta, com os pontos do mapa', async () => {
      const { linhasDaFichaNoPdf, fichaDoProcedimentoLegivel } = await import('@/lib/lgpd/prontuario-legivel')
      const linhas = linhasDaFichaNoPdf(fichaDoProcedimentoLegivel({ name: 'Ficha de toxina', rows: ROWS, answers: RESPOSTAS }))
      expect(linhas).toEqual([
        '   Ficha de toxina:',
        '      Área tratada: Testa',
        '      Cuidados: Gelo, Protetor',
        '      Mapa de aplicação: Toxina testa: 2 pontos — Toxina 6 U (planejado)',
        '         glabela: Toxina 4 U',
        '         ponto 2: Toxina 2 U',
        '      Foto de antes: Foto anexada',
      ])
      expect(linhasDaFichaNoPdf(null)).toEqual([])
    })
    it('o pacote usa a leitura única no JSON e no PDF (era f.nome/f.respostas, e o PDF não tinha a ficha)', () => {
      const f = ler('lib/lgpd/export.ts')
      expect(f).not.toMatch(/f\.nome \?\? 'Ficha de atendimento'/)
      expect(f).toMatch(/fichaDoProcedimentoLegivel\(/)
      expect(f).toMatch(/linhasDaFichaNoPdf\(/)
    })
  })

  describe('o PDF da LGPD sem nome de coluna e sem "Versão anterior" repetida', () => {
    it('a categoria do anexo sai por extenso no PDF', () => {
      const f = ler('lib/lgpd/export.ts')
      expect(f).not.toMatch(/String\(d\.category \?\? 'sem categoria'\)/)
      expect(f).toMatch(/CATEGORIA_DO_ANEXO\[d\.category as string\] \?\? 'Outro'\}\)\$\{d\.apagado_em/)
      // O canal da assinatura também (era "(clinica)").
      expect(f).not.toMatch(/String\(assinatura\.channel\)\.toLowerCase\(\)/)
    })
    it('cada versão diz o que AQUELA correção trocou (a ficha e a evolução corrigidas em dois passos não se repetem)', async () => {
      const { linhasDasVersoesNoPdf } = await import('@/lib/lgpd/prontuario-legivel')
      const fichaVelha = { name: 'Ficha', rows: ROWS, answers: { area: 'Testa' } }
      const fichaNova  = { name: 'Ficha', rows: ROWS, answers: { area: 'Queixo' } }
      const linhas = linhasDasVersoesNoPdf(
        [
          { evolucao: 'Aplicado sem intercorrência', intercorrencias: null, ficha: fichaVelha, editada_por_nome: 'Ana', substituida_em: 'T1' },
          { evolucao: 'Aplicado sem intercorrência', intercorrencias: null, ficha: fichaNova,  editada_por_nome: 'Ana', substituida_em: 'T2' },
        ],
        { evolucao: 'Aplicado; retorno em 15 dias', intercorrencias: null, ficha: fichaNova },
        (v: string | null | undefined) => `[${v}]`,
      )
      expect(linhas).toEqual([
        '   Versão anterior: corrigido por Ana em [T1]; a ficha de atendimento dizia: Área tratada: Testa',
        '   Versão anterior: corrigido por Ana em [T2]; a evolução dizia: Aplicado sem intercorrência',
      ])
    })
  })

})
