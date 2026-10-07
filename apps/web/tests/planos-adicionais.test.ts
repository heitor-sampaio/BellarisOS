import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { normalizarRecursos, lerRecursos, TUDO_LIBERADO, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import {
  ADICIONAIS, lerAdicionais, recursosEfetivos, totalDosAdicionais, adicionaisAposTrocarDePlano, precoOferecido, pendentesNoAsaas,
} from '@estetica-os/nucleo/lib/planos/adicionais'

/**
 * Os ADICIONAIS do plano (2026-10-07): conexões de WhatsApp além do limite e
 * o Copilot avulso. O plano OFERECE (e diz o preço); a rede CONTRATA, com o
 * preço retratado; a mensalidade soma os dois. Ver docs/regras/plataforma.md.
 */
const base = (r: Partial<RecursosDoPlano> = {}): RecursosDoPlano => ({
  funcionalidades: ['agenda', 'inbox'], limites: { unidades: 1, membros: 3, whatsapp: 1 }, adicionais: {}, ...r,
})

describe('o catálogo de adicionais', () => {
  it('tem a conexão de WhatsApp (até 10) e o Copilot (um só, em breve)', () => {
    expect(ADICIONAIS.map(a => a.chave)).toEqual(['whatsapp', 'copilot'])
    expect(ADICIONAIS.find(a => a.chave === 'whatsapp')?.maximo).toBe(10)
    expect(ADICIONAIS.find(a => a.chave === 'copilot')?.maximo).toBe(1)
  })
})

describe('a oferta no plano (normalizarRecursos)', () => {
  const entrada = (adicionais: unknown, r: Partial<RecursosDoPlano> = {}) => ({ ...base(r), adicionais })

  it('aceita o preço de cada adicional, em centavos inteiros', () => {
    const r = normalizarRecursos(entrada({ whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } }))
    expect(r.ok && r.recursos.adicionais).toEqual({ whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } })
  })
  it('sem adicionais, nenhum oferecido', () => {
    const r = normalizarRecursos({ funcionalidades: [], limites: { unidades: 1, membros: 1, whatsapp: 1 } })
    expect(r.ok && r.recursos.adicionais).toEqual({})
  })
  it('recusa adicional desconhecido e preço inválido', () => {
    expect(normalizarRecursos(entrada({ sms: { valor_centavos: 100 } })).ok).toBe(false)
    for (const v of [0, -5, 12.5, '4900', null, 10_000_001]) {
      expect(normalizarRecursos(entrada({ whatsapp: { valor_centavos: v } })).ok, String(v)).toBe(false)
    }
  })
  it('WhatsApp extra só em plano com limite de números; Copilot avulso só em plano que não o inclui', () => {
    expect(normalizarRecursos(entrada({ whatsapp: { valor_centavos: 4900 } }, { limites: { unidades: 1, membros: 1, whatsapp: null } })).ok).toBe(false)
    expect(normalizarRecursos(entrada({ copilot: { valor_centavos: 9900 } }, { funcionalidades: ['copilot'] })).ok).toBe(false)
  })
  it('o retrato gravado é lido com tolerância: oferta inválida ou que não cabe no plano some', () => {
    const r = lerRecursos({ ...base({ limites: { unidades: 1, membros: 1, whatsapp: null } }),
      adicionais: { whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 'x' }, sms: { valor_centavos: 1 } } })
    expect(r?.adicionais).toEqual({})
    expect(lerRecursos({ funcionalidades: [], limites: {} })?.adicionais).toEqual({})
  })
  it('o plano novo nasce sem oferta nenhuma', () => {
    expect(TUDO_LIBERADO.adicionais).toEqual({})
  })
  it('precoOferecido: o preço do plano, ou null quando não oferece', () => {
    const r = base({ adicionais: { whatsapp: { valor_centavos: 4900 } } })
    expect(precoOferecido(r, 'whatsapp')).toBe(4900)
    expect(precoOferecido(r, 'copilot')).toBeNull()
    expect(precoOferecido(null, 'whatsapp')).toBeNull()
  })
})

describe('o contratado pela rede', () => {
  it('lerAdicionais: tolerante — quantidade fora da faixa, zero ou desconhecido some', () => {
    expect(lerAdicionais({
      whatsapp: { quantidade: 2, valor_centavos: 4900 },
      copilot: { quantidade: 3, valor_centavos: 9900 },
      sms: { quantidade: 1, valor_centavos: 1 },
    })).toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 } })
    expect(lerAdicionais({ whatsapp: { quantidade: 0, valor_centavos: 4900 } })).toEqual({})
    expect(lerAdicionais(null)).toEqual({})
    expect(lerAdicionais('x')).toEqual({})
  })
  it('o total soma quantidade × preço de cada um', () => {
    expect(totalDosAdicionais({ whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } })).toBe(19700)
    expect(totalDosAdicionais({})).toBe(0)
  })
})

