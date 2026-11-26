import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * R10 (o Heitor, 26/11, na página de perguntas: "Está no escopo: construir
 * (com os modelos aprovados pela Meta na automação)"; e "Mas eu acho que já
 * está construído os templates de meta, confere."). O "Abrir pelo número
 * padrão", a terceira escolha do "Para quem não tem conversa aberta" do
 * "Mandar mensagem" (AX-06):
 *  - desligado por padrão ("Não mandar", princípio 6);
 *  - no WhatsApp Web (uazapi), a conversa abre com o texto do passo — a rede
 *    escolhendo correr o risco, e a tela diz isso;
 *  - na Cloud API, com um modelo APROVADO da rede (da conta do número padrão)
 *    e as variáveis dele, a partir das variáveis que a automação conhece; sem
 *    o modelo, não manda, e diz por quê;
 *  - a conversa nasce no inbox, com a mensagem, na caixa do número padrão.
 * O modelo escolhido também é o que sai na conversa aberta cuja janela de
 * 24 h fechou (a mensagem dizia "que esta versão ainda não envia").
 */

const fonte = (arquivo: string) => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8')

type Linha = Record<string, unknown>
const banco: Record<string, Linha[]> = {}
function construtor(tabela: string) {
  const filtros: ((l: Linha) => boolean)[] = []
  let uma = false
  const b: Record<string, unknown> = {}
  const cadeia = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => { fn(...a); return b }
  b.select = cadeia(() => {})
  b.eq = cadeia((c, v) => filtros.push(l => l[c as string] === v))
  b.neq = cadeia(() => {})
  b.order = cadeia(() => {})
  b.limit = cadeia(() => {})
  b.maybeSingle = cadeia(() => { uma = true })
  b.then = (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
    const casam = (banco[tabela] ?? []).filter(l => filtros.every(f => f(l)))
    return Promise.resolve({ data: uma ? (casam[0] ?? null) : casam, error: null }).then(ok, falhou)
  }
  return b
}

const notifyClient = vi.fn(async () => {})
const enviarNaConversa = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; mensagemId?: string; error?: string }>>(async () => ({ ok: true, mensagemId: 'm1' }))
const enviarModeloNaConversa = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; mensagemId?: string; error?: string }>>(async () => ({ ok: true, mensagemId: 'm2' }))
const emitir = vi.fn()
let conversaAberta: string | null = null
let padrao: { id: string; label: string; provider: 'uazapi' | 'official'; wabaId: string | null } | null = null
const conversaNoNumero = vi.fn(async () => ({ conversaId: 'cv-nova', criada: true }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/notifications/notify', () => ({ notifyClient: (...a: unknown[]) => notifyClient(...(a as [])) }))
vi.mock('@/lib/contatos/conversa-de-whatsapp', () => ({ conversaDeWhatsappDaCliente: async () => conversaAberta }))
vi.mock('@/lib/inbox/enviar', () => ({
  enviarNaConversa: (...a: unknown[]) => enviarNaConversa(...a),
  enviarModeloNaConversa: (...a: unknown[]) => enviarModeloNaConversa(...a),
}))
vi.mock('@/lib/events/conversa', () => ({ emitirEventoDeConversa: (...a: unknown[]) => emitir(...a) }))
vi.mock('@/lib/automacoes/abrir-pelo-padrao', () => ({
  numeroPadraoDaRede: async () => padrao,
  conversaNoNumero: (...a: unknown[]) => conversaNoNumero(...(a as [])),
}))

const ator = { tenantId: 't1', automacaoId: 'a1', nome: 'Faltou', profundidade: 0 }
const contexto = { cliente: { id: 'cl-judite' } }

function montar() {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.tenants = [{ id: 't1', name: 'Vinca Centro' }]
  banco.clients = [{ id: 'cl-judite', tenant_id: 't1', auth_id: 'auth-judite', name: 'Judite Lopes', phone: '(48) 99911-2233' }]
}

describe('R10: "Abrir pelo número padrão" para quem não tem conversa aberta', () => {
  beforeEach(() => {
    montar()
    conversaAberta = null
    padrao = null
    for (const f of [notifyClient, enviarNaConversa, enviarModeloNaConversa, emitir, conversaNoNumero]) f.mockClear()
  })

  it('no WhatsApp Web (uazapi): abre a conversa no número padrão e manda o texto do passo', async () => {
    padrao = { id: 'n-padrao', label: 'Recepção', provider: 'uazapi', wabaId: null }
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi, Judite!', semConversa: 'abrir_pelo_padrao' })
    expect(conversaNoNumero).toHaveBeenCalledWith('t1', 'cl-judite', expect.objectContaining({ id: 'n-padrao' }))
    expect(enviarNaConversa).toHaveBeenCalledWith('t1', 'cv-nova', 'Oi, Judite!', { id: null, nome: 'Automação · Faltou' })
    expect(enviarModeloNaConversa).not.toHaveBeenCalled()
    expect(r.resumo).toMatchObject({ enviada: true, canal: 'whatsapp', conversaId: 'cv-nova', abriuConversa: true })
    expect(emitir, 'o fato da mensagem enviada sai, como no envio de sempre').toHaveBeenCalledTimes(1)
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('na Cloud API: abre a conversa e manda o MODELO aprovado, com os valores das variáveis', async () => {
    padrao = { id: 'n-oficial', label: 'Oficial', provider: 'official', wabaId: 'waba-1' }
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Judite!', semConversa: 'abrir_pelo_padrao',
      modelo: { templateId: 'tpl-1', valores: { nome: 'Judite' }, semDado: [] },
    })
    expect(enviarModeloNaConversa).toHaveBeenCalledWith('t1', 'cv-nova', 'tpl-1', { nome: 'Judite' },
      { id: null, nome: 'Automação · Faltou' }, { userId: null })
    expect(enviarNaConversa).not.toHaveBeenCalled()
    expect(r.resumo).toMatchObject({ enviada: true, abriuConversa: true, modelo: true })
  })

  it('na Cloud API sem modelo escolhido: não abre conversa nenhuma, e diz por quê', async () => {
    padrao = { id: 'n-oficial', label: 'Oficial', provider: 'official', wabaId: 'waba-1' }
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao' })
    expect(r.resumo.enviada).toBe(false)
    expect(String(r.resumo.motivo)).toMatch(/modelo aprovado/)
    expect(conversaNoNumero).not.toHaveBeenCalled()
  })

  it('a variável do modelo sem o dado: não manda (princípio 4), e diz o que faltou', async () => {
    padrao = { id: 'n-oficial', label: 'Oficial', provider: 'official', wabaId: 'waba-1' }
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao',
      modelo: { templateId: 'tpl-1', valores: { nome: '' }, semDado: ['{{cliente.nome}}'] },
    })
    expect(r.resumo).toMatchObject({ enviada: false })
    expect(String(r.resumo.motivo)).toMatch(/\{\{cliente\.nome\}\}/)
    expect(conversaNoNumero).not.toHaveBeenCalled()
    expect(enviarModeloNaConversa).not.toHaveBeenCalled()
  })

  it('a rede sem número padrão: não manda, e diz por quê', async () => {
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao' })
    expect(r.resumo).toMatchObject({ enviada: false })
    expect(String(r.resumo.motivo)).toMatch(/número padrão/)
    expect(conversaNoNumero).not.toHaveBeenCalled()
  })

  it('o provedor recusa o modelo: o passo falha com o motivo (como o envio de sempre)', async () => {
    padrao = { id: 'n-oficial', label: 'Oficial', provider: 'official', wabaId: 'waba-1' }
    enviarModeloNaConversa.mockResolvedValueOnce({ ok: false, mensagemId: 'm3', error: 'Sem forma de pagamento na Meta.' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    await expect(mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao',
      modelo: { templateId: 'tpl-1', valores: { nome: 'Judite' }, semDado: [] },
    })).rejects.toThrow(/Sem forma de pagamento/)
  })

  it('"Não mandar" segue não abrindo conversa', async () => {
    padrao = { id: 'n-padrao', label: 'Recepção', provider: 'uazapi', wabaId: null }
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi', semConversa: 'nao_mandar' })
    expect(r.resumo.enviada).toBe(false)
    expect(conversaNoNumero).not.toHaveBeenCalled()
  })
})

