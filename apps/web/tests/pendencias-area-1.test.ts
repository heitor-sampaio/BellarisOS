import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AnamnesisRow } from '@/lib/anamnesis'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * As pendências das simulações 15ª–23ª, área 1 (atendimento, agenda, plano e
 * app da cliente), levantadas em 36aaeeb6:
 * - 15ª A7: o atendimento não avisava da ficha de saúde nunca respondida, e o
 *   Finalizar barrava pelas obrigatórias dela.
 * - 15ª A33 = 16ª A11: com o envio automático desligado, o app não oferecia a
 *   ficha a quem tem atendimento marcado.
 * - 23ª A21 (resto): o plano novo do Planejamento se perdia ao fechar a janela.
 * - 23ª A24: dois desenhos de cartão na Minha agenda.
 * - 23ª A38: o Agendar do app dizia só "Incluído".
 * - 21ª: a sessão de um plano aceito e não recebido dizia "Incluído".
 * - 22ª A20: o editor do plano não tinha desconto do plano.
 * - 22ª A42: o Remarcar do app não marcava os dias livres nem listava quem realiza.
 * - 22ª A40 (resto): o aviso aberto sumia do sino.
 * - 18ª A29 (resto): o Desativar não marcava a unidade no "Atende" de quem atende em outra.
 */

const raiz = join(__dirname, '..')
const fonte = (arq: string) => readFileSync(join(raiz, arq), 'utf8')
const migrations = join(raiz, '..', '..', 'supabase', 'migrations')

const campo = (id: string, required = true) => ({ id, type: 'text' as const, label: id.toUpperCase(), required })
const rows: AnamnesisRow[] = [
  { id: 'r1', fields: [campo('alergia'), campo('medicamentos')] },
  { id: 'r2', fields: [campo('obs', false)] },
]

// ─── 15ª A7 ────────────────────────────────────────────────────────────────
describe('15ª A7: a faixa da ficha de saúde não respondida no atendimento', () => {
  it('diz quantas obrigatórias faltam', async () => {
    const { avisoDaFichaNaoRespondida } = await import('@/lib/atendimento/obrigatorias')
    expect(avisoDaFichaNaoRespondida('Ana', null, rows)).toBe('A ficha de saúde de Ana ainda não foi respondida (2 obrigatórias).')
    expect(avisoDaFichaNaoRespondida('Ana', null, [{ id: 'r', fields: [campo('a')] }])).toBe('A ficha de saúde de Ana ainda não foi respondida (1 obrigatória).')
    expect(avisoDaFichaNaoRespondida('Ana', null, [{ id: 'r', fields: [campo('a', false)] }])).toBe('A ficha de saúde de Ana ainda não foi respondida.')
  })
  it('some com a ficha respondida ou sem pergunta', async () => {
    const { avisoDaFichaNaoRespondida } = await import('@/lib/atendimento/obrigatorias')
    const respondida = { versao: 2 as const, ficha: { formId: 'f', nome: 'F', rows }, respostas: { alergia: 'Não' }, respondidoEm: null, origem: 'EQUIPE' as const, respondidoPor: null }
    expect(avisoDaFichaNaoRespondida('Ana', respondida, rows)).toBeNull()
    expect(avisoDaFichaNaoRespondida('Ana', null, [])).toBeNull()
  })
  it('a tela mostra a faixa com "Responder aqui" e o envio do link', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toContain('data-ficha-nao-respondida')
    expect(s).toContain('avisoDaFichaNaoRespondida(')
    expect(s).toContain('<PreAtendimentoDoAgendamento')
  })
})

// ─── 15ª A33 = 16ª A11 ─────────────────────────────────────────────────────
describe('15ª A33 = 16ª A11: o app oferece a ficha de saúde a quem tem atendimento marcado', () => {
  const agora = new Date('2026-11-17T12:00:00.000Z')
  const base = { pendente: false, proximoAgendamentoId: 'ag1', temFichaAtiva: true, ultimaResposta: null, validadeMeses: 6, agora }
  it('sem ficha válida e com atendimento futuro, oferece pelo agendamento', async () => {
    const { ofereceAFichaNoApp } = await import('@/lib/pre-atendimento/oferta-no-app')
    expect(ofereceAFichaNoApp(base)).toBe('ag1')
    expect(ofereceAFichaNoApp({ ...base, ultimaResposta: '2026-01-01T12:00:00.000Z' })).toBe('ag1')
  })
  it('não oferece com a ficha válida, com o pendente, sem atendimento ou sem ficha na rede', async () => {
    const { ofereceAFichaNoApp } = await import('@/lib/pre-atendimento/oferta-no-app')
    expect(ofereceAFichaNoApp({ ...base, ultimaResposta: '2026-10-01T12:00:00.000Z' })).toBeNull()
    expect(ofereceAFichaNoApp({ ...base, pendente: true })).toBeNull()
    expect(ofereceAFichaNoApp({ ...base, proximoAgendamentoId: null })).toBeNull()
    expect(ofereceAFichaNoApp({ ...base, temFichaAtiva: false })).toBeNull()
  })
  it('o pendente nasce no clique da cliente, pela função do envio manual', () => {
    const a = fonte('actions/pre-atendimento-cliente.ts')
    expect(a).toContain('export async function abrirMinhaFichaDeSaude')
    expect(a).toContain("'pre_atendimento_abrir_manual'")
    expect(fonte('app/[slug]/cliente/home/page.tsx')).toContain('ofereceAFichaNoApp(')
  })
})

