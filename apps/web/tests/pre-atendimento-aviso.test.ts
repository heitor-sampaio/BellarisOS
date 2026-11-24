import { describe, it, expect } from 'vitest'
import { avisoDoPreAtendimento } from '@/lib/pre-atendimento/aviso'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * O aviso que sai para a cliente quando o agendamento deixa um pré-atendimento
 * pendente (2026-10-20). Vai para a tela de bloqueio do celular: nada sobre a
 * saúde dela no texto — só o convite e o link para a ficha.
 */
describe('avisoDoPreAtendimento', () => {
  it('leva à ficha no portal da rede do agendamento', () => {
    const a = avisoDoPreAtendimento('clinica-bela', 'COMPLETO')
    expect(a.type).toBe('pre_atendimento')
    expect(a.data).toEqual({ link: '/clinica-bela/cliente/pre-atendimento' })
  })

  it('pede a ficha inteira, ou só a confirmação dentro da validade', () => {
    expect(avisoDoPreAtendimento('x', 'COMPLETO').body).toMatch(/perguntas/i)
    expect(avisoDoPreAtendimento('x', 'CONFIRMAR').body).toMatch(/mudou/i)
  })

  it('não fala de saúde na tela de bloqueio', () => {
    for (const modo of ['COMPLETO', 'CONFIRMAR'] as const) {
      const { title, body } = avisoDoPreAtendimento('x', modo)
      expect(`${title} ${body}`).not.toMatch(/alergi|medicament|gesta|doen|saúde/i)
    }
  })
})

describe('mandar a ficha de saúde é da Agenda em Gerenciar: quem só vê a agenda não vê o bloco nem o botão (atendimento.md, envio manual)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('o "Enviar a ficha" e o "Enviar o link"', () => {
    it('a janela do agendamento e a sessão passam a permissão ao bloco', () => {
      expect(ler('components/branch/appointment-sheet.tsx')).toMatch(/<PreAtendimentoDoAgendamento [^>]*podeMandar=\{podeGerenciar && !isProfessional\}/)
      const s = ler('components/branch/appointment-session.tsx')
      expect(s).not.toMatch(/podeMandar=\{!isProfessional\}/)
      expect(s).toMatch(/podeGerenciarAgenda && \(\s*<button type="button" data-enviar-o-link-da-ficha/)
      expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/podeGerenciarAgenda=\{can\(ctx, 'agenda', 'MANAGE'\)\}/)
    })
    it('quem não manda não vê o bloco de mandar (só o estado: pendente ou respondida, sem botões)', () => {
      const b = ler('components/branch/pre-atendimento-do-agendamento.tsx')
      expect(b).toMatch(/if \(naoEnviada && !podeMandar\) return null/)
      expect(b).toMatch(/\{podeMandar && situacao\.podeLink && !link && !enviado && \(/)
    })
  })

})
