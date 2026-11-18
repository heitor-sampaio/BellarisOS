import { describe, it, expect } from 'vitest'
import { ALL_PERMISSIONS, NO_PERMISSIONS } from '@/lib/permissions'
import { paginasDaBusca, paginasQueCasam } from '@/lib/busca/paginas'

/**
 * A18 da 8ª simulação (2026-11-06): no Ctrl K, "Funil" abria Oportunidades e
 * "Termos" abria Documentos, sem a configuração; "Cargos" e "Taxas" não
 * achavam nada. A busca acha as configurações pelo nome que as pessoas usam.
 */
describe('a busca acha as configurações (A18 da 8ª)', () => {
  // A configuração dos funis é da Admin da rede (CLAUDE.md §11, o Heitor, 18/11).
  const rede = paginasDaBusca(null, ALL_PERMISSIONS, null, undefined, { adminDaRede: true })
  const ids = (termo: string, paginas = rede) => paginasQueCasam(paginas, termo).map(r => r.id)

  it('"funil" leva à configuração dos funis, além do quadro', () => {
    const achados = paginasQueCasam(rede, 'funil')
    expect(achados.map(r => r.id)).toContain('oportunidades:funis')
    expect(achados.find(r => r.id === 'oportunidades:funis')).toMatchObject({ href: '/admin/oportunidades?configurar=funis' })
    expect(achados.find(r => r.id === 'oportunidades')?.subtitulo).toMatch(/quadro/i)
    expect(ids('etapas')).toContain('oportunidades:funis')
    expect(ids('motivos de perda')).toContain('oportunidades:funis')
  })

  it('"termos" diz qual é a configuração (os modelos) e qual é a lista dos emitidos', () => {
    const achados = paginasQueCasam(rede, 'termos')
    expect(achados.find(r => r.id === 'settings:documentos')?.subtitulo).toMatch(/modelos de termo e contrato/i)
    expect(achados.find(r => r.id === 'documentos')?.subtitulo).toMatch(/emitidos/i)
  })

  it('"cargos", "permissões" e "taxas" acham a aba', () => {
    expect(ids('cargos')).toContain('settings:permissions')
    expect(ids('cargo')).toContain('settings:permissions')
    expect(ids('taxas')).toContain('settings:comissoes')
    expect(ids('taxa maquininha')).toContain('settings:comissoes')
  })

  it('no portal da unidade, quem é da rede acha as taxas (com o endereço da rede); a unidade fixa, não', () => {
    const daRede = paginasDaBusca('centro', ALL_PERMISSIONS, null, undefined, { daRede: true, adminDaRede: true })
    expect(paginasQueCasam(daRede, 'taxas').map(r => r.href)).toContain('/admin/settings?tab=comissoes')
    expect(paginasQueCasam(daRede, 'funil').map(r => r.href)).toContain('/centro/oportunidades?configurar=funis')
    const fixa = paginasDaBusca('centro', ALL_PERMISSIONS)
    expect(paginasQueCasam(fixa, 'taxas')).toEqual([])
    expect(paginasQueCasam(fixa, 'funil').map(r => r.id)).not.toContain('oportunidades:funis')
  })

  // CRM-05 da varredura de 18/11: a busca oferecia "Configurar funis" a quem
  // tem o CRM em Gerenciar, e a página só abre a janela para a Admin da rede
  // com Configurações em Gerenciar (app/*/oportunidades/page.tsx).
  it('a configuração dos funis é a da página: Admin da rede, com Configurações em Gerenciar', () => {
    expect(ids('funil', paginasDaBusca(null, { ...NO_PERMISSIONS, crm: 'VIEW' }, null, undefined, { adminDaRede: true }))).not.toContain('oportunidades:funis')
    // O CRM em Gerenciar, com "A rede inteira", sem ser a Admin da rede: não.
    expect(ids('funil', paginasDaBusca(null, ALL_PERMISSIONS))).not.toContain('oportunidades:funis')
    expect(ids('funil', paginasDaBusca('centro', ALL_PERMISSIONS, null, undefined, { daRede: true }))).not.toContain('oportunidades:funis')
    // A Admin da rede sem Configurações em Gerenciar: a página não abre a janela, a busca não oferece.
    expect(ids('funil', paginasDaBusca(null, { ...ALL_PERMISSIONS, settings: 'VIEW' }, null, undefined, { adminDaRede: true }))).not.toContain('oportunidades:funis')
    expect(ids('funil', paginasDaBusca(null, ALL_PERMISSIONS, null, undefined, { adminDaRede: true }))).toContain('oportunidades:funis')
  })
})
