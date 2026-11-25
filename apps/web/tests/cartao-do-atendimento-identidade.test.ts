import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AttendanceRecordCard } from '@/components/branch/attendance-record-card'

/**
 * Os "Dados do cliente" do cartão do atendimento (princípio 3: o que a tela
 * mostra é o que vale). "Não informado" quer dizer que o dado NÃO EXISTE na
 * ficha; quem tem o Prontuário sem o Clientes não recebe o cadastro
 * (`soOProntuarioDaFicha`, docs/regras/crm-inbox.md), e o cartão não pode
 * dizer a ela que o telefone, o nascimento e o CPF não existem — as linhas
 * somem (D6 da 30ª, regressão do arremate da 28ª).
 */

const vazio = createElement('div')
const render = (props: Partial<Parameters<typeof AttendanceRecordCard>[0]>) =>
  renderToStaticMarkup(createElement(AttendanceRecordCard, {
    client: { name: 'Paciente', document: null, birthDate: null, phone: null },
    generalAnamnesis: vazio,
    ...props,
  }))

describe('os dados do cliente no cartão do atendimento', () => {
  it('sem o cadastro (o Prontuário sem o Clientes): só o nome, sem "Não informado"', () => {
    const html = render({ semOCadastro: true })
    expect(html).toContain('Paciente')
    expect(html).not.toContain('Não informado')
    for (const rotulo of ['CPF', 'Nascimento', 'Telefone']) expect(html, rotulo).not.toContain(`>${rotulo}<`)
  })
  it('com o cadastro, o nulo de verdade segue "Não informado"', () => {
    const html = render({})
    expect(html).toContain('>Telefone<')
    expect(html).toContain('Não informado')
  })
  it('com o cadastro, o dado que existe aparece', () => {
    const html = render({ client: { name: 'Paciente', document: '12345678900', birthDate: '1990-01-01', phone: '11999990000' } })
    expect(html).toContain('123.456.789-00')
    expect(html).toContain('01/01/1990')
    expect(html).not.toContain('Não informado')
  })
})
