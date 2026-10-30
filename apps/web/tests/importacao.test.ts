import { describe, it, expect } from 'vitest'
import { decodificar, lerCsv } from '@/lib/importacao/csv'
import { sugerirMapeamento, camposDoDestino } from '@/lib/importacao/campos'
import {
  normalizarTelefone, normalizarCpf, normalizarData, normalizarGenero, separarTags,
  normalizarOrigem, normalizarValor, normalizarAtivo,
  validarLinha, marcarRepetidas, type Referencias,
} from '@/lib/importacao/normalizar'

/**
 * O importador de contatos (2026-10-13): a parte pura — ler o CSV como o
 * Excel brasileiro o salva, sugerir as colunas pelo cabeçalho, normalizar e
 * validar cada linha. É a MESMA código no navegador (a prévia) e no servidor
 * (que valida de novo antes de gravar).
 */
describe('decodificar', () => {
  it('UTF-8, com ou sem BOM', () => {
    expect(decodificar(new TextEncoder().encode('﻿Nome;Cidade\nAna;São José'))).toBe('Nome;Cidade\nAna;São José')
  })
  it('Windows-1252 (o CSV do Excel em português)', () => {
    // "Conceição" em 1252: ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([0x43, 0x6f, 0x6e, 0x63, 0x65, 0x69, 0xe7, 0xe3, 0x6f])
    expect(decodificar(bytes)).toBe('Conceição')
  })
})

describe('lerCsv', () => {
  it('ponto e vírgula, aspas, aspas dobradas e quebra de linha dentro do campo', () => {
    const r = lerCsv('Nome;Obs\r\n"Ana; Maria";"disse ""oi""\nna recepção"\r\nBia;\r\n\r\n')
    expect(r.cabecalho).toEqual(['Nome', 'Obs'])
    expect(r.linhas).toEqual([['Ana; Maria', 'disse "oi"\nna recepção'], ['Bia', '']])
  })
  it('detecta vírgula e tabulação', () => {
    expect(lerCsv('a,b\n1,2').linhas).toEqual([['1', '2']])
    expect(lerCsv('a\tb\n1\t2').linhas).toEqual([['1', '2']])
  })
  it('apara espaços do cabeçalho', () => {
    expect(lerCsv(' Nome ; Celular \nAna;1').cabecalho).toEqual(['Nome', 'Celular'])
  })
})

describe('sugerirMapeamento', () => {
  it('casa os cabeçalhos comuns com os campos do cliente', () => {
    expect(sugerirMapeamento(
      ['Nome completo', 'Celular', 'E-mail', 'CPF', 'Data de Nascimento', 'Cidade', 'Observação', 'Coluna X'],
      'clientes',
    )).toEqual(['name', 'phone', 'email', 'document', 'birth_date', 'city', 'notes', null])
  })
  it('cada campo vai para uma coluna só (a primeira)', () => {
    expect(sugerirMapeamento(['Telefone', 'Celular'], 'clientes')).toEqual(['phone', null])
  })
  it('no contato do CRM: nome, telefone, e-mail, rede social e tags — a ficha (CPF…) não', () => {
    expect(camposDoDestino('contatos').map(c => c.chave)).toEqual(['name', 'phone', 'email', 'social_media', 'tags'])
    expect(sugerirMapeamento(['Nome', 'WhatsApp', 'CPF', 'E-mail', 'Instagram'], 'contatos')).toEqual(['name', 'phone', null, 'email', 'social_media'])
  })
  it('com oportunidade, os campos dela entram (e só então)', () => {
    const chaves = camposDoDestino('contatos', { oportunidade: true }).map(c => c.chave)
    expect(chaves).toEqual(expect.arrayContaining([
      'op_origem', 'op_valor', 'op_observacoes', 'op_procedimentos', 'op_etapa', 'op_responsavel',
      'op_utm_source', 'op_utm_medium', 'op_utm_campaign', 'op_tags',
    ]))
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(camposDoDestino('contatos').some(c => c.grupo === 'oportunidade')).toBe(false)
    expect(sugerirMapeamento(
      ['Nome', 'Celular', 'Origem', 'Valor', 'Etapa', 'Vendedor', 'Procedimento de interesse', 'utm_campaign', 'Obs'],
      'contatos', { oportunidade: true },
    )).toEqual(['name', 'phone', 'op_origem', 'op_valor', 'op_etapa', 'op_responsavel', 'op_procedimentos', 'op_utm_campaign', 'op_observacoes'])
  })
  it('no cliente: situação sempre; unidade por linha só quando pedida; rede social só na oportunidade', () => {
    expect(camposDoDestino('clientes').map(c => c.chave)).toContain('ativo')
    expect(camposDoDestino('clientes').map(c => c.chave)).not.toContain('unidade')
    expect(camposDoDestino('clientes').map(c => c.chave)).not.toContain('social_media')
    expect(camposDoDestino('clientes', { unidadePorLinha: true }).map(c => c.chave)).toContain('unidade')
    const op = camposDoDestino('clientes', { oportunidade: true })
    expect(op.find(c => c.chave === 'social_media')?.grupo).toBe('oportunidade')
    // As observações vão para a ficha; as da oportunidade, só se outra coluna.
    expect(sugerirMapeamento(['Nome', 'Celular', 'Observações', 'Unidade', 'Status'], 'clientes', { oportunidade: true, unidadePorLinha: true }))
      .toEqual(['name', 'phone', 'notes', 'unidade', 'ativo'])
  })
})

