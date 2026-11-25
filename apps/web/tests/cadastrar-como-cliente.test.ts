import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O gesto de virar cliente, no painel do inbox e no card do quadro, é o botão
 * "Cadastrar como cliente" (revisão de 24/11, Q13 do catálogo de Clientes: "A
 * revisão (CR2) decidiu 'Cadastrar como cliente' nos dois lugares: o botão é
 * defeito de texto"). O envio do formulário dentro da janela continua
 * "Cadastrar cliente".
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('"Cadastrar como cliente" no inbox e no quadro', () => {
  for (const arquivo of ['components/admin/inbox-lead-panel.tsx', 'components/branch/crm-board.tsx']) {
    it(arquivo, () => {
      const t = fonte(arquivo)
      expect(t).toMatch(/<UserCheck size=\{\d+\} \/> Cadastrar como cliente/)
      expect(t).not.toMatch(/<UserCheck size=\{\d+\} \/> Cadastrar cliente/)
    })
  }
})
