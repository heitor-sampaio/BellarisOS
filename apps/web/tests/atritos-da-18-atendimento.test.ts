import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos da 18ª simulação (2026-11-16) de atendimento, app da cliente,
 * cadastros e equipe que se provam sem tela: o texto, a regra pura e o que a
 * tela passa a mostrar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

// ─── Agenda, atendimento e app da cliente ───────────────────────────────────

describe('A7: a sessão do pacote diz que já está paga', () => {
  it('o texto da faixa', async () => {
    const { textoDaSessaoDoPacote } = await import('@/lib/appointments/sessao-do-pacote')
    expect(textoDaSessaoDoPacote({ numero: 1, total: 6, nome: '6 peelings', deFora: false }))
      .toBe('Sessão 1 de 6 do pacote 6 peelings, já paga.')
    expect(textoDaSessaoDoPacote({ numero: 2, total: 8, nome: 'Laser', deFora: true }))
      .toBe('Sessão 2 de 8 do pacote Laser, trazido de fora: já paga antes do sistema.')
    expect(textoDaSessaoDoPacote({ numero: 3, total: null, nome: null, deFora: false }))
      .toBe('Sessão 3 do pacote, já paga.')
  })
  it('a página lê a sessão e a tela mostra a faixa; o plano novo é opcional, não o botão grande', () => {
    expect(ler('app/_shared/sessao-de-atendimento.tsx')).toMatch(/sessaoDoPacote=\{/)
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('data-sessao-do-pacote')
    expect(tela).toContain('textoDaSessaoDoPacote(')
    expect(tela).toContain('data-plano-novo-na-sessao-do-pacote')
  })
})

describe('A8: o bloqueio "Falta assinar" traz a ação ao lado', () => {
  it('colher a assinatura no aparelho da unidade ou ir aos documentos', () => {
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('data-acao-da-assinatura')
    expect(tela).toMatch(/\/documentos\/\$\{[^}]+\}\/assinar/)
    expect(tela).toContain('Ver os documentos')
  })
})

describe('A9: a linha do insumo diz a quantidade e a parte da embalagem', () => {
  it('a linha', async () => {
    const { linhaDoInsumo } = await import('@/lib/estoque/unidade-de-consumo')
    const seringa = { unit: 'seringa', consumption_unit: 'ml', units_per_package: 1 }
    expect(linhaDoInsumo(1, 'ml', seringa)).toBe('1 ml · 1 seringa')
    expect(linhaDoInsumo(0.5, 'ml', seringa)).toBe('0,5 ml · 1/2 da seringa')
    expect(linhaDoInsumo(2, 'un', { unit: 'un', consumption_unit: null, units_per_package: null })).toBe('2 un')
    expect(linhaDoInsumo(2, 'un', null)).toBe('2 un')
  })
  it('a tela usa a linha, não a unidade solta', () => {
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toContain('linhaDoInsumo(')
    expect(tela).not.toMatch(/marginTop: 1 \}\}>\{item\.unit\}<\/p>/)
  })
})

