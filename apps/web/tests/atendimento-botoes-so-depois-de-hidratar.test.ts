import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

// A tela do atendimento chega pronta do servidor, mas os botões só funcionam
// depois que o navegador a hidrata. O clique no "Check-in e iniciar" antes disso
// se perdia calado: o botão não fazia nada, e nada dizia por quê (no celular
// lento, a pessoa toca e o atendimento não começa). Até hidratar, os botões da
// ação principal ficam desligados.
const arquivoDoGancho = join(__dirname, '../lib/use-hidratado.ts')
const sessao = readFileSync(join(__dirname, '../components/branch/appointment-session.tsx'), 'utf8')

describe('os botões do atendimento só valem depois de hidratar', () => {
  it('o gancho diz "não hidratado" no servidor', async () => {
    expect(existsSync(arquivoDoGancho)).toBe(true)
    const { useHidratado } = await import('../lib/use-hidratado')
    const Sonda = () => createElement('span', null, useHidratado() ? 'sim' : 'nao')
    expect(renderToString(createElement(Sonda))).toContain('nao')
  })

  const botoes: [string, RegExp][] = [
    ['Check-in e iniciar', /onClick=\{\(\) => handleChegarEIniciar\(\)\} disabled=\{[^}]*!hidratado/],
    ['Check-in', /onClick=\{handleCheckin\} disabled=\{[^}]*!hidratado/],
    ['Iniciar atendimento', /onClick=\{\(\) => handleStart\(\)\} disabled=\{[^}]*!hidratado/],
    ['Finalizar atendimento', /setShowFinish\(true\)\s*\}\}\s*disabled=\{!hidratado\}/],
    ['Não compareceu', /setConfirmandoFalta\(true\); setErroDaFalta\(null\) \}\}\s*disabled=\{!hidratado\}/],
    ['Cancelar', /onClick=\{\(\) => setShowCancel\(true\)\}\s*disabled=\{!hidratado\}/],
  ]
  for (const [nome, regra] of botoes) {
    it(nome, () => expect(sessao).toMatch(regra))
  }
})