// ─── 23ª A21 (resto) ───────────────────────────────────────────────────────
function armazem(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) },
  }
}

describe('23ª A21 (resto): o plano novo fica no rascunho da aba', () => {
  const plano = {
    sessions: [{ procedures: [{ procedureId: 'p1', name: 'Limpeza', price: 150, products: [{ productId: 'x', name: 'Gel', unit: 'ml', quantity: 2 }] }] }],
    notes: 'três sessões',
  }
  it('grava, lê e limpa por cliente e atendimento', async () => {
    const r = await import('@/lib/atendimento/rascunho')
    const a = armazem()
    const chave = r.chaveDoPlanoNaoSalvo('cli', 'ag')
    r.gravarPlanoNaoSalvo(chave, plano, a)
    expect(r.lerPlanoNaoSalvo(chave, a)).toEqual(plano)
    expect(r.lerPlanoNaoSalvo(r.chaveDoPlanoNaoSalvo('cli', null), a)).toBeNull()
    r.limparPlanoNaoSalvo(chave, a)
    expect(r.lerPlanoNaoSalvo(chave, a)).toBeNull()
  })
  it('o plano vazio não fica guardado, e o lixo não volta', async () => {
    const r = await import('@/lib/atendimento/rascunho')
    const a = armazem()
    const chave = r.chaveDoPlanoNaoSalvo('cli', null)
    r.gravarPlanoNaoSalvo(chave, { sessions: [{ procedures: [] }], notes: '  ' }, a)
    expect(a.length).toBe(0)
    a.setItem(chave, JSON.stringify({ sessions: [{ procedures: [{ procedureId: 1 }] }], notes: 3 }))
    expect(r.lerPlanoNaoSalvo(chave, a)).toBeNull()
  })
  it('o Planejamento usa o rascunho, e o botão vira secundário', () => {
    const p = fonte('components/branch/planejamento-tratamento.tsx')
    expect(p).toContain('gravarPlanoNaoSalvo(')
    expect(p).toContain('lerPlanoNaoSalvo(')
    expect(p).toContain('limparPlanoNaoSalvo(')
    expect(fonte('components/branch/appointment-session.tsx'))
      .toMatch(/setPlanejamentoAberto\('tratamento'\)\} className="btn-secondary"/)
  })
})

// ─── 23ª A24 ───────────────────────────────────────────────────────────────
describe('23ª A24: um desenho só de cartão na Minha agenda', () => {
  it('o cartão nasce num lugar só', () => {
    const s = fonte('components/branch/professional-agenda.tsx')
    expect(s.match(/data-cartao-minha-agenda=/g)?.length).toBe(1)
  })
})

// ─── 23ª A38 ───────────────────────────────────────────────────────────────
describe('23ª A38: o Agendar do app diz o que está incluído', () => {
  it('mostra o texto de jaPago abaixo do nome', () => {
    const s = fonte('components/client-portal/new-appointment-wizard.tsx')
    expect(s).toContain('data-ja-pago')
    expect(s).toMatch(/\{p\.jaPago\}/)
  })
})

