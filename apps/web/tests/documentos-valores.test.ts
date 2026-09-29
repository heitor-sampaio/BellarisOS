import { describe, it, expect } from 'vitest'
import {
  formatarDocumento, formatarTelefone, formatarCep, formatarDataCivil, dataPorExtenso,
  linhaDoEndereco, valoresDoDocumento, type DadosDoDocumento,
} from '@/lib/documentos/valores'
import { gerarCodigoDeVerificacao, normalizarCodigo } from '@/lib/documentos/codigo'

const cliente: DadosDoDocumento['cliente'] = {
  name: 'Marina Torres', document: '52998224725', birth_date: '1990-03-14', phone: '5547991234567',
  email: null, zip_code: '89201000', address: 'Rua das Flores', address_number: '120',
  address_complement: null, neighborhood: 'Centro', city: 'Joinville', state: 'sc',
}

describe('formatação dos valores do documento', () => {
  it('CPF e CNPJ ganham a máscara', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
    expect(formatarDocumento('12345678000190')).toBe('12.345.678/0001-90')
    expect(formatarDocumento(null)).toBeNull()
  })

  it('telefone com ou sem DDI sai no formato nacional', () => {
    expect(formatarTelefone('5547991234567')).toBe('(47) 99123-4567')
    expect(formatarTelefone('4733221100')).toBe('(47) 3322-1100')
    expect(formatarTelefone('')).toBeNull()
  })

  it('CEP, data civil sem fuso e data por extenso', () => {
    expect(formatarCep('89201000')).toBe('89201-000')
    expect(formatarDataCivil('1990-03-14')).toBe('14/03/1990')
    expect(dataPorExtenso(new Date('2026-09-30T02:00:00Z'))).toBe('29 de setembro de 2026')
  })

  it('o endereço precisa da rua; número e bairro entram quando existem', () => {
    expect(linhaDoEndereco(cliente)).toBe('Rua das Flores, 120 — Centro')
    expect(linhaDoEndereco({ ...cliente, address: null })).toBeNull()
  })

  it('dado que falta é null — é o null que deixa o documento incompleto', () => {
    const v = valoresDoDocumento({
      agora: new Date('2026-09-30T15:00:00Z'), cliente: { ...cliente, document: null },
      rede: { name: 'Rede', document: null, phone: null, email: null }, unidade: null,
      procedimento: { name: 'Toxina' }, agendamento: { scheduled_at: '2026-10-02T17:30:00Z', price: 1200, profissional: 'Dra. Helena' },
    })
    expect(v['cliente.cpf']).toBeNull()
    expect(v['cliente.uf']).toBe('SC')
    expect(v['agendamento.hora']).toBe('14:30')
    expect(v['procedimento.valor']).toMatch(/^R\$\s1\.200,00$/)
  })
})

describe('código de verificação', () => {
  it('12 caracteres sem letras que confundem, em grupos de quatro', () => {
    for (let i = 0; i < 50; i++) expect(gerarCodigoDeVerificacao()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
  })

  it('o que a pessoa digita volta ao formato gravado', () => {
    expect(normalizarCodigo('7k3q m9xd 2hva')).toBe('7K3Q-M9XD-2HVA')
    expect(normalizarCodigo('7K3Q-M9XD-2HVO')).toBe('7K3Q-M9XD-2HV0')
    expect(normalizarCodigo('curto')).toBeNull()
  })
})
