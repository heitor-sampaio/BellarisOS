import { describe, it, expect } from 'vitest'
import { RegisterSchema, LoginSchema, ResetPasswordSchema, UpdatePasswordSchema } from '@estetica-os/validators'
import {
  formatBRL, formatDate, formatPercent, maskCPF, maskPhone, maskCNPJ, iniciaisDoNome,
  resolveLeadSource, mergeTags, sourceStyle,
} from '@estetica-os/utils'
import { secondsSince, agingLevel, formatDurationShort, formatDurationLong } from '../../../packages/utils/src/crm-metrics'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { comOEmAberto } from '@/lib/appointments/sessao-do-pacote'

/**
 * Os pacotes compartilhados que o app usa. (Os schemas de agendamento,
 * procedimento, cliente e login do cliente, e o `sourceTagFor`, não eram usados
 * por nada e saíram em 2026-09-28.)
 */

const primeiroErro = (r: { success: boolean; error?: { errors: { message: string }[] } }) =>
  r.success ? null : r.error!.errors[0]!.message

describe('autenticação', () => {
  it('cadastro e nova senha: 8 caracteres e as duas iguais', () => {
    for (const Schema of [RegisterSchema, UpdatePasswordSchema]) {
      const base = Schema === RegisterSchema ? { email: 'a@b.co' } : {}
      expect(primeiroErro(Schema.safeParse({ ...base, password: '1234567', confirmPassword: '1234567' })))
        .toBe('Senha deve ter pelo menos 8 caracteres')
      expect(primeiroErro(Schema.safeParse({ ...base, password: '12345678', confirmPassword: '12345679' })))
        .toBe('As senhas não coincidem')
      expect(Schema.safeParse({ ...base, password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
    }
  })

  it('login aceita 6 (as contas antigas) e reset exige e-mail válido', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: '123456' }).success).toBe(true)
    expect(primeiroErro(ResetPasswordSchema.safeParse({ email: 'nao-e-email' }))).toBe('E-mail inválido')
    expect(ResetPasswordSchema.safeParse({ email: 'pessoa@clinica.com.br' }).success).toBe(true)
  })
})

describe('origem do lead', () => {
  it('Google pelo gclid ou utm; Meta pelo clique, pelo utm ou pelo anúncio; senão orgânico', () => {
    expect(resolveLeadSource({ gclid: 'x' }).source).toBe('Google Ads')
    expect(resolveLeadSource({ utm_source: 'Google' }).source).toBe('Google Ads')
    expect(resolveLeadSource({ fbclid: 'x' }).source).toBe('Meta Ads')
    expect(resolveLeadSource({ utm_source: 'ig' })).toMatchObject({ source: 'Meta Ads', utm_source: 'instagram' })
    expect(resolveLeadSource({ referral: { ctwaClid: 'c1', sourceApp: 'facebook' } }))
      .toEqual({ source: 'Meta Ads', utm_source: 'facebook', ctwa_clid: 'c1' })
  })

  it('a plataforma dita pelo provedor vence a URL — encurtador engana', () => {
    expect(resolveLeadSource({ referral: { sourceType: 'ad', sourceUrl: 'https://fb.me/abc', sourceApp: 'instagram' } }).utm_source)
      .toBe('instagram')
  })

  it('sem atribuição, vale a escolha manual; sem nada, sem origem (D14)', () => {
    expect(resolveLeadSource({}, 'Indicação')).toEqual({ source: 'Indicação' })
    expect(resolveLeadSource({}, '  ')).toEqual({ source: null })
    // Com atribuição, a escolha manual não apaga o anúncio.
    expect(resolveLeadSource({ fbclid: 'x' }, 'Indicação').source).toBe('Meta Ads')
  })

  it('tags sem repetição, na ordem, sem vazias; origem desconhecida pinta neutro', () => {
    expect(mergeTags(['Meta Ads'], [' VIP ', 'Meta Ads', ''], null)).toEqual(['Meta Ads', 'VIP'])
    expect(sourceStyle('origem-legada')).toEqual(sourceStyle(null))
  })
})

describe('formatação', () => {
  // O Intl separa "R$" do número com espaço duro (U+00A0).
  const txt = (s: string) => s.replace(/ /g, ' ')

  it('moeda, percentual com vírgula e data no fuso do negócio', () => {
    expect(txt(formatBRL(1240))).toBe('R$ 1.240,00')
    expect(formatPercent(12.345)).toBe('12,3%')
    // 02:00 UTC do dia 10 ainda é dia 9 em São Paulo.
    expect(formatDate('2026-09-10T02:00:00Z')).toBe('09/09/2026')
  })

  it('máscaras aceitam o número com ou sem pontuação', () => {
    expect(maskCPF('123.456.789-01')).toBe('123.456.789-01')
    expect(maskCPF('12345678901')).toBe('123.456.789-01')
    expect(maskPhone('48999998888')).toBe('(48) 99999-8888')
    expect(maskPhone('4833334444')).toBe('(48) 3333-4444')
    expect(maskCNPJ('12345678000190')).toBe('12.345.678/0001-90')
  })

  it('iniciais: primeiro e último nome, por code point (emoji não parte ao meio)', () => {
    expect(iniciaisDoNome('Ana Maria Prado')).toBe('AP')
    expect(iniciaisDoNome('ana')).toBe('AN')
    expect(iniciaisDoNome('  ')).toBe('?')
    expect(iniciaisDoNome('😀 Carla')).toBe('😀C')
    expect(iniciaisDoNome('Ana Prado', 1)).toBe('A')
  })
})

