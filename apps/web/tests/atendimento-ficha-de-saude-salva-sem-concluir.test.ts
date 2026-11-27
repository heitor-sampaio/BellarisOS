import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AT-03 (UM4: o clínico é do Prontuário em Gerenciar, "sem precisar atender"):
 * na tela do atendimento que monta plano (o formulário da avaliação), a ficha
 * de saúde digitada só se gravava no "Finalizar" ou no plano — quem tem o
 * Prontuário em Gerenciar e não conclui perdia o que digitou ("Fica só nesta
 * aba"). Agora ela grava ali mesmo, pela action da ficha da cliente
 * (`salvarAnamneseGeral`, a permissão do Prontuário em Gerenciar), e a tela
 * responde "Salvo".
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')

describe('a ficha de saúde do atendimento se salva sem concluir', () => {
  const c = fonte('components/branch/anamnese-geral.tsx')
  const i = c.indexOf('export const AnamneseNaAvaliacao')
  const avaliacao = c.slice(i)

  // O botão fica dentro do cartão "Ficha de saúde" e se chama só "Salvar": ao lado está o "Salvar ficha de atendimento",
  // e um segundo "Salvar ficha…" na mesma tela tornava ambíguo o botão da ficha de atendimento
  // (`e2e/atendimento-ficha-planejador-injetaveis.spec.ts`, "Salvar ficha").
  it('o cartão da avaliação tem o "Salvar", pela action da ficha da cliente, sem outro "Salvar ficha" na tela', () => {
    expect(avaliacao).toMatch(/salvarAnamneseGeral\(\{ clientId, respostas/)
    expect(avaliacao).toMatch(/'Salvando…' : 'Salvar'\}/)
    expect(avaliacao).not.toMatch(/Salvar ficha de saúde'/)
    expect(avaliacao).toMatch(/data-ficha-de-saude-salva/)
  })

  it('a tela do atendimento passa a cliente ao cartão editável da avaliação', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toMatch(/<AnamneseNaAvaliacao ref=\{anamneseDaAvaliacao\}[^\n]*clientId=\{client\.id\}/)
  })
})
