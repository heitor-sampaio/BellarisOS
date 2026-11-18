import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as textos from '@/lib/clients/textos-do-cadastro'

/**
 * O "Novo cliente" não pergunta nem mostra a "Unidade de cadastro"
 * (auditoria das regras, 18/11; o Heitor: "o cliente não é da unidade, o
 * cliente é da rede" — H16; "Nada se prende a clients.branch_id" — CLAUDE.md
 * §5). Pela rede, com duas ou mais unidades, o formulário obrigava a escolher
 * uma ("Unidade de cadastro *"), e numa só a mostrava ("Unidade de cadastro:").
 * A ficha nasce na unidade do endereço (no portal de uma unidade) ou sem
 * unidade (pela rede) — a coluna fica só como "onde a ficha nasceu", e nada a
 * lê para decidir. O aviso de que a cliente é da rede continua.
 */

const WEB = join(__dirname, '..')

describe('o cadastro da cliente sem a unidade de cadastro', () => {
  it('o formulário não pergunta nem mostra a unidade de cadastro', () => {
    const form = readFileSync(join(WEB, 'components', 'branch', 'client-form.tsx'), 'utf8')
    expect(form).not.toMatch(/Unidade de cadastro/)
    const novo = readFileSync(join(WEB, 'app', 'admin', 'clients', 'new', 'page.tsx'), 'utf8')
    expect(novo).not.toMatch(/unidade de cadastro/i)
  })

  it('o aviso de que a cliente é da rede continua, com várias unidades', () => {
    const aviso = (textos as Record<string, unknown>).avisoDaFichaDaRede as ((v: boolean) => string | null) | undefined
    expect(aviso).toBeTypeOf('function')
    expect(aviso!(true)).toMatch(/é da rede/)
    expect(aviso!(false)).toBeNull()
  })
})
