import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { buscaClienteParaPlano } from '@/lib/plano-de-tratamento/quem-monta'

/**
 * D5 da 35ª (PL-02: "vincula" é de quem tem o Atendimento em Gerenciar — o
 * Heitor, 2026-11-23, UM3): quem monta o plano sem ter o Clientes não ligava a
 * cliente no "Novo plano" — a busca pedia o Clientes em Ver e LANÇAVA (500 na
 * tela). A busca é de quem liga a cliente; sem o Clientes, devolve só o nome
 * (nada do cadastro), e a falta de permissão volta como { error }.
 */

const UNIDADE = '00000000-0000-0000-0000-00000000000a'
type Ctx = Parameters<typeof buscaClienteParaPlano>[0]
const membro = (p: Partial<ResolvedPermissions>, over: Partial<Ctx> = {}): Ctx =>
  ({ isNetworkAdmin: false, permissions: { ...NO_PERMISSIONS, ...p } as ResolvedPermissions, branchId: UNIDADE, unidades: [UNIDADE], ...over })

describe('D5: quem busca a cliente para o plano', () => {
  it('o Clientes em Ver: a ficha (nome, telefone, documento)', () => {
    expect(buscaClienteParaPlano(membro({ clients: 'VIEW' }))).toBe('FICHA')
  })
  it('o Atendimento em Gerenciar sem o Clientes: só o nome', () => {
    expect(buscaClienteParaPlano(membro({ atendimento: 'MANAGE' }))).toBe('SO_O_NOME')
  })
  it('sem nenhum dos dois: ninguém', () => {
    expect(buscaClienteParaPlano(membro({ atendimento: 'VIEW' }))).toBeNull()
    expect(buscaClienteParaPlano(membro({}))).toBeNull()
  })
  it('a action não lança pela permissão e não manda o cadastro a quem só monta', () => {
    const a = readFileSync(join(__dirname, '..', 'actions', 'treatment-plans.ts'), 'utf8')
    const corpo = a.slice(a.indexOf('export async function buscarClientesParaPlano'), a.indexOf('/** Renomeia o plano. */'))
    expect(corpo).not.toMatch(/assertPermission\(ctx, 'clients', 'VIEW'\)/)
    expect(corpo).toMatch(/buscaClienteParaPlano\(ctx\)/)
    expect(corpo).toMatch(/error:/)
    expect(corpo).toMatch(/SO_O_NOME/)
  })
})

describe('D5: o "Novo plano" oferece a cliente a quem monta', () => {
  it('a lista de Tratamentos decide a busca pela mesma regra', () => {
    const l = readFileSync(join(__dirname, '..', 'app', '_shared', 'lista-de-planejamentos.tsx'), 'utf8')
    expect(l).toMatch(/podeBuscarCliente=\{buscaClienteParaPlano\(ctx\) !== null\}/)
  })
})