describe('R10: a conversa aberta com a janela de 24 h fechada usa o modelo escolhido', () => {
  beforeEach(() => {
    montar()
    conversaAberta = 'cv-antiga'
    for (const f of [enviarNaConversa, enviarModeloNaConversa, emitir]) f.mockClear()
  })

  it('com o modelo: sai o modelo, na conversa que já existe', async () => {
    enviarNaConversa.mockResolvedValueOnce({ ok: false, error: 'A janela de 24 horas fechou. O contato precisa escrever de novo para você poder responder.' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi', modelo: { templateId: 'tpl-1', valores: { nome: 'Judite' }, semDado: [] },
    })
    expect(enviarModeloNaConversa).toHaveBeenCalledWith('t1', 'cv-antiga', 'tpl-1', { nome: 'Judite' },
      { id: null, nome: 'Automação · Faltou' }, { userId: null })
    expect(r.resumo).toMatchObject({ enviada: true, conversaId: 'cv-antiga', modelo: true })
  })

  it('sem o modelo: o passo falha dizendo que pede modelo aprovado — não mais "esta versão ainda não envia"', async () => {
    enviarNaConversa.mockResolvedValueOnce({ ok: false, error: 'A janela de 24 horas fechou. O contato precisa escrever de novo para você poder responder.' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const erro = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi' }).catch((e: Error) => e.message)
    expect(erro).toMatch(/modelo aprovado/)
    expect(erro).not.toMatch(/ainda não envia/)
  })
})

describe('R10: a validação do passo', () => {
  const grafo = (config: Record<string, unknown>): GrafoDeAutomacao => ({
    nos: [
      { id: 'g', tipo: 'gatilho.evento', config: { evento: 'agendamento.nao_compareceu' }, posicao: { x: 0, y: 0 } },
      { id: 'm', tipo: 'acao.mensagem', config: { canal: 'whatsapp', texto: 'Oi {{cliente.nome}}', ...config }, posicao: { x: 0, y: 100 } },
    ],
    ligacoes: [{ id: 'l', de: 'g', para: 'm' }],
  } as unknown as GrafoDeAutomacao)

  it('o "Abrir pelo número padrão" só existe no WhatsApp', async () => {
    const { validarGrafo } = await import('@/lib/automacoes/validar')
    expect(validarGrafo(grafo({ canal: 'instagram', semConversa: 'abrir_pelo_padrao' })).map(p => p.mensagem).join(' '))
      .toMatch(/número padrão.*WhatsApp/)
    expect(validarGrafo(grafo({ semConversa: 'abrir_pelo_padrao' })).filter(p => p.grau === 'erro')).toEqual([])
  })

  it('a variável do modelo que a automação não conhece se recusa ao salvar (D15 da 32ª)', async () => {
    const { validarGrafo } = await import('@/lib/automacoes/validar')
    const erros = validarGrafo(grafo({ semConversa: 'abrir_pelo_padrao', templateId: 'tpl-1', variaveisDoTemplate: { nome: '{{first_name}}' } }))
      .filter(p => p.grau === 'erro').map(p => p.mensagem)
    expect(erros.join(' ')).toMatch(/\{\{first_name\}\}/)
  })
})

describe('R10: o que a rede tem para abrir pelo número padrão (conferido ao ligar)', () => {
  const passo = (config: Record<string, unknown>) => ({ id: 'm', tipo: 'acao.mensagem', config: { canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao', ...config } })
  const modelo = { id: 'tpl-1', nome: 'retorno', variaveis: ['nome'] }

  it('sem número padrão, não liga', async () => {
    const { problemasDaAberturaPeloPadrao } = await import('@/lib/automacoes/abrir-pelo-padrao-regras')
    expect(problemasDaAberturaPeloPadrao([passo({})], { padrao: null, modelos: [] }).join(' ')).toMatch(/número padrão/)
  })

  it('no WhatsApp Web, o texto do passo basta', async () => {
    const { problemasDaAberturaPeloPadrao } = await import('@/lib/automacoes/abrir-pelo-padrao-regras')
    expect(problemasDaAberturaPeloPadrao([passo({})], { padrao: { label: 'Recepção', oficial: false }, modelos: [] })).toEqual([])
  })

  it('na Cloud API: pede o modelo aprovado, da conta do número padrão, com toda variável preenchida', async () => {
    const { problemasDaAberturaPeloPadrao } = await import('@/lib/automacoes/abrir-pelo-padrao-regras')
    const oficial = { padrao: { label: 'Oficial', oficial: true }, modelos: [modelo] }
    expect(problemasDaAberturaPeloPadrao([passo({})], oficial).join(' ')).toMatch(/modelo aprovado/)
    expect(problemasDaAberturaPeloPadrao([passo({ templateId: 'outro' })], oficial).join(' ')).toMatch(/não está entre os aprovados/)
    expect(problemasDaAberturaPeloPadrao([passo({ templateId: 'tpl-1', variaveisDoTemplate: {} })], oficial).join(' ')).toMatch(/\{\{nome\}\}/)
    expect(problemasDaAberturaPeloPadrao([passo({ templateId: 'tpl-1', variaveisDoTemplate: { nome: '{{cliente.nome}}' } })], oficial)).toEqual([])
  })

  it('o passo sem a escolha não entra na conta', async () => {
    const { problemasDaAberturaPeloPadrao } = await import('@/lib/automacoes/abrir-pelo-padrao-regras')
    expect(problemasDaAberturaPeloPadrao([passo({ semConversa: undefined })], { padrao: null, modelos: [] })).toEqual([])
  })

  it('ligar e salvar a automação ligada conferem isto no servidor', () => {
    const acoes = fonte('actions/automacoes.ts')
    expect(acoes.match(/problemasDaAberturaNaRede\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('R10: a tela do passo, o card e a janela de ligar', () => {
  it('o painel oferece "Abrir pelo número padrão" no WhatsApp, com o risco dito e o modelo na Cloud API', () => {
    const painel = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(painel).toMatch(/value="abrir_pelo_padrao"[^>]*>Abrir pelo número padrão</)
    expect(painel).toMatch(/data-modelo-do-passo/)
    expect(painel).toMatch(/risco/)
    expect(painel).not.toMatch(/ainda não envia/)
  })

  it('o card do passo diz que abre pelo número padrão', async () => {
    const { resumoDoNo } = await import('@/lib/automacoes/resumo')
    expect(resumoDoNo('acao.mensagem', { canal: 'whatsapp', texto: 'Oi', semConversa: 'abrir_pelo_padrao' }))
      .toMatch(/sem conversa: abre pelo número padrão/)
  })

  it('a janela de ligar diz que quem não tem conversa recebe pelo número padrão, numa conversa nova', async () => {
    const { explicacaoAntesDeLigar, semConversaAbrePeloPadrao } = await import('@/lib/automacoes/antes-de-ligar')
    const texto = explicacaoAntesDeLigar(['whatsapp'], { semConversaAbre: true })
    expect(texto).toMatch(/Quem não tem conversa aberta recebe pelo número padrão/)
    expect(texto).not.toMatch(/não abre conversa nova/)
    expect(semConversaAbrePeloPadrao({ nos: [{ id: 'm', tipo: 'acao.mensagem', config: { canal: 'whatsapp', semConversa: 'abrir_pelo_padrao' } }] } as never)).toBe(true)
  })

  it('a execução diz que abriu a conversa', async () => {
    const { descreverResumo } = await import('@/lib/automacoes/em-portugues')
    expect(descreverResumo('acao.mensagem', { enviada: true, canal: 'whatsapp', abriuConversa: true, texto: 'Oi' }))
      .toMatch(/abriu a conversa pelo número padrão/)
  })

  it('o motor monta o modelo do passo com as variáveis da automação', () => {
    const motor = fonte('lib/automacoes/executar.ts')
    expect(motor).toMatch(/variaveisDoTemplate/)
    expect(motor).toMatch(/modelo:/)
  })
})
