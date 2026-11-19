import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * As telas que mostram dinheiro assinam um SINAL, não a tabela (F67, a sobra
 * da F63): `financial_transactions` e `commissions` não vão pelo Realtime —
 * a linha inteira iria pelo websocket a quem o "só os meus" esconde. E o
 * canal com uma tabela fora da publicação falha INTEIRO (`commissions` e
 * `procedure_sales` não estão nela): o relatório ficava sem tempo real.
 */

const RAIZ = join(__dirname, '..')
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) return []
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('o Realtime das telas', () => {
  it('nenhum RealtimeRefresher assina a tabela do dinheiro nem uma fora da publicação', () => {
    // `domain_events` e `automation_runs` (AUT-01, 18/11): a corrente levava o
    // texto da mensagem recebida a todo membro; as Automações escutam
    // `automacoes_sinais`. `medical_record_entries` (ATD-P01): a evolução ia
    // a quem o Prontuário "só os meus" esconde; a tela do atendimento escuta
    // `prontuario_sinais`. As três saíram da publicação (20261124400002).
    const proibidas = [
      'financial_transactions', 'commissions', 'procedure_sales',
      'domain_events', 'automation_runs', 'medical_record_entries',
    ]
    const achados: string[] = []
    for (const f of [...arquivos(join(RAIZ, 'app')), ...arquivos(join(RAIZ, 'components'))]) {
      const texto = readFileSync(f, 'utf-8')
      for (const m of texto.matchAll(/<RealtimeRefresher[\s\S]*?\/>/g)) {
        for (const t of proibidas) if (m[0].includes(`'${t}'`)) achados.push(`${f.slice(RAIZ.length)}: ${t}`)
      }
    }
    expect(achados).toEqual([])
  })

  it('a página do inbox não recarrega a cada mensagem: só pelo sinal do quadro (oportunidades, etapas, funis, tags)', () => {
    // 19/11, ao Heitor ("o inbox que pode ter muita atualização e vai
    // atualizar toda rede"): a lista e a conversa aberta se recarregam sozinhas
    // (o tópico `inbox` e o sinal da conversa, no CRMInbox). A PÁGINA relê
    // tudo — as oportunidades da rede inteira, as opções dos filtros, os
    // canais —, e só precisa disso quando muda o que o quadro mostra.
    for (const pagina of ['app/admin/inbox/page.tsx', 'app/[slug]/inbox/page.tsx']) {
      const texto = readFileSync(join(RAIZ, pagina), 'utf-8')
      const refresher = texto.match(/<RealtimeRefresher[\s\S]*?\/>/g) ?? []
      expect(refresher, pagina).toEqual(["<RealtimeRefresher tables={['crm_quadro_sinais']} />"])
    }
  })
})
