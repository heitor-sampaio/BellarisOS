import { describe, it, expect } from 'vitest'
import { daMeta } from '@/lib/templates/importar'

/**
 * O template como a Meta o devolve vira o nosso rascunho — e o que o sistema
 * não sabe ENVIAR entra marcado (só leitura), em vez de ficar de fora: a
 * conta mostra tudo o que tem, e o inbox só oferece o que dá para mandar.
 */
describe('daMeta', () => {
  it('lê cabeçalho, corpo, rodapé, botões e os exemplos nomeados', () => {
    const r = daMeta({
      id: '901', name: 'boas_vindas', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Oi, {{nome}}', example: { header_text_named_params: [{ param_name: 'nome', example: 'Ana' }] } },
        { type: 'BODY', text: 'Seu horário é {{data}}.', example: { body_text_named_params: [{ param_name: 'data', example: '12/03' }] } },
        { type: 'FOOTER', text: 'Clínica' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmo' }, { type: 'URL', text: 'Site', url: 'https://x.com' }] },
      ],
    })
    expect(r).toEqual({
      meta_template_id: '901', name: 'boas_vindas', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR',
      header_text: 'Oi, {{nome}}', body_text: 'Seu horário é {{data}}.', footer_text: 'Clínica',
      buttons: [{ type: 'QUICK_REPLY', text: 'Confirmo' }, { type: 'URL', text: 'Site', url: 'https://x.com' }],
      example_values: { nome: 'Ana', data: '12/03' },
      rejection_reason: null, nao_suportado: null,
    })
  })

  it('marca o que o sistema não envia, dizendo por quê', () => {
    const base = { id: '1', name: 'x', status: 'APPROVED', category: 'MARKETING', language: 'pt_BR' }
    const motivo = (components: unknown[], extra: Record<string, unknown> = {}) =>
      daMeta({ ...base, ...extra, components } as Parameters<typeof daMeta>[0])?.nao_suportado
    expect(motivo([{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Promo' }])).toMatch(/imagem/i)
    expect(motivo([{ type: 'BODY', text: 'Oi {{1}}', example: { body_text: [['Ana']] } }])).toMatch(/numeradas/i)
    expect(motivo([{ type: 'BODY', text: 'Ligue' }, { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+55' }] }])).toMatch(/botão/i)
    expect(motivo([{ type: 'BODY', text: 'Veja' }, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.com/{{1}}' }] }])).toMatch(/link/i)
    expect(motivo([{ type: 'BODY', text: 'Código' }], { category: 'AUTHENTICATION' })).toMatch(/autenticação/i)
    expect(motivo([{ type: 'BODY', text: 'Oi' }, { type: 'CAROUSEL', cards: [] }])).toMatch(/carrossel/i)
  })

  it('traduz os status da Meta para os nossos, e ignora o que está sendo apagado', () => {
    const t = (status: string) => daMeta({ id: '1', name: 'x', status, category: 'UTILITY', language: 'pt_BR', components: [{ type: 'BODY', text: 'Oi' }] })
    expect(t('IN_APPEAL')?.status).toBe('PENDING')
    expect(t('LIMIT_EXCEEDED')?.status).toBe('DISABLED')
    expect(t('PAUSED')?.status).toBe('PAUSED')
    expect(t('PENDING_DELETION')).toBeNull()
    expect(t('DELETED')).toBeNull()
  })
})
