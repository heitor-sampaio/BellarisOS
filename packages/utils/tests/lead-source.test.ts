import { describe, it, expect } from 'vitest'
import {
  LEAD_SOURCES, LEAD_SOURCE_KEYS, sourceStyle,
  deriveLeadSource, resolveLeadSource, mergeTags,
} from '../src/lead-source'

describe('deriveLeadSource', () => {
  it('gclid ou utm_source=google viram Google Ads', () => {
    expect(deriveLeadSource({ gclid: 'abc' }).source).toBe('Google Ads')
    expect(deriveLeadSource({ utm_source: 'GOOGLE' }).source).toBe('Google Ads')
  })

  it('fbclid, ctwa_clid e referral viram Meta Ads', () => {
    expect(deriveLeadSource({ fbclid: 'x' }).source).toBe('Meta Ads')
    expect(deriveLeadSource({ referral: { ctwaClid: 'c1' } }).source).toBe('Meta Ads')
    expect(deriveLeadSource({ referral: { sourceType: 'ad' } }).source).toBe('Meta Ads')
  })

  it('a plataforma do Meta sai do utm ou da URL de origem', () => {
    expect(deriveLeadSource({ utm_source: 'ig' }).utm_source).toBe('instagram')
    expect(deriveLeadSource({ fbclid: 'x', referral: { sourceUrl: 'https://fb.me/abc' } }).utm_source).toBe('facebook')
  })

  it('o ctwa_clid é preservado para casar a conversa com o anúncio', () => {
    expect(deriveLeadSource({ referral: { ctwaClid: 'c1' } }).ctwa_clid).toBe('c1')
  })

  it('sem nenhuma atribuição, é orgânico', () => {
    expect(deriveLeadSource({}).source).toBe('Orgânico')
  })

  it('a tag de origem espelha o source', () => {
    expect(deriveLeadSource({ gclid: 'abc' }).tags).toEqual(['Google Ads'])
  })
})

describe('resolveLeadSource', () => {
  it('atribuição real ganha do dropdown', () => {
    expect(resolveLeadSource({ gclid: 'abc' }, 'Indicação').source).toBe('Google Ads')
  })

  it('sem atribuição, respeita a escolha manual', () => {
    expect(resolveLeadSource({}, 'Indicação').source).toBe('Indicação')
  })

  it('sem nada, orgânico', () => {
    expect(resolveLeadSource({}, '   ').source).toBe('Orgânico')
    expect(resolveLeadSource({}, null).source).toBe('Orgânico')
  })
})

describe('mergeTags', () => {
  it('deduplica preservando a ordem', () => {
    expect(mergeTags(['Meta Ads'], ['VIP', 'Meta Ads'])).toEqual(['Meta Ads', 'VIP'])
  })

  it('descarta vazios e aparas', () => {
    expect(mergeTags(['  VIP  ', '', '   '], null, undefined)).toEqual(['VIP'])
  })
})

describe('vocabulário de origens', () => {
  it('as chaves não se repetem', () => {
    expect(new Set(LEAD_SOURCE_KEYS).size).toBe(LEAD_SOURCE_KEYS.length)
  })

  it('só Meta e Google são pagas', () => {
    expect(LEAD_SOURCES.filter(s => s.paid).map(s => s.key)).toEqual(['Meta Ads', 'Google Ads'])
  })

  it('origem desconhecida (dado legado) recebe estilo neutro, sem quebrar', () => {
    expect(sourceStyle('Panfleto')).toEqual(sourceStyle(null))
    expect(sourceStyle(undefined)).toEqual(sourceStyle(''))
  })
})
