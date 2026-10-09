import { describe, it, expect } from 'vitest'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions'
import { paginasDaBusca, paginasQueCasam } from '@/lib/busca/paginas'
import { tiposPermitidos } from '@/lib/busca/tipos'
import { destinoDoResultado } from '@/lib/busca/destino'
import { casaComTermo, telefoneLegivel } from '@/lib/busca/texto'
import { resultadoDaLinha, subtituloDaConversa } from '@/lib/busca/formatar'
import { conversaCasaComBusca } from '@/lib/inbox/busca'

const com = (p: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...p })

describe('tiposPermitidos — a busca não abre exceção de alcance', () => {
  it('sem módulo nenhum, o servidor não procura nada', () => {
    expect(tiposPermitidos(NO_PERMISSIONS)).toEqual([])
  })

  it('cada tipo pede o módulo da tela própria dele', () => {
    expect(tiposPermitidos(com({ clients: 'VIEW' }))).toEqual(['cliente'])
    expect(tiposPermitidos(com({ crm: 'VIEW' }))).toEqual(['conversa', 'oportunidade'])
    expect(tiposPermitidos(com({ agenda: 'MANAGE' }))).toEqual(['agendamento'])
    expect(tiposPermitidos(com({ team: 'VIEW' }))).toEqual(['membro'])
    expect(tiposPermitidos(com({ procedures: 'VIEW' }))).toEqual(['procedimento', 'pacote'])
    expect(tiposPermitidos(com({ stock: 'VIEW' }))).toEqual(['produto'])
  })

  it('com tudo, procura tudo', () => {
    expect(tiposPermitidos(ALL_PERMISSIONS)).toHaveLength(8)
  })

  it('a funcionalidade fora do plano sai, mesmo com o módulo (inbox, oportunidades, pacotes)', () => {
    const plano = (fora: string[]) => (chave: string) => !fora.includes(chave)
    expect(tiposPermitidos(ALL_PERMISSIONS, plano(['inbox']))).not.toContain('conversa')
    expect(tiposPermitidos(ALL_PERMISSIONS, plano(['inbox']))).toContain('oportunidade')
    expect(tiposPermitidos(ALL_PERMISSIONS, plano(['oportunidades']))).not.toContain('oportunidade')
    expect(tiposPermitidos(ALL_PERMISSIONS, plano(['pacotes']))).toEqual(
      ['cliente', 'conversa', 'oportunidade', 'agendamento', 'membro', 'procedimento', 'produto'])
  })
})

describe('paginasDaBusca — o catálogo vem do menu e das abas', () => {
  it('na rede, endereços em /admin; na unidade, com o slug', () => {
    const rede = paginasDaBusca(null, com({ agenda: 'VIEW' }))
    expect(rede.find(p => p.key === 'agenda')?.href).toBe('/admin/agenda')
    const unidade = paginasDaBusca('centro', com({ agenda: 'VIEW' }))
    expect(unidade.find(p => p.key === 'agenda')?.href).toBe('/centro/agenda')
  })

  it('só oferece o que o cargo abre', () => {
    const keys = paginasDaBusca(null, com({ agenda: 'VIEW' })).map(p => p.key)
    expect(keys).toContain('agenda')
    expect(keys).not.toContain('financial')
    expect(keys).not.toContain('settings')
  })

  it('aba de Configurações pede MANAGE no módulo dela', () => {
    const so = paginasDaBusca(null, com({ settings: 'VIEW' })).map(p => p.key)
    expect(so).not.toContain('settings:fidelidade')
    const gere = paginasDaBusca(null, com({ settings: 'MANAGE' }))
    expect(gere.find(p => p.key === 'settings:fidelidade')).toMatchObject({
      titulo: 'Configurações → Fidelidade',
      href:   '/admin/settings?tab=fidelidade',
    })
  })

  it('a unidade só oferece as abas que ela tem', () => {
    const keys = paginasDaBusca('centro', com({ settings: 'MANAGE', roles: 'MANAGE' })).map(p => p.key)
    expect(keys).toContain('settings:permissions')
    expect(keys).toContain('settings:general')
    expect(keys).not.toContain('settings:fidelidade')
    expect(keys).not.toContain('settings:unidades')
  })

  it('o fechamento de comissões aparece com o financeiro', () => {
    expect(paginasDaBusca('centro', com({ financial: 'VIEW' })).find(p => p.key === 'financial:comissoes')?.href)
      .toBe('/centro/financeiro/comissoes')
  })
})

describe('paginasQueCasam', () => {
  const paginas = paginasDaBusca(null, ALL_PERMISSIONS)

  it('compara sem acento e sem caixa', () => {
    expect(paginasQueCasam(paginas, 'configuracoes fidel').map(r => r.id)).toEqual(['settings:fidelidade'])
  })

  it('acha pelo apelido: "negócio" é oportunidade, "usuário" é equipe', () => {
    expect(paginasQueCasam(paginas, 'negocios').map(r => r.id)).toContain('oportunidades')
    expect(paginasQueCasam(paginas, 'usuarios').map(r => r.id)).toContain('team')
  })

  it('o resultado já leva o endereço', () => {
    expect(paginasQueCasam(paginas, 'estoque')[0]).toMatchObject({ tipo: 'pagina', href: '/admin/estoque' })
  })
})

