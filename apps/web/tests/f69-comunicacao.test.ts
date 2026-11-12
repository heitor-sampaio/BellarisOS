import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { urlDeVerificacao } from '@/lib/documentos/pdf'
import { quandoDispara } from '@/lib/notifications/quando-dispara'
import { modeloDeAutomacao } from '@/lib/automacoes/modelos'
import { envioDoLembrete, avisoDeMadrugada } from '@/lib/notifications/lembrete-de-madrugada'
import { instanteNoFuso } from '@/lib/datetime'

// F69 — documentos, automações, campanhas, WhatsApp e push (levantamento das
// regras de 2026-11-11 e o D11 da 13ª simulação).

describe('D11: o link de conferência do PDF é o endereço público da clínica', () => {
  const antes = { ...process.env }
  afterEach(() => { process.env = { ...antes } })

  it('vem do CLINICA_URL, não do endereço de build', () => {
    process.env.CLINICA_URL = 'https://app.bellarisos.com/'
    process.env.NEXT_PUBLIC_APP_URL = 'https://bellaris-web-production.up.railway.app'
    expect(urlDeVerificacao('ABC123')).toBe('https://app.bellarisos.com/verificar/ABC123')
  })
})

describe('C54 (D15): o lembrete da campanha é de todo agendamento ativo', () => {
  it('diz "agendado ou confirmado", como o cron faz', () => {
    expect(quandoDispara('BEFORE_APPOINTMENT', { hours: 24 })).toContain('agendado ou confirmado')
  })
})

describe('C57b: o modelo do lembrete não promete "amanhã"', () => {
  it('diz a data do agendamento', () => {
    const modelo = modeloDeAutomacao('lembrete-antes-do-agendamento')!
    const msg = modelo.grafo().nos.find(n => n.tipo === 'acao.mensagem')!
    const texto = (msg.config as { texto: string }).texto
    expect(texto).not.toMatch(/amanhã/i)
    expect(texto).toContain('{{agendamento.data}}')
  })
})

describe('C74 (D17): o lembrete que cai de madrugada', () => {
  const tz = 'America/Sao_Paulo'
  const em = (dia: string, hora: string) => instanteNoFuso(dia, hora, tz)

  it('sem a opção, sai na hora de sempre', () => {
    expect(envioDoLembrete(em('2026-11-20', '09:00'), 6, tz, false)).toEqual(em('2026-11-20', '03:00'))
  })
  it('com a opção: o que cairia de madrugada sai na véspera às 20:00', () => {
    // 09:00 − 6h = 03:00 → véspera do envio, 20:00 do dia 19.
    expect(envioDoLembrete(em('2026-11-20', '09:00'), 6, tz, true)).toEqual(em('2026-11-19', '20:00'))
    // 23:30 − 2h = 21:30 → 20:00 do mesmo dia.
    expect(envioDoLembrete(em('2026-11-20', '23:30'), 2, tz, true)).toEqual(em('2026-11-20', '20:00'))
    // Fora da madrugada, não muda.
    expect(envioDoLembrete(em('2026-11-20', '15:00'), 2, tz, true)).toEqual(em('2026-11-20', '13:00'))
  })
  it('o aviso diz quais agendamentos caem de madrugada', () => {
    expect(avisoDeMadrugada(2)).toContain('entre 23:00 e 10:00')
    expect(avisoDeMadrugada(24)).toContain('entre 21:00 e 08:00')
  })
})

describe('C51: as campanhas mandam aos aparelhos de TODAS as fichas do login', () => {
  it('nenhum disparo de campanha lê os aparelhos pela ficha direto', () => {
    const raiz = path.resolve(__dirname, '..')
    for (const arq of ['lib/notifications/disparo-de-campanha.ts', 'app/api/cron/notification-campaigns/route.ts']) {
      const codigo = fs.readFileSync(path.join(raiz, arq), 'utf8')
      expect(codigo, arq).not.toMatch(/from\('(push_tokens|web_push_subscriptions)'\)/)
    }
  })
})