describe('A10: a foto chega à cliente como foto do atendimento', () => {
  it('o título no app', async () => {
    const { tituloDoArquivoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(tituloDoArquivoNoApp({ name: 'Foto clínica (depois) — 16/11/2026', category: 'foto_clinica', momento: 'DEPOIS' }))
      .toBe('Uma foto do seu atendimento (depois)')
    expect(tituloDoArquivoNoApp({ name: 'Foto clínica — 16/11/2026', category: 'foto_clinica', momento: null }))
      .toBe('Uma foto do seu atendimento')
    expect(tituloDoArquivoNoApp({ name: 'Laudo do exame', category: 'laudo', momento: null })).toBe('Laudo do exame')
  })
  it('o aviso no celular diz foto, sem o nome do arquivo', () => {
    const f = ler('actions/client-documents.ts')
    expect(f).toContain('uma foto do seu atendimento')
  })
  it('o "Enviar à cliente" já no envio', () => {
    expect(ler('actions/client-documents.ts')).toContain("formData.get('enviar_a_cliente')")
    expect(ler('components/branch/client-documents-tab.tsx')).toContain('name="enviar_a_cliente"')
    expect(ler('components/branch/fotos-do-atendimento.tsx')).toMatch(/ofereceEnviar=\{/)
  })
  it('o histórico do app usa o título e lê o momento', () => {
    expect(ler('components/client-portal/historico-tabs.tsx')).toContain('tituloDoArquivoNoApp(')
    expect(ler('app/[slug]/cliente/historico/page.tsx')).toMatch(/select\('id, name, category, file_path, momento/)
  })
})

describe('A11: o documento assinado abre no app', () => {
  it('cada assinado leva ao documento da cliente (o PDF assinado)', () => {
    const f = ler('components/client-portal/historico-tabs.tsx')
    expect(f).toMatch(/href=\{`\/\$\{slug\}\/cliente\/documentos\/\$\{c\.id\}`\}/)
    expect(f).toContain('data-assinado-no-app')
  })
})

describe('A12: a ficha de saúde não repete o erro', () => {
  it('o resumo acima do botão não repete o do campo', async () => {
    const { resumoDasObrigatoriasVazias } = await import('@/lib/anamnesis')
    expect(resumoDasObrigatoriasVazias(['Tem alguma alergia?'])).toBe('Falta 1 campo obrigatório, marcado acima.')
    expect(resumoDasObrigatoriasVazias(['A', 'B'])).toBe('Faltam 2 campos obrigatórios, marcados acima: "A", "B".')
    expect(resumoDasObrigatoriasVazias([])).toBeNull()
  })
  it('a tela usa o resumo', () => {
    expect(ler('components/branch/anamnesis-form-renderer.tsx')).toContain('resumoDasObrigatoriasVazias(')
  })
})

describe('A13: a estrela desenhada não aparece sem nome no leitor de tela', () => {
  it('o ícone fica escondido; o nome é do botão', () => {
    const f = ler('components/client-portal/confirm-appointment-form.tsx')
    expect(f).toMatch(/aria-label=\{`\$\{label\}: \$\{n\} de 5 estrelas`\}/)
    expect(f).toMatch(/<Star size=\{30\}[^>]*aria-hidden="true"/)
  })
})

describe('A15: o "Confirmar e avaliar" diz a hora marcada e a da conclusão', () => {
  const fuso = 'America/Recife'
  it('marcada e concluída em horas diferentes', async () => {
    const { textoDoQuandoNoConfirmar } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoQuandoNoConfirmar({ agendadoEm: '2026-11-16T06:00:00Z', concluidoEm: '2026-11-16T04:41:00Z', fuso }))
      .toBe('Marcado para 03:00 · concluído em 16 de novembro às 01:41')
    expect(textoDoQuandoNoConfirmar({ agendadoEm: '2026-11-15T20:00:00Z', concluidoEm: '2026-11-16T04:41:00Z', fuso }))
      .toBe('Marcado para 15 de novembro às 17:00 · concluído em 16 de novembro às 01:41')
  })
  it('na mesma hora, ou sem a conclusão', async () => {
    const { textoDoQuandoNoConfirmar } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoQuandoNoConfirmar({ agendadoEm: '2026-11-16T04:41:00Z', concluidoEm: '2026-11-16T04:41:30Z', fuso }))
      .toBe('Concluído em 16 de novembro às 01:41')
    expect(textoDoQuandoNoConfirmar({ agendadoEm: '2026-11-16T06:00:00Z', concluidoEm: null, fuso }))
      .toBe('16 de novembro às 03:00')
  })
  it('a tela usa o texto', () => {
    expect(ler('components/client-portal/confirm-appointment-form.tsx')).toContain('textoDoQuandoNoConfirmar(')
  })
})

describe('A16: o cadastro rápido avisa o dígito a mais', () => {
  it('a conta', async () => {
    const { temDigitosDeMais } = await import('@estetica-os/utils')
    expect(temDigitosDeMais('55819980000021')).toBe(true)
    expect(temDigitosDeMais('5581998000021')).toBe(false)
    expect(temDigitosDeMais('(81) 99800-00211')).toBe(true)
    expect(temDigitosDeMais('81998000021')).toBe(false)
    expect(temDigitosDeMais('+351 912 345 678 999')).toBe(false)
    expect(temDigitosDeMais('')).toBe(false)
  })
  it('a agenda mostra o aviso', () => {
    const f = ler('components/branch/appointment-modal.tsx')
    expect(f).toContain('temDigitosDeMais(')
    expect(f).toContain('Número com dígitos a mais: confira.')
  })
})

// ─── Montar a rede: cadastros, cargos e equipe ──────────────────────────────

describe('A20: a comissão do membro em blocos, com o resumo antes de salvar', () => {
  it('o resumo', async () => {
    const { resumoDaComissaoDoMembro } = await import('@/lib/equipe/textos-do-cadastro')
    expect(resumoDaComissaoDoMembro({ tipo: 'PERCENTAGE', valor: '30', venda: '' })).toBe('Comissão: 30% de cada atendimento.')
    expect(resumoDaComissaoDoMembro({ tipo: 'FIXED_AMOUNT', valor: '50', venda: '10' }))
      .toBe('Comissão: R$ 50,00 por atendimento · 10% de cada venda.')
    expect(resumoDaComissaoDoMembro({ tipo: 'NENHUMA', valor: '', venda: '30' }))
      .toBe('Comissão: nenhuma por atendimento · 30% de cada venda.')
    expect(resumoDaComissaoDoMembro({ tipo: 'PERCENTAGE', valor: '', venda: '' })).toBe('Comissão: falta o percentual de cada atendimento.')
  })
  it('o tipo em blocos (os das formas de pagamento) e o resumo na tela', () => {
    const f = ler('components/admin/comissao-do-membro.tsx')
    expect(f).toContain('className="formas-de-pagamento"')
    expect(f).toContain('role="radiogroup"')
    expect(f).toContain('data-resumo-da-comissao')
    expect(f).not.toContain('<SegSelect ariaLabel="Tipo da comissão padrão"')
  })
})

describe('A21: criar o membro confirma', () => {
  it('a confirmação, sem a senha', async () => {
    const { confirmacaoDoCadastro } = await import('@/lib/equipe/textos-do-cadastro')
    expect(confirmacaoDoCadastro('Gabriela Souza')).toBe('Gabriela Souza entrou na equipe. A senha é a temporária que você definiu; ela troca no primeiro acesso.')
    expect(confirmacaoDoCadastro('  ')).toBe('Membro criado. A senha é a temporária que você definiu; ela troca no primeiro acesso.')
    const f = ler('components/admin/team-form.tsx')
    expect(f).toContain('confirmacaoDoCadastro(')
    expect(f).toMatch(/toast\.success\(/)
  })
})

describe('A22: os termos e contratos em "Outros documentos" ficam no fim, com o tipo', () => {
  it('a ordem e o rótulo', async () => {
    const { outrosDocumentosEmOrdem, rotuloDoOutroDocumento } = await import('@/lib/documentos/outros-do-procedimento')
    const lista = [
      { id: 't', nome: 'Termo X', tipo: 'TERMO', ativo: true },
      { id: 'd', nome: 'Autorização de imagem', tipo: 'DOCUMENTO', ativo: true },
      { id: 'c', nome: 'Contrato Y', tipo: 'CONTRATO', ativo: false },
    ]
    expect(outrosDocumentosEmOrdem(lista).map(o => o.id)).toEqual(['d', 't', 'c'])
    expect(rotuloDoOutroDocumento(lista[0]!)).toBe('Termo X (termo)')
    expect(rotuloDoOutroDocumento(lista[1]!)).toBe('Autorização de imagem')
    expect(rotuloDoOutroDocumento(lista[2]!)).toBe('Contrato Y (contrato, inativo)')
  })
  it('o cadastro do procedimento usa os dois', () => {
    const f = ler('components/admin/procedure-form.tsx')
    expect(f).toContain('outrosDocumentosEmOrdem(')
    expect(f).toContain('rotuloDoOutroDocumento(')
  })
})

describe('A23: o contrato novo inativo oferece tornar ativo ali mesmo', () => {
  it('o aviso tem o botão, e o editor diz qual modelo foi salvo', () => {
    expect(ler('components/admin/editor-de-documento.tsx')).toMatch(/onPronto\(\{ nasceuInativo: r\.nasceuInativo, nome, id: r\.id \}\)/)
    const f = ler('components/admin/settings-documentos.tsx')
    expect(f).toContain('data-tornar-ativo-o-novo')
    expect(f).toMatch(/tornarAtivo\(\{ id: salvoInativo\.id!? \}\)/)
  })
})

describe('A24: o /setup só avisa o domingo fechado quando ele está fechado', () => {
  it('a conta', async () => {
    const { domingoFechadoNoHorario } = await import('@/lib/agenda/horario')
    expect(domingoFechadoNoHorario(null)).toBe(true)
    const dia = [{ de: '00:00', ate: '24:00' }]
    expect(domingoFechadoNoHorario(JSON.stringify({ dias: { 0: dia, 1: dia, 2: dia, 3: dia, 4: dia, 5: dia, 6: dia } }))).toBe(false)
    expect(domingoFechadoNoHorario(JSON.stringify({ dias: { 0: [], 1: dia } }))).toBe(true)
    expect(domingoFechadoNoHorario('{ruim')).toBe(true)
  })
  it('a tela usa a conta', () => {
    expect(ler('components/setup/setup-wizard.tsx')).toContain('domingoFechadoNoHorario(')
  })
})

describe('A26: a unidade sem pino no mapa é dita junto do mapa', () => {
  it('o CEP que não se acha cai na cidade, e a cidade vai junto na busca', async () => {
    const { cidadesParaBuscar, avisosDoMapa } = await import('@/components/admin/hotmap-types')
    const unidades = [
      { id: 'a', name: 'Casa Forte', cityKey: 'Recife, PE', cep: '52061-000' },
      { id: 'b', name: 'Derby', cityKey: 'Recife, PE', cep: null },
      { id: 'c', name: 'Sem nada', cityKey: '', cep: null },
    ]
    expect(cidadesParaBuscar(unidades)).toEqual(['Recife, PE'])
    expect(avisosDoMapa(unidades, { ceps: { '52061000': null }, cidades: { 'Recife, PE': { lat: 1, lng: 1 } } })).toEqual([
      'Casa Forte no centro da cidade: o CEP 52061-000 não foi achado, confira.',
      'Sem nada sem localização: cadastre o CEP ou a cidade.',
    ])
    expect(avisosDoMapa(unidades.slice(0, 1), { ceps: { '52061000': null }, cidades: { 'Recife, PE': null } })).toEqual([
      'Casa Forte sem localização: confira o CEP 52061-000.',
    ])
  })
  it('o mapa mostra os avisos', () => {
    const f = ler('components/admin/hotmap-section.tsx')
    expect(f).toContain('cidadesParaBuscar(')
    expect(f).toContain('data-unidades-sem-pino')
  })
})

describe('A27: o que falta escolher no cargo, junto do "Salvar acessos"', () => {
  it('o texto diz o módulo', async () => {
    const { textoDoQueFaltaNoCargo } = await import('@/lib/permissions-copy')
    expect(textoDoQueFaltaNoCargo(['Prontuário'], false)).toBe('Falta escolher o que o cargo enxerga em Prontuário.')
    expect(textoDoQueFaltaNoCargo(['Prontuário', 'Agenda'], true))
      .toBe('Falta escolher o que o cargo enxerga em Prontuário e Agenda, e ao menos um relatório em Relatórios (ou deixe Relatórios em "Sem acesso").')
    expect(textoDoQueFaltaNoCargo([], true)).toBe('Falta escolher ao menos um relatório em Relatórios (ou deixe Relatórios em "Sem acesso").')
  })
  it('a mensagem fica na linha do botão, e o aviso aparece mesmo com a tela rolada', () => {
    const f = ler('components/admin/roles-editor.tsx')
    expect(f).toContain('textoDoQueFaltaNoCargo(')
    expect(f).toMatch(/data-falta-escolher[\s\S]{0,1500}Salvar acessos/)
    expect(f).toMatch(/toast\.warning\(/)
  })
})

describe('A28: a linha da Equipe diz a principal', () => {
  it('o texto', async () => {
    const { unidadesDaLinhaDaEquipe } = await import('@/lib/equipe/atende')
    expect(unidadesDaLinhaDaEquipe('Derby', ['Casa Forte'])).toBe('Derby (principal) e Casa Forte')
    expect(unidadesDaLinhaDaEquipe('Derby', ['Casa Forte', 'Boa Viagem'])).toBe('Derby (principal), Casa Forte e Boa Viagem')
    expect(unidadesDaLinhaDaEquipe('Derby', [])).toBe('Derby')
  })
  it('a página usa o texto', () => {
    expect(ler('app/admin/team/page.tsx')).toContain('unidadesDaLinhaDaEquipe(')
  })
})

describe('A29: no desativar, marcar quem atende sem perder a janela', () => {
  it('a Equipe abre em outra aba, e a lista se atualiza na janela', () => {
    const f = ler('components/admin/desativar-membro.tsx')
    expect(f).toContain('data-abrir-equipe')
    expect(f).toContain('target="_blank"')
    expect(f).toContain('Atualizar a lista')
  })
})
