import { describe, it, expect } from 'vitest'
import { mascararSegredos, mesclarSegredos, SEGREDO_GUARDADO } from '@/lib/integracoes/sem-segredo'
import { ehAnexoClinico } from '@/lib/clientes/anexos'

describe('mascararSegredos — credencial não vai à tela', () => {
  it('troca o segredo preenchido pelo marcador e mantém o resto', () => {
    expect(mascararSegredos({ token: 'abc', baseUrl: 'https://x', accessToken: '', appSecret: 's' }))
      .toEqual({ token: SEGREDO_GUARDADO, baseUrl: 'https://x', appSecret: SEGREDO_GUARDADO })
  })

  it('também dentro de listas (o token de cada página do Messenger)', () => {
    expect(mascararSegredos({ pages: [{ pageId: '1', access_token: 'p1' }], access_token: 'u' }))
      .toEqual({ pages: [{ pageId: '1', access_token: SEGREDO_GUARDADO }], access_token: SEGREDO_GUARDADO })
  })

  it('config vazia ou nula', () => {
    expect(mascararSegredos(null)).toEqual({})
  })
})

describe('mesclarSegredos — salvar com o marcador mantém o do banco', () => {
  it('marcador vira o valor guardado; valor novo vale', () => {
    expect(mesclarSegredos({ token: SEGREDO_GUARDADO, baseUrl: 'https://y' }, { token: 'antigo' }))
      .toEqual({ token: 'antigo', baseUrl: 'https://y' })
    expect(mesclarSegredos({ token: 'novo' }, { token: 'antigo' })).toEqual({ token: 'novo' })
  })

  it('marcador sem nada no banco some (não grava o marcador como token)', () => {
    expect(mesclarSegredos({ token: SEGREDO_GUARDADO }, {})).toEqual({})
  })
})

describe('ehAnexoClinico', () => {
  it('exame, laudo, foto clínica, receita e termo são prontuário', () => {
    for (const c of ['exame', 'laudo', 'foto_clinica', 'receita', 'termo_consentimento']) expect(ehAnexoClinico(c)).toBe(true)
    for (const c of ['contrato', 'outro', null, '']) expect(ehAnexoClinico(c)).toBe(false)
  })
})
