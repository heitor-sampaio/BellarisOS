import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O "Reativar" da busca da topbar (AO-06; AO-01: a busca é atalho para a
 * janela que já existe e não grava) leva à ficha com o "Reativar cliente" à
 * vista (`?acao=reativar`). A2 da 40ª simulação: com a ficha DELA já aberta
 * (acabou de arquivá-la), o clique só trocava a URL — o mesmo componente
 * seguia montado, o menu só abria no estado inicial, e o "Reativar" não fazia
 * nada além de abrir a ficha. O menu abre quando o pedido CHEGA, não só ao
 * montar (o comportamento de tela; o E2E está em `e2e/clientes-arquivar.spec.ts`).
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('o ?acao=reativar abre o "Reativar cliente" também com a ficha já aberta', () => {
  it('o pedido que chega pela URL abre o menu (não só o estado inicial)', () => {
    const f = ler('components/branch/client-profile.tsx')
    // O ajuste no render quando o `?acao` muda (sem setState dentro de efeito).
    expect(f).toMatch(/if \(acaoDaUrl !== acaoVista\) \{\s*setAcaoVista\(acaoDaUrl\)\s*if \(acaoDaUrl === 'reativar' && !client\.isActive\) setMenuAberto\(true\)/)
  })
})
