import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasDoComoFica } from '@/lib/clients/como-fica-ao-unificar'

/**
 * A prévia do "Unificar" (D18 da 33ª simulação; crm-inbox:CL-08 — "A pergunta
 * mostra antes como a ficha fica, acompanhando o que se digita"). O Unificar
 * gravou o CPF, o nascimento e o e-mail digitados, e o "Se unificar, a ficha
 * fica assim" mostrava só o nome, o telefone e o e-mail. A prévia mostra TUDO o
 * que `atualizarFichaComOPreenchido` grava: o documento (e a recusa, quando a
 * ficha já tem outro), o nascimento, o gênero, o endereço, as observações (que
 * se somam), as tags (que se juntam) e o acesso ao app.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const vazio = { email: '', telefone: '' }
const ficha = {
  email: 'dirce@exemplo.invalid', telefone: '65999990000',
  documento: null, nascimento: '1980-01-01', genero: 'O', tags: ['VIP'], temObservacoes: true, temAcesso: false,
}

describe('"Se unificar, a ficha fica assim" mostra tudo o que o Unificar grava', () => {
  it('as três linhas de sempre continuam iguais', () => {
    const l = linhasDoComoFica('Dirce', ficha, { ...vazio, email: 'nova@exemplo.invalid' })
    expect(l[0]).toBe('Nome: Dirce (o da ficha)')
    expect(l).toContain('E-mail: nova@exemplo.invalid (o digitado agora, no lugar de dirce@exemplo.invalid)')
    expect(l.some(x => x.startsWith('Telefone: '))).toBe(true)
  })

  it('o CPF e o nascimento digitados aparecem, e os da ficha quando nada se digitou', () => {
    const l = linhasDoComoFica('Dirce', ficha, { ...vazio, documento: { tipo: 'CPF', numero: '529.982.247-25' }, nascimento: '1990-05-05' })
    expect(l).toContain('CPF: 529.982.247-25 (o digitado agora)')
    expect(l).toContain('Nascimento: 05/05/1990 (o digitado agora, no lugar de 01/01/1980)')
    const semNada = linhasDoComoFica('Dirce', { ...ficha, documento: { tipo: 'CPF', numero: '52998224725' } }, vazio)
    expect(semNada).toContain('CPF: 529.982.247-25 (o da ficha)')
    expect(semNada).toContain('Nascimento: 01/01/1980 (o da ficha)')
    expect(linhasDoComoFica('Dirce', { ...ficha, nascimento: null }, vazio)).toContain('Nascimento: — (a ficha não tem)')
  })

  it('o documento que o Unificar recusa diz antes que vai ser recusado', () => {
    const comCpf = { ...ficha, documento: { tipo: 'CPF' as const, numero: '52998224725' } }
    expect(linhasDoComoFica('Dirce', comCpf, { ...vazio, documento: { tipo: 'CPF', numero: '111.444.777-35' } }))
      .toContain('CPF: 111.444.777-35 — a ficha já tem outro CPF (529.982.247-25): o Unificar recusa. Confira o CPF digitado.')
    expect(linhasDoComoFica('Dirce', comCpf, { ...vazio, documento: { tipo: 'PASSAPORTE', numero: 'AB123456' } }))
      .toContain('Passaporte: AB123456 — a ficha já tem CPF: o Unificar recusa. Confira o documento digitado.')
    expect(linhasDoComoFica('Dirce', comCpf, { ...vazio, documento: { tipo: 'CPF', numero: '529.982.247-25' } }))
      .toContain('CPF: 529.982.247-25 (o mesmo da ficha)')
  })

  it('o gênero, o endereço, as observações, as tags e o acesso aparecem quando preenchidos', () => {
    const l = linhasDoComoFica('Dirce', ficha, {
      ...vazio, genero: 'F', observacoes: 'Alérgica a látex', tags: ['VIP', 'Noiva 2027'], acesso: true,
      endereco: { logradouro: 'Rua das Flores', numero: '200', bairro: 'Centro', cidade: 'Cuiabá', uf: 'MT', cep: '78000-000' },
    })
    expect(l).toContain('Gênero: Feminino (o digitado agora, no lugar de Outro)')
    expect(l).toContain('Endereço: Rua das Flores, 200, Centro, Cuiabá/MT, CEP 78000-000 (o preenchido agora vai por cima do da ficha, campo a campo)')
    expect(l).toContain('Observações: “Alérgica a látex” vai abaixo das que a ficha já tem')
    expect(l).toContain('Tags: VIP, Noiva 2027 (entra Noiva 2027; as da ficha ficam)')
    expect(l).toContain('Acesso ao app: criado agora (login: o e-mail)')
    expect(l[l.length - 1]).toBe('O que ficou em branco aqui não muda na ficha.')
  })

  it('o que não se preencheu não ganha linha (gênero, endereço, observações, tags, acesso)', () => {
    const l = linhasDoComoFica('Dirce', ficha, vazio)
    for (const r of ['Gênero:', 'Endereço:', 'Observações:', 'Tags:', 'Acesso ao app:']) expect(l.some(x => x.startsWith(r)), r).toBe(false)
  })

  it('a ficha sem observações, e a que já tem o acesso', () => {
    const l = linhasDoComoFica('Dirce', { ...ficha, temObservacoes: false, temAcesso: true }, { ...vazio, observacoes: 'Prefere manhã', acesso: true })
    expect(l).toContain('Observações: “Prefere manhã” (a ficha não tinha)')
    expect(l).toContain('Acesso ao app: a ficha já tem; nada muda')
  })

  it('a tela passa o que se digita, e o servidor manda o que a ficha tem só ao cadastro (Clientes em Gerenciar)', () => {
    const form = fonte('components/branch/client-form.tsx')
    expect(form).toMatch(/linhasDoComoFica\(/)
    expect(form).toMatch(/documento: \{ tipo: tipoDoc, numero: document \}/)
    expect(form).toMatch(/digitado=\{\{ \.\.\.digitadoAgora/)
    expect(fonte('lib/clients/ja-existe.ts')).toMatch(/comOCadastro/)
    expect(fonte('actions/clients.ts')).toMatch(/comOCadastro: true/)
  })
})