describe('normalizar', () => {
  it('telefone no formato do WhatsApp (55 + DDD + número)', () => {
    expect(normalizarTelefone('(48) 99999-0000')).toBe('5548999990000')
    expect(normalizarTelefone('48 3333-4444')).toBe('554833334444')
    expect(normalizarTelefone('+55 48 99999 0000')).toBe('5548999990000')
    expect(normalizarTelefone('5548999990000')).toBe('5548999990000')
    expect(normalizarTelefone('+1 415 555 1234')).toBe('14155551234')
    expect(normalizarTelefone('99999-0000')).toBeNull()
    expect(normalizarTelefone('')).toBeNull()
  })
  it('CPF com os dígitos conferidos', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725')
    expect(normalizarCpf('111.111.111-11')).toBeNull()
    expect(normalizarCpf('529.982.247-24')).toBeNull()
  })
  it('datas brasileiras e ISO', () => {
    expect(normalizarData('15/03/1990')).toBe('1990-03-15')
    expect(normalizarData('1990-03-15')).toBe('1990-03-15')
    expect(normalizarData('15/03/90')).toBe('1990-03-15')
    expect(normalizarData('05/01/05')).toBe('2005-01-05')
    expect(normalizarData('31/02/1990')).toBeNull()
    expect(normalizarData('ontem')).toBeNull()
  })
  it('gênero e tags', () => {
    expect(normalizarGenero('Feminino')).toBe('F')
    expect(normalizarGenero('m')).toBe('M')
    expect(normalizarGenero('xyz')).toBeNull()
    expect(separarTags('vip; botox, retorno,, ')).toEqual(['vip', 'botox', 'retorno'])
  })
})

