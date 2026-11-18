import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { LIMITES_PADRAO } from '@estetica-os/types'
import { vesperaSeCairNoSilencio } from '@/lib/automacoes/limites'
import { limitesAntesDeLigar } from '@/lib/automacoes/antes-de-ligar'

/**
 * D17 do levantamento das regras: o Heitor escolheu "a + c opcional"
 * (DEVLOG, 2ª volta, 2026-11-11): (a) o aviso na tela do silêncio entre 21:00
 * e 08:00; (c) a opção, DESLIGADA por padrão, "Se cair de madrugada, mandar na
 * véspera às 20:00". Com o MK1 o lembrete virou modelo das Automações e a
 * opção (c) sumiu — e, com o D2 da 19ª ("se o momento passou durante o
 * silêncio, não sai"), o lembrete de um horário antes das 08:00 nunca saía.
 * A opção volta, nos limites da automação.
 */

const FUSO = 'America/Sao_Paulo'
const LIGADA = { ...LIMITES_PADRAO, madrugadaNaVespera: true }

describe('Se cair de madrugada, mandar na véspera às 20:00', () => {
  it('nasce desligada', () => {
    expect(LIMITES_PADRAO.madrugadaNaVespera).toBe(false)
  })

  it('o lembrete que cairia às 05:00 sai na véspera às 20:00', () => {
    const ate = new Date('2026-11-20T08:00:00Z')   // 05:00 em Brasília, no silêncio
    const agora = new Date('2026-11-19T15:00:00Z') // 12:00 da véspera
    expect(vesperaSeCairNoSilencio(LIGADA, ate, agora, FUSO)?.toISOString()).toBe('2026-11-19T23:00:00.000Z')
  })

  it('o que cairia às 22:00 sai às 20:00 do mesmo dia', () => {
    const ate = new Date('2026-11-20T01:00:00Z')   // 22:00 de 19/11 em Brasília
    const agora = new Date('2026-11-19T15:00:00Z')
    expect(vesperaSeCairNoSilencio(LIGADA, ate, agora, FUSO)?.toISOString()).toBe('2026-11-19T23:00:00.000Z')
  })

  it('desligada, fora do silêncio, ou com as 20:00 já passadas: nada muda', () => {
    const ate = new Date('2026-11-20T08:00:00Z')
    const agora = new Date('2026-11-19T15:00:00Z')
    expect(vesperaSeCairNoSilencio(LIMITES_PADRAO, ate, agora, FUSO)).toBeNull()
    expect(vesperaSeCairNoSilencio(LIGADA, new Date('2026-11-20T13:00:00Z'), agora, FUSO)).toBeNull()
    expect(vesperaSeCairNoSilencio(LIGADA, ate, new Date('2026-11-19T23:30:00Z'), FUSO)).toBeNull()
  })

  it('a janela "Ligar a automação?" diz a opção ligada', () => {
    expect(limitesAntesDeLigar(LIGADA)).toMatch(/na véspera às 20:00/)
    expect(limitesAntesDeLigar(LIMITES_PADRAO)).not.toMatch(/véspera/)
  })

  it('a gaveta de limites oferece a opção, e a espera "antes de" a usa', () => {
    const painel = fs.readFileSync(path.join(__dirname, '../components/admin/automacoes/painel-de-limites.tsx'), 'utf8')
    expect(painel).toMatch(/Se cair de madrugada, mandar na véspera às 20:00/)
    const exec = fs.readFileSync(path.join(__dirname, '../lib/automacoes/executar.ts'), 'utf8')
    expect(exec).toMatch(/vesperaSeCairNoSilencio\(/)
  })
})
