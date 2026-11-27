import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A mensagem da automação que o provedor não aceitou.
 *
 * D2 da 38ª: o cron tenta de novo a execução que falhou (até 3 vezes), e cada
 * tentativa gravava uma bolha "Não enviada" NOVA na conversa. crm-inbox:IN-18
 * — a mensagem que não saiu fica na conversa como UMA "Não enviada", com o
 * "Tentar de novo" —, princípio 3. O reenvio automático reaproveita a mesma
 * linha (como o "Tentar de novo" da bolha, `reenviarNaConversa`), e a execução
 * continua registrando cada tentativa.
 *
 * A16 da 38ª: com "Abrir pelo número padrão", a execução que falha dizia só "o
 * número não respondeu", sem dizer que a conversa foi aberta pelo número
 * padrão (automacoes:AX-06, princípio 3).
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

type Envio = { ok: boolean; mensagemId?: string; error?: string }
const enviarNaConversa = vi.fn<(...a: unknown[]) => Promise<Envio>>(async () => ({ ok: true, mensagemId: 'm-nova' }))
const enviarModeloNaConversa = vi.fn<(...a: unknown[]) => Promise<Envio>>(async () => ({ ok: true, mensagemId: 'm-modelo' }))
const reenviarNaConversa = vi.fn<(...a: unknown[]) => Promise<Envio>>(async () => ({ ok: true, mensagemId: 'm-falhou' }))
const emitir = vi.fn()
let conversaAberta: string | null = 'cv-1'
let padrao: { id: string; label: string; provider: 'uazapi' | 'official'; wabaId: string | null } | null = null
const conversaNoNumero = vi.fn(async () => ({ conversaId: 'cv-nova', criada: true }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/notifications/notify', () => ({ notifyClient: async () => {} }))
vi.mock('@/lib/contatos/conversa-de-whatsapp', () => ({ conversaDeWhatsappDaCliente: async () => conversaAberta }))
vi.mock('@/lib/inbox/enviar', () => ({
  enviarNaConversa: (...a: unknown[]) => enviarNaConversa(...a),
  enviarModeloNaConversa: (...a: unknown[]) => enviarModeloNaConversa(...a),
}))
vi.mock('@/lib/inbox/reenviar', () => ({ reenviarNaConversa: (...a: unknown[]) => reenviarNaConversa(...a) }))
vi.mock('@/lib/events/conversa', () => ({ emitirEventoDeConversa: (...a: unknown[]) => emitir(...a) }))
vi.mock('@/lib/automacoes/abrir-pelo-padrao', () => ({
  numeroPadraoDaRede: async () => padrao,
  conversaNoNumero: (...a: unknown[]) => conversaNoNumero(...(a as [])),
}))

const ator = { tenantId: 't1', automacaoId: 'a1', nome: 'Confirmação', profundidade: 0 }
const contexto = { cliente: { id: 'cl-alcione' } }
const remetente = { id: null, nome: 'Automação · Confirmação' }

function montar() {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.tenants = [{ id: 't1', name: 'Instituto Jabuticaba' }]
  banco.clients = [{ id: 'cl-alcione', tenant_id: 't1', auth_id: 'auth-a', name: 'Alcione' }]
  banco.messages = [{ id: 'm-falhou', tenant_id: 't1', conversation_id: 'cv-1', status: 'failed', direction: 'outbound' }]
}

beforeEach(() => {
  montar()
  conversaAberta = 'cv-1'
  padrao = null
  for (const f of [enviarNaConversa, enviarModeloNaConversa, reenviarNaConversa, emitir, conversaNoNumero]) f.mockClear()
})

describe('D2: a primeira tentativa que falha guarda a mensagem que ficou "Não enviada"', () => {
  it('o erro do envio leva a mensagem gravada (para a próxima tentativa reaproveitá-la)', async () => {
    enviarNaConversa.mockResolvedValueOnce({ ok: false, mensagemId: 'm-falhou', error: 'fetch failed' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const erro = await mandarMensagem(ator as never, contexto, { canal: 'whatsapp', texto: 'Oi, Alcione!' })
      .then(() => null, (e: Error & { naoEnviada?: unknown }) => e)
    expect(erro, 'o envio que falhou faz o passo falhar').not.toBeNull()
    expect(erro!.message).toMatch(/fetch failed/)
    expect(erro!.naoEnviada).toMatchObject({ mensagemId: 'm-falhou' })
  })
})

describe('D2: a nova tentativa reaproveita a MESMA mensagem (uma bolha só)', () => {
  it('reenvia a linha "Não enviada" em vez de gravar outra', async () => {
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Alcione!', naoEnviada: { mensagemId: 'm-falhou' },
    } as never)
    expect(reenviarNaConversa).toHaveBeenCalledWith('t1', 'm-falhou', remetente)
    expect(enviarNaConversa, 'nenhuma bolha nova').not.toHaveBeenCalled()
    expect(r.resumo).toMatchObject({ enviada: true, canal: 'whatsapp', conversaId: 'cv-1' })
    expect(emitir, 'o fato da mensagem enviada sai uma vez, quando ela sai').toHaveBeenCalledTimes(1)
  })

  it('o reenvio que falha de novo segue com a mesma mensagem, sem bolha nova', async () => {
    reenviarNaConversa.mockResolvedValueOnce({ ok: false, mensagemId: 'm-falhou', error: 'O número não respondeu.' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const erro = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Alcione!', naoEnviada: { mensagemId: 'm-falhou' },
    } as never).then(() => null, (e: Error & { naoEnviada?: unknown }) => e)
    expect(erro).not.toBeNull()
    expect(erro!.naoEnviada).toMatchObject({ mensagemId: 'm-falhou' })
    expect(enviarNaConversa).not.toHaveBeenCalled()
    expect(emitir).not.toHaveBeenCalled()
  })

  it('a que já saiu pelo "Tentar de novo" da conversa não sai outra vez', async () => {
    banco.messages![0]!.status = 'sent'
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Alcione!', naoEnviada: { mensagemId: 'm-falhou' },
    } as never)
    expect(reenviarNaConversa).not.toHaveBeenCalled()
    expect(enviarNaConversa).not.toHaveBeenCalled()
    expect(r.resumo).toMatchObject({ enviada: true, conversaId: 'cv-1' })
  })

  it('o motor guarda a mensagem que não saiu no contexto, por passo, e a entrega à tentativa seguinte', () => {
    const motor = fonte('lib/automacoes/executar.ts')
    expect(motor).toMatch(/naoEnviada:\s*naoEnviadaDoPasso\(contexto, no\.id\)/)
    expect(motor).toMatch(/guardarNaoEnviada\(contexto, no\.id/)
    expect(motor).toMatch(/esquecerNaoEnviada\(contexto, no\.id\)/)
  })

  it('as funções do contexto: guarda, lê e esquece por passo', async () => {
    const { guardarNaoEnviada, naoEnviadaDoPasso, esquecerNaoEnviada } = await import('@/lib/automacoes/mensagem-nao-enviada')
    const ctx: Record<string, unknown> = {}
    expect(naoEnviadaDoPasso(ctx, 'n1')).toBeNull()
    guardarNaoEnviada(ctx, 'n1', { mensagemId: 'm-falhou' })
    expect(naoEnviadaDoPasso(ctx, 'n1')).toEqual({ mensagemId: 'm-falhou' })
    expect(naoEnviadaDoPasso(ctx, 'n2')).toBeNull()
    esquecerNaoEnviada(ctx, 'n1')
    expect(naoEnviadaDoPasso(ctx, 'n1')).toBeNull()
  })
})

describe('A16: "Abrir pelo número padrão" que falha diz que abriu a conversa', () => {
  it('a execução diz que abriu pelo número padrão, e que a mensagem não saiu', async () => {
    conversaAberta = null
    padrao = { id: 'n-padrao', label: 'Recepção', provider: 'uazapi', wabaId: null }
    enviarNaConversa.mockResolvedValueOnce({ ok: false, mensagemId: 'm-aberta', error: 'fetch failed' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const erro = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Sinara!', semConversa: 'abrir_pelo_padrao',
    }).then(() => null, (e: Error & { naoEnviada?: unknown }) => e)
    expect(erro).not.toBeNull()
    expect(erro!.naoEnviada).toMatchObject({ mensagemId: 'm-aberta' })

    const { erroDaExecucao } = await import('@/lib/automacoes/em-portugues')
    const dito = erroDaExecucao(`acao.mensagem: ${erro!.message}`)
    expect(dito).toMatch(/abriu a conversa pelo número padrão \(Recepção\)/)
    expect(dito).toMatch(/não conseguiu mandar a mensagem \(o número não respondeu\)/)
  })

  it('a tentativa seguinte que falha continua dizendo que a conversa foi aberta pelo número padrão', async () => {
    reenviarNaConversa.mockResolvedValueOnce({ ok: false, mensagemId: 'm-falhou', error: 'fetch failed' })
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const erro = await mandarMensagem(ator as never, contexto, {
      canal: 'whatsapp', texto: 'Oi, Sinara!', semConversa: 'abrir_pelo_padrao',
      naoEnviada: { mensagemId: 'm-falhou', abriuPeloPadrao: 'Recepção' },
    } as never).then(() => null, (e: Error) => e)
    const { erroDaExecucao } = await import('@/lib/automacoes/em-portugues')
    expect(erroDaExecucao(`acao.mensagem: ${erro!.message}`)).toMatch(/abriu a conversa pelo número padrão \(Recepção\)/)
  })

  it('o erro que já é frase fica, depois do que aconteceu', async () => {
    const { erroDaExecucao, erroDaAbertura } = await import('@/lib/automacoes/em-portugues')
    expect(erroDaExecucao(`acao.mensagem: ${erroDaAbertura('Recepção', 'Sem forma de pagamento na Meta.')}`))
      .toBe('Mandar mensagem: abriu a conversa pelo número padrão (Recepção), mas a mensagem não saiu: Sem forma de pagamento na Meta.')
  })
})