describe('os campos novos', () => {
  it('origem: o nome da lista, os apelidos comuns, e o resto vira "Outro"', () => {
    expect(normalizarOrigem('facebook')).toBe('Meta Ads')
    expect(normalizarOrigem('Instagram')).toBe('Instagram')
    expect(normalizarOrigem('indicacao')).toBe('Indicação')
    expect(normalizarOrigem('GOOGLE')).toBe('Google Ads')
    expect(normalizarOrigem('organico')).toBe('Orgânico')
    expect(normalizarOrigem('Feira de noivas')).toBe('Outro')
  })
  it('valor em reais, do jeito que a planilha traz', () => {
    expect(normalizarValor('R$ 1.500,00')).toBe(1500)
    expect(normalizarValor('1500,5')).toBe(1500.5)
    expect(normalizarValor('1.500')).toBe(1500)
    expect(normalizarValor('2300.90')).toBe(2300.9)
    expect(normalizarValor('1,234.56')).toBe(1234.56)
    expect(normalizarValor('abc')).toBeNull()
    expect(normalizarValor('-10')).toBeNull()
  })
  it('situação do cliente', () => {
    expect(normalizarAtivo('Ativo')).toBe(true)
    expect(normalizarAtivo('sim')).toBe(true)
    expect(normalizarAtivo('Inativo')).toBe(false)
    expect(normalizarAtivo('Não')).toBe(false)
    expect(normalizarAtivo('0')).toBe(false)
    expect(normalizarAtivo('talvez')).toBeNull()
  })

  const refs: Referencias = {
    unidades: [{ id: 'u1', nome: 'Centro' }, { id: 'u2', nome: 'São José' }],
    etapas: [{ id: 'e1', nome: 'Novos' }, { id: 'e2', nome: 'Qualificados' }],
    membros: [
      { id: 'm1', nome: 'Bia Souza', email: 'bia@x.com' },
      { id: 'm2', nome: 'Ana Lima', email: 'ana1@x.com' },
      { id: 'm3', nome: 'Ana Lima', email: 'ana2@x.com' },
    ],
    procedimentos: [{ id: 'p1', nome: 'Botox' }, { id: 'p2', nome: 'Preenchimento labial' }],
  }
  it('etapa, responsável, procedimentos e unidade pelo NOME (sem acento nem caixa)', () => {
    const mapa = ['phone', 'op_etapa', 'op_responsavel', 'op_procedimentos', 'op_valor', 'op_origem', 'social_media'] as const
    expect(validarLinha('contatos', [...mapa], ['48999990000', 'qualificados', 'BIA@X.COM', 'botox; preenchimento LABIAL', 'R$ 1.200,00', 'facebook', '@bia'], refs)).toEqual({
      dados: { phone: '5548999990000', op_etapa: 'e2', op_responsavel: 'm1', op_procedimentos: ['p1', 'p2'], op_valor: '1200', op_origem: 'Meta Ads', social_media: '@bia' },
      erros: [],
    })
    expect(validarLinha('contatos', ['phone', 'op_responsavel'], ['48999990000', 'bia souza'], refs).dados.op_responsavel).toBe('m1')
    expect(validarLinha('clientes', ['name', 'phone', 'unidade', 'ativo'], ['Ana', '48999990000', 'sao jose', 'inativo'], refs).dados)
      .toMatchObject({ unidade: 'u2', ativo: 'false' })
  })
  it('o que não se acha é erro da linha, com o motivo', () => {
    const r = validarLinha('contatos', ['phone', 'op_etapa', 'op_responsavel', 'op_procedimentos', 'op_valor'],
      ['48999990000', 'Perdidos', 'Ana Lima', 'Botox, Laser', 'muito'], refs)
    expect(r.erros).toEqual([
      'Valor ilegível: "muito".',
      'Procedimento não encontrado: "Laser".',
      'Etapa não encontrada no funil escolhido: "Perdidos".',
      'Mais de uma pessoa da equipe se chama "Ana Lima" — use o e-mail.',
    ])
    expect(validarLinha('clientes', ['name', 'phone', 'unidade'], ['Ana', '48999990000', 'Norte'], refs).erros)
      .toEqual(['Unidade não encontrada: "Norte".'])
    expect(validarLinha('contatos', ['phone', 'op_responsavel'], ['48999990000', 'zé'], refs).erros)
      .toEqual(['Responsável não encontrado na equipe: "zé".'])
  })
})

