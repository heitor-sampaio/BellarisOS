import { describe, it, expect } from 'vitest'
import { camposDoDestino, sugerirMapeamento } from '@/lib/importacao/campos'
import { validarLinha, lerPacotesDaPlanilha, pacotesDaLinha, avisoDaMenorNaPlanilha } from '@/lib/importacao/normalizar'

/**
 * A migração pela planilha (F35, 8ª simulação, 2026-11-06).
 *
 * D2 (decidido pelo princípio 2 — só se recusa o impossível): o campo
 * opcional ilegível não derruba a linha. A Isabela (CPF 123.456.789-00) ficou
 * de fora com nome, telefone e nascimento bons. Agora ela entra SEM o CPF, e a
 * linha leva o aviso "CPF inválido…: importada sem o CPF". Só o impossível
 * recusa: sem nome, e a ficha sem telefone (clients.phone é NOT NULL).
 *
 * Decisão 1 (c) do Heitor ("concordo"): as colunas "cliente desde", "última
 * visita" e "pacote: procedimento; total; usadas"; e o responsável legal (A5).
 */

const procs = { procedimentos: [{ id: 'p1', nome: 'Limpeza de pele' }, { id: 'p2', nome: 'Microagulhamento' }] }

describe('D2: o campo opcional ilegível vira aviso, não recusa', () => {
  const mapa = ['name', 'phone', 'document', 'email', 'birth_date', 'gender', 'zip_code', 'state'] as const
  it('a Isabela entra sem o CPF, e a linha diz por quê', () => {
    const r = validarLinha('clientes', [...mapa], ['Isabela Rocha', '(85) 99999-1234', '123.456.789-00', '', '10/02/1995', '', '', ''])
    expect(r.erros).toEqual([])
    expect(r.dados).toMatchObject({ name: 'Isabela Rocha', phone: '5585999991234', birth_date: '1995-02-10' })
    expect(r.dados.document).toBeUndefined()
    expect(r.avisos).toEqual(['CPF inválido ("123.456.789-00"): importada sem o CPF.'])
  })
  it('cada campo opcional ilegível fica de fora com o seu aviso', () => {
    const r = validarLinha('clientes', [...mapa], ['Bia', '48999990000', '', 'bia@', 'ontem', 'xis', '123', 'ZZ'])
    expect(r.erros).toEqual([])
    expect(r.avisos).toEqual([
      'E-mail inválido ("bia@"): importada sem o e-mail.',
      'Data de nascimento ilegível ("ontem", use dd/mm/aaaa): importada sem o nascimento.',
      'Gênero não reconhecido ("xis", use F, M, Outro): importada sem o gênero.',
      'CEP inválido ("123"): importada sem o CEP.',
      'UF inválida ("ZZ", use a sigla, como SC): importada sem a UF.',
    ])
    expect(Object.keys(r.dados).sort()).toEqual(['name', 'phone'])
  })
  it('só o impossível recusa: sem nome, e a ficha sem telefone que preste', () => {
    expect(validarLinha('clientes', [...mapa], ['', '48999990000', '', '', '', '', '', '']).erros).toEqual(['Nome vazio.'])
    expect(validarLinha('clientes', [...mapa], ['Ana', '9999-0000', '', '', '', '', '', '']).erros)
      .toEqual(['Telefone sem DDD ou inválido: "9999-0000".'])
  })
  it('no contato, o telefone ruim com um e-mail bom entra só com o e-mail', () => {
    const r = validarLinha('contatos', ['name', 'phone', 'email'], ['Ana', '9999-0000', 'ana@x.com'])
    expect(r.erros).toEqual([])
    expect(r.dados).toEqual({ name: 'Ana', email: 'ana@x.com' })
    expect(r.avisos).toEqual(['Telefone sem DDD ou inválido ("9999-0000"): importada só com o e-mail.'])
    // Sem nenhum dos dois que preste, não há contato.
    expect(validarLinha('contatos', ['name', 'phone', 'email'], ['Ana', '9999-0000', 'ana@']).erros)
      .toEqual(['Sem telefone nem e-mail válido: o contato precisa de um dos dois.'])
  })
  it('a situação e a unidade que não se reconhecem não recusam', () => {
    const refs = { unidades: [{ id: 'u1', nome: 'Centro' }] }
    const r = validarLinha('clientes', ['name', 'phone', 'ativo', 'unidade'], ['Ana', '48999990000', 'talvez', 'Norte'], refs)
    expect(r.erros).toEqual([])
    expect(r.dados.ativo).toBeUndefined()
    expect(r.dados.unidade).toBeUndefined()
    expect(r.avisos).toEqual([
      'Situação não reconhecida ("talvez", use Ativo ou Inativo): importada como ativa.',
      'Unidade não encontrada ("Norte"): importada na unidade escolhida na tela.',
    ])
  })
  it('o campo do card que não se acha deixa a oportunidade sem ele', () => {
    const refs = { etapas: [{ id: 'e1', nome: 'Novos' }], procedimentos: [{ id: 'p1', nome: 'Botox' }] }
    const r = validarLinha('contatos', ['phone', 'op_etapa', 'op_procedimentos', 'op_valor'], ['48999990000', 'Perdidos', 'Botox, Laser', 'muito'], refs)
    expect(r.erros).toEqual([])
    expect(r.dados.op_procedimentos).toEqual(['p1'])
    expect(r.avisos).toEqual([
      'Valor ilegível ("muito"): a oportunidade entra sem o valor.',
      'Procedimento não encontrado ("Laser"): a oportunidade entra sem ele.',
      'Etapa não encontrada no funil escolhido ("Perdidos"): a oportunidade entra na etapa escolhida na tela.',
    ])
  })
})

