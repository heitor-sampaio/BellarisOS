import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A configuração da rede toda é só da Admin da rede (o Heitor, 18/11, na
 * auditoria das regras, pergunta 8: "só pela conta admin"). Até aqui bastava
 * ter "A rede inteira" com o módulo em Gerenciar (H7, 2026-11-01). A trava lê o
 * CARGO de sistema gravado (`ctx.isNetworkAdmin`, do membro no banco), nunca a
 * claim `role` nem o rótulo (C58, F70).
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
/** O contexto com a abrangência junto: a trava não pode olhar para ela. */
const quem = (isNetworkAdmin: boolean, branchId: string | null) => ({ isNetworkAdmin, branchId })

describe('quem mexe na configuração da rede toda', () => {
  it('a Admin da rede, e só ela', async () => {
    const { mexeNaConfigDaRede, recusaDaConfigDaRede, CONFIG_DA_REDE } = await import('@/lib/configuracao-da-rede')
    expect(CONFIG_DA_REDE).toBe('Esta configuração é só da Admin da rede.')
    expect(mexeNaConfigDaRede(quem(true, null))).toBe(true)
    // "A rede inteira" sem o cargo de Admin da rede não basta mais.
    expect(mexeNaConfigDaRede(quem(false, null))).toBe(false)
    expect(mexeNaConfigDaRede(quem(false, 'b1'))).toBe(false)
    expect(recusaDaConfigDaRede(quem(false, null))).toBe(CONFIG_DA_REDE)
    expect(recusaDaConfigDaRede(quem(true, null))).toBeNull()
  })

  it('o aviso do quadro diz que funis e etapas são da Admin da rede', async () => {
    const { avisoDosFunis } = await import('@/lib/configuracao-da-rede')
    expect(avisoDosFunis(quem(false, null))).toBe('Funis e etapas são da rede toda: quem muda é a Admin da rede.')
    expect(avisoDosFunis(quem(true, null))).toBeNull()
  })

  it('a trava não lê a claim nem a abrangência', () => {
    const corpo = fonte('lib/configuracao-da-rede.ts')
    expect(corpo).toMatch(/isNetworkAdmin/)
    expect(corpo).not.toMatch(/ctx\.role/)
    expect(corpo).not.toMatch(/branchId === null/)
  })

  // A fidelidade (o programa e o catálogo), as taxas da maquininha e do Pix e o
  // adicional da assinatura são configuração da rede toda: conferiam a
  // abrangência ("A rede inteira") em vez do cargo de Admin da rede.
  it('a fidelidade, as maquininhas e a assinatura são da Admin da rede, não de quem tem "A rede inteira"', () => {
    for (const [arquivo, travas] of [
      ['actions/fidelidade.ts', 2],
      ['actions/maquininhas.ts', 1],
      ['actions/assinatura.ts', 1],
    ] as const) {
      const corpo = fonte(arquivo)
      expect(corpo.match(/recusaDaConfigDaRede\(ctx\)/g)?.length ?? 0, `${arquivo}: as gravações da configuração passam pela trava da Admin`).toBe(travas)
      expect(corpo, `${arquivo}: a abrangência não decide a configuração da rede toda`).not.toMatch(/ctx\.branchId [!=]== null/)
    }
    // O aviso da venda no cartão diz quem cadastra a taxa: as Admins da rede.
    expect(fonte('actions/maquininhas.ts')).toMatch(/mexeNaConfigDaRede\(ctx\)/)
    expect(fonte('actions/maquininhas.ts')).toMatch(/adminsAtivasDaRede\(/)
  })

  it('a comissão do procedimento (e as regras de comissão e o crediário) é da Admin da rede', () => {
    const corpo = fonte('actions/comissoes.ts')
    expect(corpo.match(/!mexeNaConfigDaRede\(ctx\)/g)?.length).toBe(3)
    expect(corpo).not.toMatch(/ctx\.branchId !== null/)
    expect(corpo).not.toMatch(/quem muda é quem administra a rede/)
  })
})
