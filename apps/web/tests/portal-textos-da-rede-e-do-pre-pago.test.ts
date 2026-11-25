import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Os textos do app da cliente (o portal fala o NOME da rede — crm-inbox, CA1,
 * aprovado pelo Heitor em 13/11 com "Concordo": "A clínica enviou um
 * documento" passa a usar o nome; "a equipe" fica onde é ela quem age, no
 * atendimento):
 *
 * - D13: o pedido de assinatura e as fotos enviadas, o motivo do cancelamento
 *   e a liberação do prontuário na LGPD diziam "a equipe" no lugar da rede; e
 *   "notificacao" sem acento no sino;
 * - D12: o prazo do pedido LGPD saía sem o ano (crm-inbox:LG-05, DD/MM/AAAA);
 * - A23: o "Meus dados pessoais" não dizia que apagar os dados ou retirar o
 *   consentimento se pede à rede (LG-01, LG-03; decisão do Claude, 25/11);
 * - A19: o cartão do pré-pago na home dizia "2 já pagos · 1 para agendar" sem
 *   quantos foram usados (princípio 7).
 */
const WEB = path.resolve(__dirname, '..')
const ler = (rel: string) => fs.readFileSync(path.join(WEB, rel), 'utf8')

describe('D13: o nome da rede onde ela é quem fala com a cliente', () => {
  it('os documentos: a rede pede a assinatura e enviou as fotos', () => {
    const f = ler('app/[slug]/cliente/documentos/page.tsx')
    expect(f).not.toMatch(/a equipe pede a sua assinatura/)
    expect(f).not.toMatch(/que a equipe enviou/)
    expect(f).toMatch(/\{rede\} pede a sua assinatura/)
    expect(f).toMatch(/que \{rede\} enviou/)
  })

  it('o cancelamento pelo app: o motivo se conta à rede', () => {
    const f = ler('components/client-portal/alterar-agendamento.tsx')
    expect(f).not.toMatch(/Conte à equipe/)
    expect(f).toMatch(/useNomeDaRede\(\)/)
  })

  it('a liberação do prontuário na LGPD é da rede, e o prazo tem o ano (LG-05)', () => {
    const f = ler('components/client-portal/data-request-card.tsx')
    expect(f).not.toMatch(/depende da liberação da equipe/)
    expect(f).not.toMatch(/prazoDeResposta\(iso, false/)
    expect(f).toMatch(/prazoDeResposta\(iso, true, fuso\)/)
  })

  it('o sino diz "notificação", com acento', () => {
    const f = ler('components/client-portal/notification-bell.tsx')
    expect(f).not.toMatch(/notificacao por aqui/)
    expect(f).toContain('Nenhuma notificação por aqui.')
  })

  it('o nome da rede chega aos componentes do navegador (o layout o põe)', async () => {
    const f = ler('components/client-portal/rede-do-portal.tsx')
    expect(f).toMatch(/export function useNomeDaRede\(\)/)
  })
})

describe('A23: o "Meus dados pessoais" diz a quem pedir para apagar os dados ou retirar o consentimento', () => {
  it('uma linha, com o nome da rede, sem botão novo', () => {
    const f = ler('components/client-portal/data-request-card.tsx')
    expect(f).toMatch(/data-lgpd-a-rede/)
    expect(f).toMatch(/Para apagar os seus dados ou retirar o seu consentimento, \{fala\.faleCom\}\./)
  })
})

describe('A19: o cartão do pré-pago diz quantos foram usados', () => {
  it('"3 já pagos · 1 usado · 2 para agendar"', async () => {
    const { textoDoPrePagoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoPrePagoNoApp(3, 1, '2 para agendar')).toBe('3 já pagos · 1 usado · 2 para agendar')
    expect(textoDoPrePagoNoApp(3, 2, 'nada para agendar · 1 agendada')).toBe('3 já pagos · 2 usados · nada para agendar · 1 agendada')
    expect(textoDoPrePagoNoApp(2, 0, '2 para agendar')).toBe('2 já pagos · 2 para agendar')
    expect(textoDoPrePagoNoApp(1, 0, '1 para agendar')).toBe('1 já pago · 1 para agendar')
    expect(ler('app/[slug]/cliente/home/page.tsx')).toMatch(/textoDoPrePagoNoApp\(v\.quantity, v\.usadas, textoDoParaAgendar\(v\.contagem\)\)/)
  })
})