describe('as colunas da migração (decisão 1 c)', () => {
  it('a planilha de outro sistema tem as colunas sugeridas pelo cabeçalho', () => {
    const cab = ['Nome', 'Celular', 'Cliente desde', 'Última visita', 'Pacote', 'Responsável legal', 'CPF do responsável', 'Parentesco', 'Telefone do responsável']
    const opcoes = { pacote: true }
    expect(sugerirMapeamento(cab, 'clientes', opcoes)).toEqual([
      'name', 'phone', 'cliente_desde', 'ultima_visita', 'pacote',
      'responsavel_nome', 'responsavel_cpf', 'responsavel_parentesco', 'responsavel_telefone',
    ])
  })
  it('a coluna do pacote só se oferece a quem traz pacote de fora (o Financeiro em Gerenciar)', () => {
    expect(camposDoDestino('clientes').some(c => c.chave === 'pacote')).toBe(false)
    expect(camposDoDestino('clientes', { pacote: true }).some(c => c.chave === 'pacote')).toBe(true)
    expect(camposDoDestino('contatos', { pacote: true }).some(c => c.chave === 'pacote')).toBe(false)
  })
  it('"cliente desde" e "última visita" são datas do passado', () => {
    const r = validarLinha('clientes', ['name', 'phone', 'cliente_desde', 'ultima_visita'], ['Camila', '48999990000', '03/2021', '12/08/2026'])
    expect(r.dados).toMatchObject({ cliente_desde: '2021-03-01', ultima_visita: '2026-08-12' })
    const ruim = validarLinha('clientes', ['name', 'phone', 'cliente_desde', 'ultima_visita'], ['Camila', '48999990000', 'sempre', '01/01/2999'])
    expect(ruim.erros).toEqual([])
    expect(ruim.avisos).toEqual([
      'Cliente desde ilegível ("sempre", use dd/mm/aaaa ou mm/aaaa): importada sem essa data.',
      'Última visita ilegível ("01/01/2999", use dd/mm/aaaa): importada sem essa data.',
    ])
  })
  it('o responsável legal: o CPF e o telefone conferidos; ruins, ficam de fora com aviso', () => {
    const mapa = ['name', 'phone', 'responsavel_nome', 'responsavel_cpf', 'responsavel_parentesco', 'responsavel_telefone'] as const
    const bom = validarLinha('clientes', [...mapa], ['Tatiana', '48999990000', 'Marta Lima', '529.982.247-25', 'Mãe', '(48) 98888-7777'])
    expect(bom.dados).toMatchObject({ responsavel_nome: 'Marta Lima', responsavel_cpf: '52998224725', responsavel_parentesco: 'Mãe', responsavel_telefone: '(48) 98888-7777' })
    const ruim = validarLinha('clientes', [...mapa], ['Tatiana', '48999990000', 'Marta Lima', '111', 'Mãe', '9888'])
    expect(ruim.erros).toEqual([])
    expect(ruim.dados.responsavel_cpf).toBeUndefined()
    expect(ruim.avisos).toEqual([
      'CPF do responsável inválido ("111"): importada sem ele.',
      'Telefone do responsável incompleto ("9888"): importada sem ele.',
    ])
  })
  it('a menor sem responsável na planilha é avisada na prévia (A5)', () => {
    const hoje = new Date('2026-11-06T12:00:00-03:00')
    expect(avisoDaMenorNaPlanilha({ name: 'Tatiana', birth_date: '2011-03-10' }, hoje))
      .toBe('Menor de idade (15 anos) sem responsável legal na planilha: cadastre o responsável na ficha.')
    expect(avisoDaMenorNaPlanilha({ name: 'Tatiana', birth_date: '2011-03-10', responsavel_nome: 'Marta' }, hoje)).toBeNull()
    expect(avisoDaMenorNaPlanilha({ name: 'Ana', birth_date: '1990-03-10' }, hoje)).toBeNull()
  })
})

