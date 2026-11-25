import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { falaDaRede } from '@/lib/clientes/fala-da-rede'

/**
 * Sem "clínica" no portal e no app — o NOME da rede no lugar (CA1, a
 * recomendação que o Heitor aprovou em 13/11 com "Concordo": "Crédito na
 * clínica", "Telefone da clínica", "A clínica enviou um documento" passam a
 * usar o NOME da rede). O feito em 16/11 usou "a equipe" ("Seu crédito",
 * "fale com a equipe", "Telefone: …"), e a revisão de 24/11 (Q06 do catálogo
 * de Clientes) o tomou por defeito.
 */
const WEB = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('o nome da rede no portal da cliente', () => {
  it('as frases levam o nome, sem artigo (o gênero do nome não se adivinha)', () => {
    const f = falaDaRede('Estética Bella')
    expect(f.credito).toBe('Crédito em Estética Bella')
    expect(f.faleCom).toBe('fale com Estética Bella')
    expect(f.FaleCom).toBe('Fale com Estética Bella')
    expect(f.falarCom).toBe('Falar com Estética Bella')
    expect(f.telefone).toBe('Telefone de Estética Bella')
  })

  it('o portal não fala mais "Seu crédito", "fale com a equipe" nem "Telefone:" no lugar do nome da rede', () => {
    const fontes = [
      ...arquivos(path.join(WEB, 'app', '[slug]', 'cliente')),
      ...arquivos(path.join(WEB, 'components', 'client-portal')),
    ]
    const achados: string[] = []
    for (const f of fontes) {
      const s = fs.readFileSync(f, 'utf8')
      for (const re of [/Seu crédito/, /[Ff]ale com a equipe/, /Falar com a equipe/, />\s*Telefone: \{/, /^\s*Telefone: \{/m]) {
        if (re.test(s)) achados.push(`${path.relative(WEB, f)}: ${re}`)
      }
    }
    expect(achados).toEqual([])
  })
})

/**
 * As recusas e os avisos à cliente que nascem fora das telas do portal (as
 * actions do portal e as frases de lib/), as sobras da CA1 (o agente S,
 * catálogo de 24/11): "Fale com a equipe" vira o nome da rede — "A equipe"
 * fica só onde é ela quem age. Os links públicos (assinar, a ficha) dizem o
 * remetente que a página já mostra; sem ele (o link que não existe), "a equipe".
 */
describe('o nome da rede nas recusas e nos avisos à cliente', () => {
  const bella = falaDaRede('Estética Bella')

  it('as actions e as frases do portal não dizem mais "fale com a equipe"', () => {
    const achados = [
      'actions/fidelidade-portal.ts', 'actions/portal-agendamentos.ts', 'actions/plano-da-cliente.ts',
      'lib/clients/arquivada.ts', 'lib/plano-de-tratamento/cancelar-proposto.ts', 'lib/plano-de-tratamento/validade.ts',
    ].filter(f => /[Ff]ale com a equipe/.test(fs.readFileSync(path.join(WEB, f), 'utf8')))
    expect(achados).toEqual([])
  })

  it('a arquivada no app e a proposta vencida', async () => {
    const { clienteArquivadaNoApp } = await import('@/lib/clients/arquivada')
    expect(clienteArquivadaNoApp(bella)).toBe('Fale com Estética Bella para agendar.')
    const { avisoDaPropostaVencida } = await import('@/lib/plano-de-tratamento/validade')
    expect(avisoDaPropostaVencida('10/11/2026', bella))
      .toBe('Proposta vencida em 10/11/2026: os valores podem ter mudado. Na dúvida, fale com Estética Bella antes de aceitar.')
  })

  it('o plano cancelado, no aceite pelo app: a frase e o nome da rede', async () => {
    const { RECUSA_DO_PLANO_CANCELADO_NO_APP } = await import('@/lib/plano-de-tratamento/cancelar-proposto')
    expect(RECUSA_DO_PLANO_CANCELADO_NO_APP).toBe('Este plano foi cancelado e não pode mais ser aceito.')
    expect(fs.readFileSync(path.join(WEB, 'actions', 'plano-da-cliente.ts'), 'utf8'))
      .toContain('`${RECUSA_DO_PLANO_CANCELADO_NO_APP} ${fala.FaleCom} se quiser retomar o tratamento.`')
  })

  it('os links públicos: o remetente que a página mostra; sem ele, a equipe', async () => {
    const { mensagemDoEstado } = await import('@/lib/documentos/link')
    expect(mensagemDoEstado('indisponivel', 'Studio Manacá')).toBe('Este documento não está mais esperando assinatura. Fale com Studio Manacá.')
    expect(mensagemDoEstado('indisponivel', null)).toBe('Este documento não está mais esperando assinatura. Fale com a equipe.')
    const f = fs.readFileSync(path.join(WEB, 'app', 'assinar', '[token]', 'page.tsx'), 'utf8')
    expect(f).toMatch(/mensagemDoEstado\(espiada\.estado, espiada\.remetente\)/)
    const g = fs.readFileSync(path.join(WEB, 'app', 'pre-atendimento', '[token]', 'page.tsx'), 'utf8')
    expect(g).toMatch(/mensagemDoLinkDaFicha\(espiada\.estado, espiada\.remetente\)/)
  })
})
