/**
 * Tipo e medidas (em pixels) de uma imagem, lidos do CABEÇALHO do arquivo —
 * não do `type` que o navegador declara, que vem do nome. Só PNG e JPEG: são
 * os dois que o pdf-lib embute. Qualquer outra coisa (ou arquivo corrompido)
 * devolve nulo.
 */
export function medidasDaImagem(b: Uint8Array): { tipo: 'png' | 'jpg'; largura: number; altura: number } | null {
  const u32 = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  const u16 = (i: number) => (b[i]! << 8) | b[i + 1]!

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length > 24 && PNG.every((v, i) => b[i] === v)) {
    const largura = u32(16), altura = u32(20)
    return largura > 0 && altura > 0 && largura < 20_000 && altura < 20_000 ? { tipo: 'png', largura, altura } : null
  }

  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marca = b[i + 1]!
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC): lá estão as medidas.
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        const altura = u16(i + 5), largura = u16(i + 7)
        return largura > 0 && altura > 0 ? { tipo: 'jpg', largura, altura } : null
      }
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue }
      i += 2 + u16(i + 2)
    }
  }
  return null
}
