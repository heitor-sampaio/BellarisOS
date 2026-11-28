import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A4 da 41ª (DE-15: o termo que bloqueia libera o início quando assinado;
 * princípio 3): depois da assinatura pelo link, o "Iniciar" seguia desligado
 * até recarregar. A tela do atendimento assina os sinais da agenda, do
 * prontuário e do financeiro, e nenhum se marcava na assinatura: o documento
 * (`issued_documents`) não tinha gatilho de sinal.
 *
 * Agora o documento ligado a um atendimento marca o sinal da agenda (o mesmo
 * que a tela já assina), na emissão, na assinatura, no PDF e na dispensa.
 */
const raiz = join(__dirname, '..', '..', '..')
const migracoes = readdirSync(join(raiz, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort()

describe('a tela do atendimento recebe a assinatura do termo', () => {
  it('o documento do atendimento marca o sinal da agenda', () => {
    const sql = migracoes.map(f => readFileSync(join(raiz, 'supabase', 'migrations', f), 'utf8')).join('\n')
    expect(sql).toMatch(/create trigger trg_sinal_issued_documents_agenda\s+after insert or update on public\.issued_documents\s+for each row\s+when \(new\.appointment_id is not null\)\s+execute function private\.marcar_sinal\('agenda'\)/)
  })

  it('a tela do atendimento assina o sinal da agenda', () => {
    const pagina = readFileSync(join(__dirname, '..', 'app/_shared/sessao-de-atendimento.tsx'), 'utf8')
    expect(pagina).toMatch(/<RealtimeRefresher[^>]*topicos=\{\[[^\]]*'agenda'/)
  })
})
