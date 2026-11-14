import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { urlDeVerificacao } from '@/lib/documentos/pdf'
import { modeloDeAutomacao } from '@/lib/automacoes/modelos'

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

// C54 (D15) e C74 (D17) eram do lembrete da campanha AUTOMÁTICA, que saiu
// em 2026-11-14 (MK1): o lembrete é o modelo das Automações (com o silêncio
// noturno delas).

describe('C57b: o modelo do lembrete não promete "amanhã"', () => {
  it('diz a data do agendamento', () => {
    const modelo = modeloDeAutomacao('lembrete-antes-do-agendamento')!
    const msg = modelo.grafo().nos.find(n => n.tipo === 'acao.mensagem')!
    const texto = (msg.config as { texto: string }).texto
    expect(texto).not.toMatch(/amanhã/i)
    expect(texto).toContain('{{agendamento.data}}')
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
