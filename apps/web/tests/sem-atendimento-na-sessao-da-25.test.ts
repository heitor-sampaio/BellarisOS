import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * D12 da 25ª simulação (o Heitor, 18/11: "Só inicia e conclui atendimento quem
 * tem gerenciar no atendimento"; CLAUDE.md §14, o botão que a pessoa não pode
 * usar): quem tem a Agenda e o PDV, sem o Atendimento,
 * - via "Planejamento" na tela da sessão e ganhava 500 ao abrir (os leitores
 *   do plano pedem o Atendimento em Ver);
 * - via "Iniciar" nas sessões do pacote e do plano da ficha
 *   (`treatment-sessions-modal.tsx`, só por `isBooked`).
 */
describe('D12: sem o Atendimento, nada de "Planejamento" nem de "Iniciar"', () => {
  it('a sessão recebe podeVerPlanos (o Atendimento em Ver) e esconde o botão sem ele', () => {
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/podeVerPlanos=\{can\(ctx, 'atendimento', 'VIEW'\)\}/)
    const t = ler('components/branch/appointment-session.tsx')
    expect(t).toMatch(/\{podeVerPlanos && \(\s*<button type="button" onClick=\{\(\) => setPlanejamentoAberto\('tratamento'\)\}/)
    expect(t).toMatch(/<PainelPlanejamento[\s\S]*?podeVerPlanos=\{podeVerPlanos\}/)
  })
  it('as sessões do pacote e do plano: "Iniciar" só com o Atendimento em Gerenciar', () => {
    for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(ler(pagina), pagina).toMatch(/podeIniciarAtendimento=\{can\(ctx, 'atendimento', 'MANAGE'\)\}/)
    }
    expect(ler('components/branch/client-profile.tsx')).toMatch(/<TreatmentFileModal[\s\S]*?podeIniciarAtendimento=\{podeIniciarAtendimento\}/)
    expect(ler('components/branch/treatment-file-modal.tsx')).toMatch(/<TreatmentSessionsModal[\s\S]*?podeIniciar=\{podeIniciarAtendimento\}/)
    const m = ler('components/branch/treatment-sessions-modal.tsx')
    expect(m).toMatch(/\{isBooked && sess\.appointmentId && podeIniciar && \(/)
  })
})
