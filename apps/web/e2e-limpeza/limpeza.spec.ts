import { test } from '@playwright/test'
import { varrerSobras } from '../e2e/apoio/limpeza'
import { apagarRedesAdiadas, dirDoRegistro, lerRegistro } from '../e2e/apoio/limpeza-adiada'

/**
 * Os dois passos que cercam a completa (`playwright.limpeza.config.ts`, F25).
 * Não falham a rodada — é higiene, como a varredura sempre foi —, mas não se
 * calam: o que não saiu aparece aqui (e, no Actions, como aviso).
 */

const aviso = (texto: string) => {
  console.warn(texto)
  if (process.env.CI) console.log(`::warning::${texto.replace(/\r?\n/g, ' ')}`)
}

test('varredura das sobras de rodadas anteriores', async () => {
  const inicio = Date.now()
  const { apagou, falhas } = await varrerSobras()
  console.log(`[e2e] varredura em ${Math.round((Date.now() - inicio) / 1000)} s:`, Object.keys(apagou).length ? apagou : 'nada')
  for (const f of falhas) aviso(`[e2e] varredura NÃO apagou ${f.o_que}: ${f.erro}`)
})

test('as redes adiadas desta rodada', async () => {
  const inicio = Date.now()
  const anotadas = lerRegistro().length
  console.log(`[e2e] ${anotadas} redes de teste anotadas em ${dirDoRegistro()}`)
  const { redes, falhas } = await apagarRedesAdiadas()
  console.log(`[e2e] ${redes} de ${anotadas} redes de teste apagadas em ${Math.round((Date.now() - inicio) / 1000)} s`)
  for (const f of falhas) aviso(`[e2e] a limpeza do fim NÃO apagou ${f.o_que}: ${f.erro}`)
})