describe('CRM: tempo parado', () => {
  const agora = Date.parse('2026-09-28T12:00:00Z')

  it('segundos desde um instante, nunca negativo', () => {
    expect(secondsSince('2026-09-28T11:00:00Z', agora)).toBe(3600)
    expect(secondsSince('2026-09-28T13:00:00Z', agora)).toBe(0)
    expect(secondsSince(null, agora)).toBeNull()
  })

  it('nível pela régua, e a duração em pt-BR', () => {
    const regua = { warn: 3600, alert: 4 * 3600 }
    expect([null, 3599, 3600, 4 * 3600].map(s => agingLevel(s, regua))).toEqual(['ok', 'ok', 'warn', 'alert'])
    expect([30, 720, 3 * 3600, 5 * 86400].map(formatDurationShort)).toEqual(['agora', '12min', '3h', '5d'])
    expect([30, 8100, 3 * 3600, 86400, 2 * 86400, 86400 + 3600].map(formatDurationLong))
      .toEqual(['menos de 1min', '2h 15min', '3h', '1 dia', '2 dias', '1d 1h'])
  })
})


describe('a sessão do pacote com parcelas em aberto não diz "paga na venda do pacote" (princípio 3)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('o Finalizar e o concluído', () => {
    it('a janela do Finalizar diz "incluída no pacote" quando o pacote tem em aberto', async () => {
      const { textoDoPagamentoAoFinalizar } = await import('@/lib/atendimento/pagamento-ao-finalizar')
      const base = { plano: false, pacote: true, prePago: false, semCobranca: false }
      expect(textoDoPagamentoAoFinalizar({ ...base, pacoteEmAberto: 400 }))
        .toBe('Sessão de pacote: incluída no pacote, que tem parcelas em aberto; nada a receber neste atendimento.')
      expect(textoDoPagamentoAoFinalizar({ ...base, pacoteEmAberto: 0 })).toBe('Sessão de pacote: paga na venda do pacote, nada a receber.')
      expect(textoDoPagamentoAoFinalizar({ ...base })).toBe('Sessão de pacote: paga na venda do pacote, nada a receber.')
      expect(textoDoPagamentoAoFinalizar({ ...base, pacoteDeFora: true, pacoteEmAberto: 400 }))
        .toBe('Sessão do pacote trazido de fora: já paga antes do sistema, nada a receber.')
    })
    it('o concluído diz o mesmo, e a tela passa o em aberto da sessão do pacote', async () => {
      const { textoDoPacoteNoConcluido } = await import('@/lib/atendimento/pagamento-ao-finalizar')
      expect(textoDoPacoteNoConcluido({ deFora: false, emAberto: 400 }))
        .toBe('Sessão de pacote — incluída no pacote, que tem parcelas em aberto; nada a receber nesta sessão.')
      expect(textoDoPacoteNoConcluido({ deFora: false, emAberto: null })).toBe('Sessão de pacote — paga na venda do pacote.')
      expect(textoDoPacoteNoConcluido({ deFora: true, emAberto: 400 })).toBe('Sessão do pacote trazido de fora — já paga antes do sistema, nada a receber.')
      const s = ler('components/branch/appointment-session.tsx')
      expect(s).not.toMatch(/'Sessão de pacote — paga na venda do pacote\.'/)
      expect(s).toMatch(/pacoteEmAberto: sessaoDoPacote\?\.emAberto/)
      expect(s).toMatch(/textoDoPacoteNoConcluido\(\{ deFora: pacoteDeFora, emAberto: sessaoDoPacote\?\.emAberto/)
    })
  })

})

describe('vendido o pacote, a tela confirma a venda (princípio 3)', () => {
  const WEB = nodePath.join(__dirname, "..")
  const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), "utf8")

  // ─── a venda do pacote não deixa o formulário preenchido ──────────────
  describe('vendido o pacote, o formulário some', () => {
    it('a venda registrada troca o formulário pela confirmação', () => {
      const f = ler('components/shared/vender-pacote.tsx')
      expect(f).toContain('data-venda-registrada')
      expect(f).toMatch(/setRegistrada\(/)
    })
  })
})

describe('o em aberto é do pacote, não da sessão (princípio 3)', () => {
  const WEB = nodePath.join(__dirname, "..")
  const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), "utf8")
  const sp = (s: string | null | undefined) => s?.replace(/\s/g, " ") ?? null

  // ─── o em aberto é do pacote, não da sessão ───────────────────────────
  describe('"pacote com R$ 400,00 em aberto"', () => {
    it('o texto diz de quem é o em aberto', () => {
      expect(sp(comOEmAberto('4 limpezas · sessão 1 de 4', 400, true, 'pacote'))).toBe('4 limpezas · sessão 1 de 4 · pacote com R$ 400,00 em aberto')
      expect(comOEmAberto('4 limpezas · sessão 1 de 4', 400, false, 'pacote')).toBe('4 limpezas · sessão 1 de 4 · pacote com parcelas em aberto')
      expect(sp(comOEmAberto('Pré-pago · 1 de 2', 150, true, 'pré-pago'))).toBe('Pré-pago · 1 de 2 · pré-pago com R$ 150,00 em aberto')
      expect(comOEmAberto('4 limpezas · sessão 1 de 4', 0, true, 'pacote')).toBe('4 limpezas · sessão 1 de 4')
    })
    it('a agenda e o app passam de quem é', () => {
      expect(ler('lib/appointments/pago-antes.ts')).toMatch(/comOEmAberto\([^)]*deQue/)
    })
  })
})
