import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O modal do procedimento, sob o Termo e o Contrato (A12 da 40ª simulação;
 * princípio 7, o Heitor, 26/11: "Ser intuitivo é justamente o contrario, ser
 * facil de usar mesmo sem muitas explicações"). Sem modelo nenhum, o campo
 * dizia um parágrafo ("… — crie em Configurações → Documentos. Abre em outra
 * aba: o que você preencheu aqui continua, e a lista se atualiza quando você
 * volta.") em cima do link "Abrir Configurações → Documentos", que já diz o
 * caminho. Fica o estado curto; o link segue (A22 da 16ª).
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('o Termo e o Contrato sem modelo dizem só o estado', () => {
  const f = ler('components/admin/procedure-form.tsx')
  it('o vazio é curto', () => {
    expect(f).toContain("vazio=\"Nenhum termo cadastrado.\"")
    expect(f).toContain("vazio=\"Nenhum contrato de procedimento cadastrado.\"")
    expect(f).not.toMatch(/vazio=\{`Nenhum (termo|contrato)[^`]*ABRE_EM_OUTRA_ABA/)
  })
  it('o link para criar continua', () => {
    expect(f).toContain("criar={rotaNoPortal(pathname, null, '/settings?tab=documentos')}")
    expect(f).toContain('Abrir Configurações → Documentos')
  })
})