describe('o pacote de antes na planilha: "procedimento; total; usadas"', () => {
  it('lê o pacote, com o valor de referência e a validade opcionais', () => {
    expect(lerPacotesDaPlanilha('Limpeza de pele; 10; 7', procs)).toEqual({
      pacotes: [{ procedimentoId: 'p1', total: 10, usadas: 7, valor: null, validade: null }], avisos: [],
    })
    expect(lerPacotesDaPlanilha('microagulhamento; 6; 2; R$ 1.200,00; 31/12/2027', procs).pacotes)
      .toEqual([{ procedimentoId: 'p2', total: 6, usadas: 2, valor: 1200, validade: '2027-12-31' }])
    // Mais de um, separados por "|".
    expect(lerPacotesDaPlanilha('Limpeza de pele; 4; 1 | Microagulhamento; 3; 0', procs).pacotes.map(p => p.procedimentoId)).toEqual(['p1', 'p2'])
  })
  it('o que não se entende fica de fora, com o motivo — a ficha entra do mesmo jeito', () => {
    expect(lerPacotesDaPlanilha('Laser; 5; 1', procs).avisos).toEqual(['Pacote de antes: procedimento não encontrado ("Laser"): importada sem esse pacote.'])
    expect(lerPacotesDaPlanilha('Limpeza de pele; dez; 7', procs).avisos).toEqual(['Pacote de antes ilegível ("Limpeza de pele; dez; 7", use procedimento; total; usadas): importada sem esse pacote.'])
    expect(lerPacotesDaPlanilha('Limpeza de pele; 5; 5', procs).avisos).toEqual(['Pacote de antes sem sessão restante ("Limpeza de pele; 5; 5"): importada sem esse pacote.'])
  })
  it('a linha guarda o pacote e o devolve inteiro ao servidor', () => {
    const r = validarLinha('clientes', ['name', 'phone', 'pacote'], ['Camila', '48999990000', 'Limpeza de pele; 10; 7; 1500'], procs)
    expect(r.erros).toEqual([])
    expect(pacotesDaLinha(r.dados)).toEqual([{ procedimentoId: 'p1', total: 10, usadas: 7, valor: 1500, validade: null }])
  })
})