describe('validarLinha', () => {
  const mapa = ['name', 'phone', 'document', 'email', 'birth_date'] as const
  it('devolve os dados prontos para gravar', () => {
    expect(validarLinha('clientes', [...mapa], ['  Ana Souza ', '(48) 99999-0000', '529.982.247-25', 'ANA@X.COM', '15/03/1990'])).toEqual({
      dados: { name: 'Ana Souza', phone: '5548999990000', document: '52998224725', email: 'ana@x.com', birth_date: '1990-03-15' },
      erros: [],
    })
  })
  it('diz o que está errado — e campo vazio não é erro', () => {
    const r = validarLinha('clientes', [...mapa], ['', '9999-0000', '111', 'ana@', 'ontem'])
    expect(r.erros).toEqual([
      'Nome vazio.', 'Telefone sem DDD ou inválido: "9999-0000".', 'CPF inválido: "111".',
      'E-mail inválido: "ana@".', 'Data de nascimento ilegível: "ontem" (use dd/mm/aaaa).',
    ])
    expect(validarLinha('clientes', [...mapa], ['Bia', '48999990000', '', '', '']).erros).toEqual([])
  })
  // D-10 (frente de cadastro, 2026-10-29): o contato entra com o telefone OU o
  // e-mail — a linha que só tem e-mail passa. Na ficha (clientes), o telefone
  // continua obrigatório.
  it('no contato, basta o telefone ou o e-mail; o nome não é obrigatório', () => {
    expect(validarLinha('contatos', ['name', 'phone'], ['', '48999990000']).erros).toEqual([])
    expect(validarLinha('contatos', ['name', 'phone', 'email'], ['Ana', '', 'ana@exemplo.com']).erros).toEqual([])
    expect(validarLinha('contatos', ['name', 'phone', 'email'], ['Ana', '', '']).erros)
      .toEqual(['Sem telefone nem e-mail: o contato precisa de um dos dois.'])
    expect(camposDoDestino('contatos').find(c => c.chave === 'phone')?.obrigatorio).toBe(false)
  })
  it('na ficha (clientes), o telefone continua obrigatório', () => {
    expect(validarLinha('clientes', ['name', 'phone', 'email'], ['Ana', '', 'ana@exemplo.com']).erros).toEqual(['Telefone vazio.'])
  })
})

// D-10: no CONTATO, o telefone repetido na planilha não é erro — a segunda
// linha junta as tags e a origem à pessoa que a primeira criou.
describe('marcarRepetidas — contatos', () => {
  it('o mesmo telefone duas vezes passa (a segunda junta à primeira)', () => {
    const r = marcarRepetidas('contatos', [
      { numero: 2, dados: { name: 'A', phone: '5548222220000', tags: ['vip'] }, erros: [] },
      { numero: 3, dados: { name: 'B', phone: '5548222220000', tags: ['botox'] }, erros: [] },
    ])
    expect(r.map(l => l.erros)).toEqual([[], []])
  })
})

describe('marcarRepetidas', () => {
  it('a segunda linha com o mesmo CPF — ou, sem CPF, o mesmo telefone — é repetida', () => {
    const r = marcarRepetidas('clientes', [
      { numero: 2, dados: { name: 'A', phone: '5548999990000', document: '52998224725' }, erros: [] },
      { numero: 3, dados: { name: 'B', phone: '5548111110000', document: '52998224725' }, erros: [] },
      { numero: 4, dados: { name: 'C', phone: '5548222220000' }, erros: [] },
      { numero: 5, dados: { name: 'D', phone: '5548222220000' }, erros: [] },
      // Com CPF diferente, o mesmo telefone é outra pessoa (mãe e filha).
      { numero: 6, dados: { name: 'E', phone: '5548999990000', document: '16899535009' }, erros: [] },
    ])
    expect(r.map(l => l.erros)).toEqual([[], ['Repetida na planilha (igual à linha 2).'], [], ['Repetida na planilha (igual à linha 4).'], []])
  })
})

describe('variantesDoTelefone', () => {
  it('o celular brasileiro com e sem o nono dígito (o WhatsApp manda dos dois jeitos)', async () => {
    const { variantesDoTelefone } = await import('@/lib/importacao/normalizar')
    expect(variantesDoTelefone('5521988887777')).toEqual(['5521988887777', '552188887777'])
    expect(variantesDoTelefone('552188887777')).toEqual(['552188887777', '5521988887777'])
    // Fixo (começa com 2 a 5) não ganha nono dígito; estrangeiro fica como está.
    expect(variantesDoTelefone('554833334444')).toEqual(['554833334444'])
    expect(variantesDoTelefone('14155551234')).toEqual(['14155551234'])
  })
})

describe('lerCsv: o número da linha na planilha', () => {
  it('conta a linha onde cada registro começa (linha em branco e célula de várias linhas não desalinham)', () => {
    const r = lerCsv('Nome;Obs\nAna;"uma\nduas"\n\nBia;x\n')
    expect(r.linhas.map(l => l[0])).toEqual(['Ana', 'Bia'])
    expect(r.numeros).toEqual([2, 5])
  })
})
