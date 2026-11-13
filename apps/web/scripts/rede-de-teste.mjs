#!/usr/bin/env node
/**
 * A REDE DE TESTE dos testes automáticos (2026-11-13).
 *
 * O banco foi zerado em 2026-11-13 (o Heitor: "apagar tudo, criar uma rede de
 * testes para os testes automatizados"). Os specs leem "a rede de verdade"
 * por `tenantId()` (`e2e/apoio/banco.ts`): a rede de endereço `rede-de-teste`
 * (ou o de `E2E_REDE`). Este script cria essa rede, do zero, com o mínimo que
 * a suíte supõe existir e não cria sozinha:
 *
 *  - a pessoa da sessão do E2E (`E2E_ADMIN_EMAIL`, padrão
 *    admin@bellaris.com.br) com o cargo de sistema Admin da rede e a
 *    abrangência da rede inteira — o `global-setup` abre a sessão dela por
 *    magic link, sem senha;
 *  - duas unidades ativas (a transferência de estoque e os testes de
 *    abrangência precisam de duas), com salas;
 *  - em cada unidade, uma pessoa que ATENDE (`atende_em`) e uma que não
 *    atende (as "pessoas livres" dos testes de número de WhatsApp);
 *  - procedimentos, clientes e produtos com saldo.
 *
 * Tudo o mais (funil, número de WhatsApp, integrações) nasce como numa rede
 * nova de verdade: pela tela, quando alguém configura. Os logins da equipe
 * são `@bellaris.invalid` e não têm senha.
 *
 * Uso (de apps/web): `node scripts/rede-de-teste.mjs`. Recusa rodar se a rede
 * de teste já existe. Convive com as redes das simulações: os endereços das
 * unidades levam o da rede (são únicos no sistema inteiro) e a rede não tem
 * CNPJ (também único entre as redes).
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(aqui, '..', '.env.local'), quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chave) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local.')
  process.exit(1)
}
const db = createClient(url, chave, { auth: { persistSession: false } })
const EMAIL_ADMIN = (process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br').toLowerCase()
const SLUG = process.env.E2E_REDE ?? 'rede-de-teste'

function falhou(oQue, error) {
  throw new Error(`${oQue}: ${error?.message ?? JSON.stringify(error)}`)
}

async function um(consulta, oQue) {
  const { data, error } = await consulta
  if (error) falhou(oQue, error)
  return data
}

/** CPF válido (os dígitos verificadores certos) a partir de nove dígitos. */
function cpf(base9) {
  const d = String(base9).padStart(9, '0').split('').map(Number)
  for (const n of [10, 11]) {
    const soma = d.reduce((s, x, i) => s + x * (n - i), 0)
    const resto = (soma * 10) % 11
    d.push(resto === 10 ? 0 : resto)
  }
  return d.join('')
}

/** O login (sem senha): o E2E entra por magic link. */
async function login(email) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (data?.user) return data.user.id
  falhou(`criar o login ${email}`, error)
}

async function membro({ tenantId, roleId, email, nome, branchId = null, atendeEm = [] }) {
  const authId = await login(email)
  const linha = await um(db.from('users').insert({
    tenant_id: tenantId, auth_id: authId, branch_id: branchId, role_id: roleId,
    name: nome, email, atende_em: atendeEm,
  }).select('id').single(), `criar ${nome}`)
  await um(db.rpc('set_user_claims', {
    p_auth_id: authId, p_tenant_id: tenantId, p_branch_id: branchId, p_role_id: roleId,
  }), `gravar o acesso de ${nome}`)
  return linha.id
}

