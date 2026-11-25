import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * O que a tela de Cargos, a Equipe e a configuração da rede dizem (princípios
 * 3 e 7; plataforma:CG-16 — o resumo do cargo diz o que cada módulo abre e de
 * onde vem o que não tem linha própria):
 *
 * - A1: o resumo prometia o Copilot com o plano da rede sem ele;
 * - A2: o cargo com o Prontuário e sem Clientes não dizia por onde a pessoa
 *   chega à cliente (a busca, só pelo nome; na ficha, só a aba Prontuário —
 *   `TAMBEM_ABRE`, lib/busca/tipos.ts);
 * - A3: "Prazo do portal (horas)" ao lado da validade do plano (em dias) não
 *   dizia, logo de início, que é o prazo para a cliente remarcar ou cancelar;
 * - A11: o Desativar não dizia o que acontece com a comissão em aberto da pessoa.
 */
const WEB = path.resolve(__dirname, '..')
const ler = (rel: string) => fs.readFileSync(path.join(WEB, rel), 'utf8')

describe('A1: o Copilot fora do plano não entra no resumo do cargo', () => {
  it('a prévia só diz o Copilot quando ele está no plano', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toMatch(/foraDoPlano\.includes\('copilot'\) \? null : copilotNoResumo\(levels\.copilot\)/)
    expect(f).not.toMatch(/\{copilotNoResumo\(levels\.copilot\) && \(/)
  })
})

describe('A2: o Prontuário sem Clientes diz por onde se chega à cliente', () => {
  it('a frase, e nulo nos outros casos', async () => {
    const { prontuarioSemClientesNoResumo } = await import('@/lib/permissions-copy')
    const frase = 'Sem Clientes, ela acha a cliente pela busca (só pelo nome), e na ficha abre só a aba Prontuário.'
    expect(prontuarioSemClientesNoResumo({ medical_records: 'VIEW', clients: 'NONE' })).toBe(frase)
    expect(prontuarioSemClientesNoResumo({ medical_records: 'MANAGE' })).toBe(frase)
    expect(prontuarioSemClientesNoResumo({ medical_records: 'VIEW', clients: 'VIEW' })).toBeNull()
    expect(prontuarioSemClientesNoResumo({ medical_records: 'NONE', clients: 'NONE' })).toBeNull()
  })
  it('a prévia do cargo usa a frase', () => {
    expect(ler('components/admin/roles-editor.tsx')).toMatch(/prontuarioSemClientesNoResumo\(levels\)/)
  })
})

describe('A3: o prazo do portal diz o que é, na dica', () => {
  it('a dica começa pelo que é, e diz que não é a validade do plano', () => {
    const f = ler('components/admin/settings-geral.tsx')
    expect(f).toContain('dica="É o prazo para a cliente remarcar ou cancelar o agendamento pelo app: até quantas horas antes do horário. Depois, só falando com a equipe. Não é a validade do plano proposto, que é em dias."')
  })
})

describe('A11: o Desativar diz o que acontece com a comissão em aberto', () => {
  it('a comissão fica a pagar, no nome da pessoa, e onde se vê', () => {
    const f = ler('components/admin/desativar-membro.tsx')
    expect(f).toMatch(/data-comissao-em-aberto/)
    expect(f).toContain('A comissão em aberto continua no nome de {nome}, a pagar: aparece em Financeiro → Comissões.')
  })
})
