import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * D6 da 32ª simulação (AX-06; o Heitor, 2026-11-11, H1: "opção d, com a a
 * valendo já"). O "Mandar mensagem" ganha "Para quem não tem conversa aberta",
 * desligado por padrão (princípio 6): Não mandar · Mandar como aviso no
 * celular. A C10 faltou, não tinha conversa no WhatsApp, e ninguém foi
 * avisado — a execução dizia "Concluída".
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

const notifyClient = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {})
const enviarNaConversa = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean; mensagemId: string }>>(async () => ({ ok: true, mensagemId: 'm1' }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/notifications/notify', () => ({ notifyClient: (...a: unknown[]) => notifyClient(...a) }))
vi.mock('@/lib/contatos/conversa-de-whatsapp', () => ({ conversaDeWhatsappDaCliente: async () => null }))
vi.mock('@/lib/inbox/enviar', () => ({ enviarNaConversa: (...a: unknown[]) => enviarNaConversa(...a) }))
vi.mock('@/lib/events/conversa', () => ({ emitirEventoDeConversa: vi.fn() }))

const ator = { tenantId: 't1', automacaoId: 'a1', nome: 'Faltou', profundidade: 0 }

function montar(authId: string | null = 'auth-judite') {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.tenants = [{ id: 't1', name: 'Vinca Centro' }]
  banco.clients = [{ id: 'cl-judite', tenant_id: 't1', auth_id: authId }]
}

describe('D6: a cliente sem conversa aberta no WhatsApp', () => {
  beforeEach(() => { notifyClient.mockClear(); enviarNaConversa.mockClear() })

  it('sem a opção (o padrão): não manda, e diz por quê', async () => {
    montar()
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-judite' } }, { canal: 'whatsapp', texto: 'Oi, Judite!' })
    expect(r.resumo.enviada).toBe(false)
    expect(String(r.resumo.motivo)).toMatch(/não tem conversa aberta no WhatsApp/)
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('"Não mandar" escolhido: o mesmo', async () => {
    montar()
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-judite' } },
      { canal: 'whatsapp', texto: 'Oi, Judite!', semConversa: 'nao_mandar' })
    expect(r.resumo.enviada).toBe(false)
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('"Mandar como aviso no celular": vai como aviso no celular, sem pedir resposta, e o passo diz por quê', async () => {
    montar()
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-judite' } },
      { canal: 'whatsapp', texto: 'Oi, Judite! Sentimos sua falta. É só responder esta mensagem.', semConversa: 'aviso_no_celular' })
    expect(notifyClient).toHaveBeenCalledTimes(1)
    const aviso = notifyClient.mock.calls[0]![2] as { title: string; body: string }
    expect(aviso.title).toBe('Vinca Centro')
    expect(aviso.body, 'o aviso no celular não se responde (AX-03)').not.toMatch(/responder/)
    expect(r.resumo).toMatchObject({ enviada: true, canal: 'push', semConversa: true })
    expect(enviarNaConversa).not.toHaveBeenCalled()
  })

  it('a cliente sem acesso ao app: o aviso fica guardado no sino (AX-04)', async () => {
    montar(null)
    const { mandarMensagem } = await import('@/lib/automacoes/acoes-mensagem')
    const r = await mandarMensagem(ator as never, { cliente: { id: 'cl-judite' } },
      { canal: 'whatsapp', texto: 'Oi, Judite!', semConversa: 'aviso_no_celular' })
    expect(r.resumo).toMatchObject({ enviada: false, guardada: true })
  })
})

describe('D6: a tela do passo e o texto antes de ligar', () => {
  it('o painel do passo tem "Para quem não tem conversa aberta", e o padrão é "Não mandar"', () => {
    const painel = fonte('components/admin/automacoes/painel-do-no.tsx')
    expect(painel).toMatch(/Para quem não tem conversa aberta/)
    expect(painel).toMatch(/data-sem-conversa/)
    expect(painel).toMatch(/value="nao_mandar"[^>]*>Não mandar</)
    expect(painel).toMatch(/value="aviso_no_celular"[^>]*>Mandar como aviso no celular</)
  })

  it('a janela de ligar diz que quem não tem conversa recebe o aviso no celular', async () => {
    const { explicacaoAntesDeLigar } = await import('@/lib/automacoes/antes-de-ligar')
    expect(explicacaoAntesDeLigar(['whatsapp'], { semConversaNoCelular: true }))
      .toMatch(/Quem não tem conversa aberta recebe como aviso no celular/)
    expect(explicacaoAntesDeLigar(['whatsapp'])).not.toMatch(/Quem não tem conversa aberta recebe/)
  })

  it('o passo em WhatsApp com a opção passa o motivo ao resumo do quadro', async () => {
    const { resumoDoNo } = await import('@/lib/automacoes/resumo')
    expect(resumoDoNo('acao.mensagem', { canal: 'whatsapp', texto: 'Oi', semConversa: 'aviso_no_celular' }))
      .toMatch(/sem conversa: aviso no celular/)
  })
})
