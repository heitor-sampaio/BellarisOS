#!/usr/bin/env node
/**
 * Baixa as fontes dos documentos para `public/fontes-documento/` — rodar uma
 * vez, e de novo só ao mudar a lista (que tem de bater com
 * `lib/documentos/fontes.ts`; `tests/documentos-pdf.test.ts` confere que cada
 * arquivo existe E que o pdf-lib consegue embutir e desenhar com ele).
 *
 * Duas origens, porque o pdf-lib embute TTF ESTÁTICO (uma variável sairia
 * sempre no peso padrão, sem negrito) — e sem Python nesta máquina não há
 * fonttools para instanciar:
 *  - `repo`: os TTF estáticos do repositório google/fonts. Preferidos: são os
 *    arquivos originais. A Arimo só é estática num commit antigo (depois virou
 *    variável), fixado aqui.
 *  - `api`: a API CSS do Google Fonts, pedida com user-agent antigo, devolve
 *    instâncias estáticas por peso. ⚠️ Para Arimo, Carlito e Cousine o arquivo
 *    que ela serve QUEBRA o fontkit do pdf-lib ("beyond buffer length") — é
 *    por isso que as três vêm do repo.
 *
 *   node scripts/baixar-fontes.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GF = 'https://raw.githubusercontent.com/google/fonts'
const ARIMO_ESTATICA = '5e49edbd1875f214e0decae1e24b200066780fa8' // último commit com a Arimo estática (Apache 2.0)
const repo = (base, nome) => ({
  regular: `${base}/${nome}-Regular.ttf`, negrito: `${base}/${nome}-Bold.ttf`,
  italico: `${base}/${nome}-Italic.ttf`, 'negrito-italico': `${base}/${nome}-BoldItalic.ttf`,
})

const FONTES = {
  arimo:        { nome: 'Arimo',            repo: repo(`${GF}/${ARIMO_ESTATICA}/apache/arimo`, 'Arimo'),
                  licenca: `${GF}/${ARIMO_ESTATICA}/apache/arimo/LICENSE.txt`, tipo: 'Apache 2.0' },
  tinos:        { nome: 'Tinos',            repo: repo(`${GF}/main/ofl/tinos`, 'Tinos'), licenca: null, tipo: 'SIL Open Font License 1.1' },
  carlito:      { nome: 'Carlito',          repo: repo(`${GF}/main/ofl/carlito`, 'Carlito'), licenca: `${GF}/main/ofl/carlito/OFL.txt` },
  cousine:      { nome: 'Cousine',          repo: repo(`${GF}/main/ofl/cousine`, 'Cousine'), licenca: `${GF}/main/ofl/cousine/OFL.txt` },
  gelasio:      { nome: 'Gelasio',          api: 'Gelasio',          licenca: `${GF}/main/ofl/gelasio/OFL.txt` },
  hanken:       { nome: 'Hanken Grotesk',   api: 'Hanken Grotesk',   licenca: `${GF}/main/ofl/hankengrotesk/OFL.txt` },
  roboto:       { nome: 'Roboto',           api: 'Roboto',           licenca: `${GF}/main/ofl/roboto/OFL.txt` },
  'open-sans':  { nome: 'Open Sans',        api: 'Open Sans',        licenca: `${GF}/main/ofl/opensans/OFL.txt` },
  montserrat:   { nome: 'Montserrat',       api: 'Montserrat',       licenca: `${GF}/main/ofl/montserrat/OFL.txt` },
  lato:         { nome: 'Lato',             api: 'Lato',             licenca: `${GF}/main/ofl/lato/OFL.txt` },
  merriweather: { nome: 'Merriweather',     api: 'Merriweather',     licenca: `${GF}/main/ofl/merriweather/OFL.txt` },
  playfair:     { nome: 'Playfair Display', api: 'Playfair Display', licenca: `${GF}/main/ofl/playfairdisplay/OFL.txt` },
}

const UA = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1'
const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fontes-documento')

async function baixar(url, opcoes) {
  const r = await fetch(url, opcoes)
  if (!r.ok) throw new Error(`${r.status} em ${url}`)
  return r
}

async function daApi(familia) {
  const css = await (await baixar(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia)}:ital,wght@0,400;0,700;1,400;1,700`,
    { headers: { 'User-Agent': UA } },
  )).text()
  const urls = {}
  for (const bloco of css.split('@font-face').slice(1)) {
    const italico = /font-style:\s*italic/.test(bloco)
    const negrito = /font-weight:\s*700/.test(bloco)
    const url = /url\((https:[^)]+\.ttf)\)/.exec(bloco)?.[1]
    if (!url) throw new Error(`${familia}: sem TTF no CSS (o Google mudou a resposta?)`)
    urls[negrito ? (italico ? 'negrito-italico' : 'negrito') : (italico ? 'italico' : 'regular')] = url
  }
  return urls
}

await mkdir(destino, { recursive: true })
const licencas = []
for (const [id, f] of Object.entries(FONTES)) {
  const urls = f.repo ?? await daApi(f.api)
  const estilos = Object.keys(urls)
  if (estilos.length !== 4) throw new Error(`${f.nome}: vieram ${estilos.length} estilos, esperava 4`)
  for (const [estilo, url] of Object.entries(urls)) {
    await writeFile(path.join(destino, `${id}-${estilo}.ttf`), Buffer.from(await (await baixar(url)).arrayBuffer()))
  }
  // A Tinos é OFL (METADATA.pb do google/fonts), mas o diretório não traz o texto.
  const texto = f.licenca
    ? await (await baixar(f.licenca)).text()
    : `${f.nome}: SIL Open Font License 1.1, conforme google/fonts (ofl/${id}/METADATA.pb).\nTexto da licença: https://openfontlicense.org/open-font-license-official-text/\n`
  await writeFile(path.join(destino, `LICENCA-${id}.txt`), texto)
  licencas.push(`- ${f.nome}: ${f.tipo ?? 'SIL Open Font License 1.1'} (LICENCA-${id}.txt)`)
  console.log(`ok ${f.nome} (${f.repo ? 'repo' : 'api'})`)
}
await writeFile(path.join(destino, 'LEIA-ME.md'), [
  '# Fontes dos documentos',
  '',
  'Embutidas nos PDFs de termos e contratos e usadas na tela (`@font-face` em',
  '`packages/nucleo/src/estilos/globals.css`). Baixadas do Google Fonts por `scripts/baixar-fontes.mjs`.',
  'Todas de licença livre, que permite embutir e redistribuir:',
  '',
  ...licencas,
  '',
].join('\n'))