// ─── 21ª "Incluído" sem valor ──────────────────────────────────────────────
describe('21ª: a sessão do plano ainda não recebido não parece paga', () => {
  it('o texto diz a receber, e o valor só a quem vê o valor', async () => {
    const t = await import('@/lib/appointments/pago-antes-textos')
    const { formatBRL } = await import('@estetica-os/utils')
    expect(t.textoDoPlanoAReceber(450, { mostraOValor: true })).toBe(`Sessão do plano · a receber no PDV (${formatBRL(450)})`)
    expect(t.textoDoPlanoAReceber(450, { mostraOValor: false })).toBe('Sessão do plano · a receber no PDV')
    expect(t.textoDoPlanoAReceber(450, { mostraOValor: true, daCliente: true })).toBe(`Sessão do plano · a pagar na unidade (${formatBRL(450)})`)
  })
  it('o rótulo da janela segue o texto', async () => {
    const t = await import('@/lib/appointments/pago-antes-textos')
    expect(t.rotuloDoPagoAntes('Sessão do plano · a receber no PDV')).toBe('A receber')
    expect(t.rotuloDoPagoAntes('Sessão do plano · a pagar na unidade (R$ 1,00)')).toBe('A receber')
    expect(t.rotuloDoPagoAntes('Pré-pago · 1 de 2')).toBe('Incluído')
  })
  it('a janela da agenda e o pagosAntes usam os textos', () => {
    expect(fonte('components/branch/appointment-sheet.tsx')).toContain('rotuloDoPagoAntes(')
    expect(fonte('lib/appointments/pago-antes.ts')).toContain('textoDoPlanoAReceber(')
  })
})

