import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Intuitivo não é explicativo (o Heitor, 2026-11-26: "isso não é ser intuitivo,
 * é ser explicativo e não isso que eu quero. Ser intuitivo é justamente o
 * contrario, ser facil de usar mesmo sem muitas explicações."; CLAUDE.md,
 * princípio 7). Atrito não se corrige com frase que explica a tela: rótulo
 * curto e mensagem de recusa ficam; o parágrafo que diz como a tela funciona
 * sai. Estas quatro notas tinham entrado como correção de atrito.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\r/g, '')

describe('as telas não explicam como funcionam', () => {
  it('o DRE não explica de que se compõe o cartão das despesas pagas', () => {
    const tela = fonte('components/admin/reports-bi-view.tsx')
    expect(tela).not.toMatch(/data-despesas-do-cartao/)
    expect(tela).not.toMatch(/As despesas pagas no caixa \(/)
  })

  it('a aba Comercial não explica o recorte: o rótulo dos cartões da rede diz "(rede)"', () => {
    const tela = fonte('components/admin/reports-bi-view.tsx')
    expect(tela).not.toMatch(/data-oportunidades-da-rede/)
    expect(tela).not.toMatch(/As oportunidades são da rede: o recorte/)
    expect(tela).toMatch(/const daRede = p\.selectedBranchId && \(p\.allBranches \?\? p\.branches\)\.length > 1 \? ' \(rede\)' : ''/)
    expect(tela).toMatch(/label=\{`Conversão\$\{daRede\}`\}/)
    expect(tela).toMatch(/label=\{`Oportunidades recebidas\$\{daRede\}`\}/)
  })

  it('o "Editar registro" não explica onde se corrigem os insumos', () => {
    expect(fonte('components/branch/appointment-session.tsx')).not.toMatch(/data-insumos-no-editar|TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO/)
    expect(fonte('lib/atendimento/registro-travado.ts')).not.toMatch(/TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO/)
  })

  it('a lista vazia do Agendar não ensina o caminho do encaixe', () => {
    expect(fonte('components/branch/appointment-modal.tsx')).not.toMatch(/encaixeDaListaVazia|data-ninguem-livre-encaixe/)
    expect(fonte('lib/agenda/so-o-que-esta-livre.ts')).not.toMatch(/encaixeDaListaVazia/)
    // A mensagem curta da lista vazia fica.
    expect(fonte('components/branch/appointment-modal.tsx')).toContain('{NINGUEM_LIVRE_NO_HORARIO} Escolha outro horário para ver quem atende.')
  })
})
