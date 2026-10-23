/**
 * Cifra as credenciais que ainda estão em texto no banco (2026-10-23).
 *
 * O app passou a gravar os segredos de `integration_configs` e
 * `whatsapp_numbers` cifrados (lib/integracoes/cofre.ts) e a ler os dois
 * formatos. Este script passa UMA vez pelas linhas antigas. Também serve para
 * conferir depois: sem `--gravar`, só conta.
 *
 * ⚠️ Rodar SÓ com o código novo já no ar: o antigo leria o token cifrado como
 * se fosse o token, e o envio pararia.
 *
 * Uso (de apps/web, com o .env.local da produção — a MESMA CREDENCIAIS_CHAVE
 * do Railway):
 *   node ../../node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs scripts/cifrar-credenciais.ts
 *   … scripts/cifrar-credenciais.ts --gravar
 *
 * Nunca imprime um segredo: só contagens e ids.
 */
import { isDeepStrictEqual } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { cifrarSegredos, decifrarSegredos, temSegredoEmTextoPuro } from '../lib/integracoes/cofre'

process.loadEnvFile('.env.local')
const gravar = process.argv.includes('--gravar')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function passar(tabela: 'integration_configs' | 'whatsapp_numbers') {
  let pendentes = 0, cifradas = 0, total = 0
  for (let de = 0; ; de += 500) {
    const { data, error } = await admin.from(tabela).select('id, config').order('id').range(de, de + 499)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    for (const linha of (data ?? []) as { id: string; config: Record<string, unknown> | null }[]) {
      total++
      if (!temSegredoEmTextoPuro(linha.config)) continue
      pendentes++
      const config = linha.config ?? {}
      const cifrado = cifrarSegredos(config)
      // Ida e volta ANTES de gravar: o que for ao banco tem de voltar igual.
      if (!isDeepStrictEqual(decifrarSegredos(cifrado), config)) throw new Error(`${tabela} ${linha.id}: a ida e volta não bateu`)
      if (!gravar) continue
      const { error: e } = await admin.from(tabela).update({ config: cifrado }).eq('id', linha.id)
      if (e) throw new Error(`${tabela} ${linha.id}: ${e.message}`)
      cifradas++
    }
    if ((data ?? []).length < 500) break
  }
  console.log(`${tabela}: ${total} linhas · ${pendentes} com segredo em texto · ${cifradas} cifradas agora`)
}

async function principal() {
  await passar('integration_configs')
  await passar('whatsapp_numbers')
  if (!gravar) console.log('(ensaio: nada foi gravado — rode com --gravar)')
}

principal().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