// ─── 22ª A20 ───────────────────────────────────────────────────────────────
describe('22ª A20: o desconto do plano no editor', () => {
  it('lê o combinado e faz a conta', async () => {
    const d = await import('@/lib/plano-de-tratamento/desconto-combinado')
    expect(d.combinadoDoPlano({ desconto_combinado_tipo: 'VALOR', desconto_combinado_valor: '30' })).toEqual({ tipo: 'VALOR', valor: 30 })
    expect(d.combinadoDoPlano({ desconto_combinado_tipo: null, desconto_combinado_valor: 0 })).toBeNull()
    expect(d.totalComOCombinado(450, { tipo: 'VALOR', valor: 30 })).toEqual({ reais: 30, total: 420 })
    expect(d.totalComOCombinado(450, { tipo: 'PERCENTUAL', valor: 10 })).toEqual({ reais: 45, total: 405 })
    expect(d.totalComOCombinado(450, null)).toEqual({ reais: 0, total: 450 })
    expect(d.estadoDoCombinado({ tipo: 'PERCENTUAL', valor: 10 })).toEqual({ tipo: 'PERCENTUAL', texto: '10' })
    expect(d.estadoDoCombinado({ tipo: 'VALOR', valor: 30.5 })).toEqual({ tipo: 'VALOR', texto: '30,50' })
  })
  it('a migration guarda o combinado no plano', () => {
    const arq = join(migrations, '20261123100001_plano_desconto_combinado.sql')
    expect(existsSync(arq)).toBe(true)
    const sql = readFileSync(arq, 'utf8')
    expect(sql).toContain('desconto_combinado_tipo')
    expect(sql).toContain('gerar_plano_da_avaliacao')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('o editor, as actions, o checkout e o app usam o combinado', () => {
    const e = fonte('components/branch/treatment-plan-editor.tsx')
    expect(e).toContain('data-desconto-do-plano')
    expect(e).toContain('getDesconto')
    expect(fonte('actions/treatment-plans.ts')).toContain('desconto_combinado_valor')
    expect(fonte('components/branch/checkout-wizard.tsx')).toContain('descontoCombinado')
    expect(fonte('app/[slug]/cliente/planos/[id]/page.tsx')).toContain('totalComOCombinado(')
  })
})

// O Heitor (coordenador, 2026-11-18), princípio 3: o combinado vale em TODA
// tela a partir do aceite — aplicado nos preços NA transação do aceite.
describe('22ª A20: o desconto combinado se aplica no aceite', () => {
  const doAceite = () => {
    const arq = readdirSync(migrations).find(f => /^202611231\d{5}_.*\.sql$/.test(f) && f !== '20261123100001_plano_desconto_combinado.sql'
      && readFileSync(join(migrations, f), 'utf8').includes('function public.plano_aceitar'))
    return arq ? readFileSync(join(migrations, arq), 'utf8') : ''
  }
  it('o plano_aceitar aplica o combinado pelo plano_aplicar_desconto, na mesma função', () => {
    const sql = doAceite()
    expect(sql).toContain('create or replace function public.plano_aceitar')
    expect(sql).toContain('desconto_combinado_valor')
    expect(sql).toContain('public.plano_aplicar_desconto(')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('depois do aceite, o app da cliente não aplica o combinado de novo (os preços já são os vendidos)', () => {
    const p = fonte('app/[slug]/cliente/planos/[id]/page.tsx')
    expect(p).toContain('const combinado = proposto ? totalComOCombinado(')
    expect(p).not.toContain('aindaSemReceber')
  })
  it('o aviso do aceite pelo app diz o valor com o combinado', () => {
    expect(fonte('actions/plano-da-cliente.ts')).toContain('totalComOCombinado(')
  })
  it('o receber parte do preço de ANTES (preco_tabela): repetir o desconto não o aplica duas vezes', () => {
    const d = fonte('lib/checkout/desconto-do-plano.ts')
    expect(d).toContain('p.preco_tabela ?? p.price')
  })
})

// ─── 22ª A42 ───────────────────────────────────────────────────────────────
describe('22ª A42: o Remarcar do app marca os dias livres e lista quem realiza', () => {
  it('os próximos dias a partir de hoje', async () => {
    const { proximosDias } = await import('@/lib/appointments/dias-livres')
    expect(proximosDias('2026-11-29', 4)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
  })
  it('as actions e a tela', () => {
    const a = fonte('actions/portal-agendamentos.ts')
    expect(a).toContain('export async function quemRealizaNoRemarcar')
    expect(a).toContain('export async function diasLivresParaRemarcar')
    const t = fonte('components/client-portal/alterar-agendamento.tsx')
    expect(t).toContain('data-com-quem')
    expect(t).toContain('data-dias-livres')
  })
})

// ─── 22ª A40 (resto) ───────────────────────────────────────────────────────
describe('22ª A40 (resto): o aviso aberto fica no sino', () => {
  it('a lista traz os lidos, e o clique não tira da lista', () => {
    const a = fonte('actions/notifications.ts')
    const lista = a.slice(a.indexOf('export async function getClientNotifications'), a.indexOf('export async function markAllNotificationsReceived'))
    expect(lista).not.toContain(".eq('is_read', false)")
    const b = fonte('components/client-portal/notification-bell.tsx')
    expect(b).not.toContain('prev.filter(x => x.id !== n.id)')
    expect(b).toContain('data-lida')
  })
})

// ─── 18ª A29 (resto) ───────────────────────────────────────────────────────
describe('18ª A29 (resto): marcar a unidade no "Atende" pela janela do Desativar', () => {
  it('o repasse leva os ids, a action passa pelo núcleo da Equipe, a janela tem o botão', () => {
    const r = fonte('lib/equipe/repasse.ts')
    expect(r).toMatch(/emOutraUnidade: \{ id: string; nome: string; unidades: string\[\] \}\[\]/)
    expect(r).toContain('unidadeId:')
    const t = fonte('actions/team.ts')
    expect(t).toContain('export async function marcarUnidadeNoAtende')
    expect(t).toMatch(/updateTeamMember\(undefined, /)
    const d = fonte('components/admin/desativar-membro.tsx')
    expect(d).toContain('data-marcar-no-atende')
    expect(d).toContain('marcarUnidadeNoAtende(')
  })
})

describe('a faixa da ficha de saúde não respondida conta o que está na TELA (princípio 3)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('a contagem das obrigatórias', () => {
    const obrig = (id: string, required = true) => ({ id, type: 'text' as const, label: id.toUpperCase(), required })
    const linhas = [{ id: 'r1', fields: [obrig('alergia'), obrig('medicamentos'), obrig('obs', false)] }]
    it('a contagem desce com o que se digita, e some quando nada obrigatório falta', async () => {
      const { avisoDaFichaNaoRespondida } = await import('@/lib/atendimento/obrigatorias')
      expect(avisoDaFichaNaoRespondida('Ana', null, linhas)).toBe('A ficha de saúde de Ana ainda não foi respondida (2 obrigatórias).')
      expect(avisoDaFichaNaoRespondida('Ana', null, linhas, { alergia: 'Nenhuma' }))
        .toBe('A ficha de saúde de Ana ainda não foi respondida (1 obrigatória).')
      expect(avisoDaFichaNaoRespondida('Ana', null, linhas, { alergia: 'Nenhuma', medicamentos: 'Nenhum' })).toBeNull()
      // Nada digitado ainda: como antes.
      expect(avisoDaFichaNaoRespondida('Ana', null, linhas, {})).toBe('A ficha de saúde de Ana ainda não foi respondida (2 obrigatórias).')
    })
    it('a tela passa as respostas digitadas', () => {
      const s = ler('components/branch/appointment-session.tsx')
      expect(s).toMatch(/avisoDaFichaNaoRespondida\(nomeParaSaudar\(client\.name\), anamnesis, fichaPreAtendimento\.rows, anamneseDigitada\)/)
    })
  })
})