describe('destinoDoResultado — o portal é onde a pessoa está', () => {
  const r = (tipo: Parameters<typeof destinoDoResultado>[2]['tipo'], extra = {}) =>
    ({ tipo, id: 'id-1', titulo: 'Ana Souza', subtitulo: null, ...extra })

  it('registros com tela própria', () => {
    expect(destinoDoResultado('/admin/agenda', null, r('cliente'))).toBe('/admin/clients/id-1')
    expect(destinoDoResultado('/centro/agenda', 'centro', r('conversa'))).toBe('/centro/inbox?c=id-1')
    expect(destinoDoResultado('/centro/agenda', 'centro', r('agendamento'))).toBe('/centro/agenda/id-1')
    expect(destinoDoResultado('/admin/x', null, r('oportunidade', { funilId: 'f-1' })))
      .toBe('/admin/oportunidades?funil=f-1&lead=id-1')
  })

  it('sem tela própria, a lista filtrada pelo nome', () => {
    expect(destinoDoResultado('/admin/x', null, r('membro'))).toBe('/admin/team?q=Ana%20Souza')
    expect(destinoDoResultado('/centro/x', 'centro', r('produto'))).toBe('/centro/estoque?q=Ana%20Souza')
    expect(destinoDoResultado('/centro/x', 'centro', r('procedimento'))).toBe('/centro/procedures?q=Ana%20Souza')
    expect(destinoDoResultado('/centro/x', 'centro', r('pacote'))).toBe('/centro/pacotes?q=Ana%20Souza')
  })
})

describe('texto', () => {
  it('casaComTermo: todas as palavras, sem acento', () => {
    expect(casaComTermo('joao sil', ['João da Silva'])).toBe(true)
    expect(casaComTermo('joao souza', ['João da Silva'])).toBe(false)
    expect(casaComTermo('   ', ['qualquer'])).toBe(false)
  })

  it('telefoneLegivel tira o país e põe a máscara', () => {
    expect(telefoneLegivel('5544988887777')).toBe('(44) 98888-7777')
    expect(telefoneLegivel('4433334444')).toBe('(44) 3333-4444')
    expect(telefoneLegivel('123')).toBe('123')
    expect(telefoneLegivel(null)).toBeNull()
  })
})

describe('resultadoDaLinha', () => {
  it('oportunidade: etapa, desfecho e dono; o funil vai junto', () => {
    expect(resultadoDaLinha({
      tipo: 'oportunidade', id: 'l1', titulo: 'Ana', subtitulo: 'Proposta',
      extra: { funilId: 'f1', desfecho: 'LOST', dono: null },
    })).toEqual({ tipo: 'oportunidade', id: 'l1', titulo: 'Ana', subtitulo: 'Proposta (perdida) · sem responsável', funilId: 'f1' })
  })

  it('membro desativado é dito', () => {
    expect(resultadoDaLinha({
      tipo: 'membro', id: 'u1', titulo: 'Bia', subtitulo: 'SDR', extra: { ativo: false, unidade: null },
    })?.subtitulo).toBe('SDR · Rede · desativado')
  })

  it('agendamento no fuso da clínica', () => {
    const sub = resultadoDaLinha({
      tipo: 'agendamento', id: 'a1', titulo: 'Ana', subtitulo: 'Limpeza',
      extra: { quando: '2026-10-08T17:30:00Z', profissional: 'Dra. Lu', unidade: 'Centro' },
    })?.subtitulo
    expect(sub).toMatch(/08\/10 às 14:30 · Limpeza · Dra\. Lu · Centro$/)
  })

  it('tipo desconhecido fica de fora', () => {
    expect(resultadoDaLinha({ tipo: 'nave', id: 'x', titulo: 'x', subtitulo: null, extra: null })).toBeNull()
  })

  it('conversa: canal, caixa e o começo da última mensagem', () => {
    expect(subtituloDaConversa({ channel: 'whatsapp', caixa: 'Marek', last_message: 'oi' })).toBe('WhatsApp · Marek · oi')
    expect(subtituloDaConversa({ channel: 'instagram', caixa: null, last_message: 'x'.repeat(80) }))
      .toBe(`Instagram · ${'x'.repeat(57)}…`)
  })
})

describe('conversaCasaComBusca — a guarda do inbox compara como o banco', () => {
  const c = { contact_name: 'João Souza', last_message: 'Quero marcar', contact_phone: '(44) 98888-7777', lead_tags: ['Botox'] }

  it('sem acento e sem caixa', () => {
    expect(conversaCasaComBusca(c, 'joao')).toBe(true)
    expect(conversaCasaComBusca(c, 'BOTOX')).toBe(true)
    expect(conversaCasaComBusca(c, 'maria')).toBe(false)
  })

  it('telefone por dígitos, com ou sem máscara', () => {
    expect(conversaCasaComBusca(c, '98888 7777')).toBe(true)
    expect(conversaCasaComBusca({ ...c, contact_phone: '5544988887777' }, '(44) 98888')).toBe(true)
  })

  it('termo vazio deixa passar tudo', () => {
    expect(conversaCasaComBusca(c, '  ')).toBe(true)
  })
})
