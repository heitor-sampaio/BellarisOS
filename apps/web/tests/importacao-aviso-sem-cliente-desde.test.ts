import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * IM-20: "Sem essa coluna, a prévia avisa que as fichas novas contam como
 * novas a partir de hoje." A D11 da 40ª dizia que o aviso não apareceu com a
 * coluna em "Não importar". A coluna em "Não importar" é `null` no `mapa` (o
 * `<option value="">` do passo das colunas), e o aviso sai; com a coluna
 * mapeada (a planilha da 40ª gravou o "Cliente desde" de 100 fichas), ele não
 * sai — a regra fala da COLUNA.
 */

const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

describe('o aviso sem "Cliente desde" na prévia (IM-20)', () => {
  it('com a coluna em "Não importar" (null no mapa), avisa', async () => {
    const { avisoSemClienteDesde } = await import('@/lib/importacao/o-que-entra')
    expect(avisoSemClienteDesde('clientes', ['name', 'phone', null, 'birth_date', null])).toMatch(/^Sem uma coluna em “Cliente desde”/)
  })

  it('com a coluna mapeada, não avisa', async () => {
    const { avisoSemClienteDesde } = await import('@/lib/importacao/o-que-entra')
    expect(avisoSemClienteDesde('clientes', ['name', 'phone', 'cliente_desde', null])).toBeNull()
  })

  it('"Não importar" vira null no mapa, e o aviso se desenha dentro da prévia (passo 3)', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toContain('<option value="">Não importar</option>')
    expect(f).toContain("escolherCampo(i, (e.target.value || null) as ChaveDeCampo | null)")
    const previa = f.indexOf('{/* 3. A prévia */}')
    const importacao = f.indexOf('{/* 4. A importação */}')
    const aviso = f.indexOf('data-sem-cliente-desde')
    expect(previa).toBeGreaterThan(0)
    expect(aviso).toBeGreaterThan(previa)
    expect(aviso).toBeLessThan(importacao)
    expect(f).toContain('{avisoSemClienteDesde(destino, mapa) && (')
  })
})