describe('recursosEfetivos: o que a rede usa de fato', () => {
  it('o WhatsApp extra soma ao limite; o Copilot avulso entra nas funcionalidades', () => {
    const r = recursosEfetivos(base(), { whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } })
    expect(r?.limites.whatsapp).toBe(3)
    expect(r?.funcionalidades).toContain('copilot')
    expect(r?.funcionalidades).toEqual(['agenda', 'inbox', 'copilot'])
  })
  it('passa do teto do slider (o extra não para em 10)', () => {
    expect(recursosEfetivos(base({ limites: { unidades: 1, membros: 1, whatsapp: 10 } }), { whatsapp: { quantidade: 5, valor_centavos: 1 } })?.limites.whatsapp).toBe(15)
  })
  it('limite ilimitado continua ilimitado; sem retrato, tudo liberado', () => {
    expect(recursosEfetivos(base({ limites: { unidades: 1, membros: 1, whatsapp: null } }), { whatsapp: { quantidade: 2, valor_centavos: 1 } })?.limites.whatsapp).toBeNull()
    expect(recursosEfetivos(null, { whatsapp: { quantidade: 2, valor_centavos: 1 } })).toBeNull()
  })
  it('sem adicional, é o retrato', () => {
    expect(recursosEfetivos(base(), {})).toEqual(base())
  })
})

describe('adicionaisAposTrocarDePlano', () => {
  const contratados = { whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } }
  it('o que o plano novo já inclui sai (Copilot incluído, WhatsApp ilimitado); o resto fica com o preço contratado', () => {
    expect(adicionaisAposTrocarDePlano(contratados, base({ funcionalidades: ['copilot'] })))
      .toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 } })
    expect(adicionaisAposTrocarDePlano(contratados, base({ limites: { unidades: 1, membros: 1, whatsapp: null } })))
      .toEqual({ copilot: { quantidade: 1, valor_centavos: 9900 } })
    expect(adicionaisAposTrocarDePlano(contratados, base())).toEqual(contratados)
  })
  it('sem plano (tudo liberado), saem todos', () => {
    expect(adicionaisAposTrocarDePlano(contratados, null)).toEqual({})
  })
})

describe('verificação de 2026-10-07', () => {
  it('lerAdicionais guarda a marca de preço especial (dado pelo sistema)', () => {
    expect(lerAdicionais({ whatsapp: { quantidade: 1, valor_centavos: 0, especial: true } }))
      .toEqual({ whatsapp: { quantidade: 1, valor_centavos: 0, especial: true } })
    expect(lerAdicionais({ whatsapp: { quantidade: 1, valor_centavos: 4900, especial: 'sim' } }))
      .toEqual({ whatsapp: { quantidade: 1, valor_centavos: 4900 } })
  })
  it('pendentesNoAsaas: a ligada cujo total não chegou ao Asaas, e a de cortesia que voltou a ter valor', () => {
    expect(pendentesNoAsaas([
      { tenant_id: 'a', cobranca: 'ativa', valor_total_centavos: 14900, valor_no_asaas_centavos: 10000 },
      { tenant_id: 'b', cobranca: 'ativa', valor_total_centavos: 10000, valor_no_asaas_centavos: 10000 },
      { tenant_id: 'c', cobranca: 'ativa', valor_total_centavos: 10000, valor_no_asaas_centavos: null },
      { tenant_id: 'd', cobranca: 'cortesia', valor_total_centavos: 19900, valor_no_asaas_centavos: null },
      { tenant_id: 'e', cobranca: 'cortesia', valor_total_centavos: 0, valor_no_asaas_centavos: null },
      // Ligada e zerada: sempre pendente (o sistema pausa), mesmo com a anotação igual.
      { tenant_id: 'f', cobranca: 'ativa', valor_total_centavos: 0, valor_no_asaas_centavos: 0 },
    ])).toEqual(['a', 'c', 'd', 'f'])
  })
  it('o catálogo de adicionais é o que o banco conhece (a coluna gerada e a função de escrita)', () => {
    const dir = path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const textos = fs.readdirSync(dir).filter(n => n >= '20261007').sort().map(n => fs.readFileSync(path.join(dir, n), 'utf8'))
    // O total deixou de ser coluna gerada (2026-10-07): é o gatilho private.total_da_assinatura.
    const coluna = textos.filter(t => t.includes('create or replace function private.total_da_assinatura')).at(-1) ?? ''
    const funcao = textos.filter(t => t.includes('function public.assinatura_adicional_definir')).at(-1) ?? ''
    for (const a of ADICIONAIS) {
      expect(coluna, `gatilho do total: ${a.chave}`).toContain(`new.adicionais -> '${a.chave}'`)
      expect(funcao, `função de escrita: ${a.chave}`).toContain(`when '${a.chave}' then`)
    }
  })
})