async function main() {
  const ja = await um(db.from('tenants').select('id').eq('slug', SLUG).maybeSingle(), 'conferir a rede de teste')
  if (ja) {
    console.error(`A rede de teste ("${SLUG}") já existe: ${ja.id}. Nada foi criado.`)
    process.exit(1)
  }

  // 1. A rede. Os gatilhos semeiam os cargos (o de sistema e os modelos), as
  //    categorias de procedimento, as origens e os motivos de perda.
  const rede = await um(db.from('tenants').insert({
    name: 'Rede de Teste', slug: SLUG, email: EMAIL_ADMIN, plan_status: 'active',
    onboarding_completed_at: new Date().toISOString(),
  }).select('id').single(), 'criar a rede')
  const tenantId = rede.id
  await um(db.rpc('documentos_modelos_padrao', { p_tenant: tenantId }), 'semear o contrato de plano padrão')

  const cargos = await um(db.from('tenant_roles').select('id, key').eq('tenant_id', tenantId), 'ler os cargos')
  const cargo = key => {
    const c = cargos.find(r => r.key === key)
    if (!c) throw new Error(`a rede nasceu sem o cargo ${key}`)
    return c.id
  }

  // 2. As unidades e as salas.
  const unidades = await um(db.from('branches').insert([
    { tenant_id: tenantId, name: 'Unidade Centro', slug: `${SLUG}-centro` },
    { tenant_id: tenantId, name: 'Unidade Jardins', slug: `${SLUG}-jardins` },
  ]).select('id, slug'), 'criar as unidades')
  const centro = unidades.find(u => u.slug === `${SLUG}-centro`).id
  const jardins = unidades.find(u => u.slug === `${SLUG}-jardins`).id
  await um(db.from('rooms').insert([
    { branch_id: centro, name: 'Sala 1' }, { branch_id: centro, name: 'Sala 2' },
    { branch_id: jardins, name: 'Sala 1' }, { branch_id: jardins, name: 'Sala 2' },
  ]), 'criar as salas')

  // 3. A equipe.
  await membro({ tenantId, roleId: cargo('NETWORK_ADMIN'), email: EMAIL_ADMIN, nome: 'Admin da Rede de Teste' })
  await membro({ tenantId, roleId: cargo('PROFESSIONAL'), email: 'prof.centro@bellaris.invalid', nome: 'Carla Nunes', branchId: centro, atendeEm: [centro] })
  await membro({ tenantId, roleId: cargo('PROFESSIONAL'), email: 'prof.jardins@bellaris.invalid', nome: 'Bruna Ferraz', branchId: jardins, atendeEm: [jardins] })
  await membro({ tenantId, roleId: cargo('RECEPTIONIST'), email: 'recepcao.centro@bellaris.invalid', nome: 'Diana Rocha', branchId: centro })
  await membro({ tenantId, roleId: cargo('RECEPTIONIST'), email: 'recepcao.jardins@bellaris.invalid', nome: 'Elisa Prado', branchId: jardins })

  // 4. Os procedimentos (da rede, nas duas unidades), com a categoria que a rede ganhou ao nascer.
  const categorias = await um(db.from('procedure_categories').select('nome').eq('tenant_id', tenantId).order('nome'), 'ler as categorias')
  const categoria = categorias[0]?.nome ?? 'Estética'
  await um(db.from('procedures').insert([
    { tenant_id: tenantId, name: 'Limpeza de pele', category: categoria, duration_min: 60, price: 180, visible_on_client_app: true },
    { tenant_id: tenantId, name: 'Drenagem linfática', category: categoria, duration_min: 50, price: 150, visible_on_client_app: true },
    { tenant_id: tenantId, name: 'Peeling químico', category: categoria, duration_min: 45, price: 250, visible_on_client_app: false },
    { tenant_id: tenantId, name: 'Toxina botulínica', category: categoria, duration_min: 30, price: 900, visible_on_client_app: false },
  ]), 'criar os procedimentos')

  // 5. Os clientes (com a conta de fidelidade, como o cadastro faz).
  const nomes = ['Mariana Souza', 'Fernanda Lima', 'Juliana Prado', 'Patrícia Gomes', 'Renata Alves', 'Camila Rocha']
  const clientes = await um(db.from('clients').insert(nomes.map((name, i) => ({
    tenant_id: tenantId, branch_id: i % 2 ? jardins : centro, name,
    phone: `4899900${String(1000 + i)}`, document: cpf(123456780 + i * 7),
    email: `cliente${i + 1}@bellaris.invalid`,
  }))).select('id'), 'criar os clientes')
  await um(db.from('loyalty_accounts').upsert(clientes.map(c => ({ client_id: c.id })), { onConflict: 'client_id' }), 'criar as contas de fidelidade')

  // 6. Os produtos, com saldo nas duas unidades.
  const produtos = await um(db.from('products').insert([
    { tenant_id: tenantId, name: 'Sérum de vitamina C', unit: 'un', sale_price: 120, cost_price: 45, uso: 'AMBOS' },
    { tenant_id: tenantId, name: 'Luvas descartáveis', unit: 'un', cost_price: 0.5, sale_price: null, uso: 'INSUMO' },
  ]).select('id'), 'criar os produtos')
  await um(db.from('branch_product_stock').insert(produtos.flatMap(p => [
    { product_id: p.id, branch_id: centro, current_stock: 50, min_stock: 5 },
    { product_id: p.id, branch_id: jardins, current_stock: 50, min_stock: 5 },
  ])), 'dar saldo aos produtos')

  console.log(`Rede de teste criada: ${tenantId} (unidades ${SLUG}-centro e ${SLUG}-jardins; sessão do E2E: ${EMAIL_ADMIN}).`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
