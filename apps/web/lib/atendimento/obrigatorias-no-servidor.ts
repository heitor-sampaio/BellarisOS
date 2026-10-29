import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { normalizeFormSchema } from '@/lib/anamnesis'
import { paraAnamneseGeral, type AnamneseGeral } from '@/lib/anamnese-geral'
import { fichaDePreAtendimento } from '@/lib/pre-atendimento/ficha'
import { faltaNaAnamnese, faltaNaFichaDoProcedimento } from '@/lib/atendimento/obrigatorias'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O SERVIDOR confere as obrigatórias antes de concluir o atendimento ou gerar
 * o plano da avaliação (revisão do Heitor, 2026-10-29): a tela aponta o
 * campo, mas a trava não pode ser só dela. Devolve a mensagem do que falta
 * (a primeira obrigatória vazia, a anamnese antes da ficha — a ordem da tela)
 * ou nulo.
 *
 * Vale o que FICA gravado depois do gesto:
 * - **anamnese**: a que a tela manda gravar (`anamneseNaTela`, já montada por
 *   `anamneseDaEquipeParaGravar`); sem ela, a gravada — a que a cliente
 *   respondeu pelo app ou pelo link vale. A obrigatória só falta quando não
 *   tem resposta em lugar nenhum. As perguntas são as da ficha de
 *   pré-atendimento ATUAL da rede.
 * - **ficha do procedimento**: as respostas que a tela manda (`fichaNaTela`);
 *   sem elas, as salvas antes. As perguntas são as da ficha ligada ao
 *   procedimento AGORA (da rede, `tipo = 'PROCEDIMENTO'`). Procedimento sem
 *   ficha, ou ficha sem obrigatória, não barra nada.
 *
 * Quem não vê o clínico não recebe a ficha nem a anamnese na tela, mas a
 * regra é a mesma: o servidor recusa, e a mensagem diz só o NOME da
 * pergunta (estrutura da ficha, nenhuma resposta).
 */
export async function oQueFaltaParaSeguir(admin: Admin, o: {
  tenantId:       string
  appointmentId:  string
  procedureId:    string | null
  clientId:       string | null
  semInjetaveis:  boolean
  anamneseNaTela: AnamneseGeral | null
  fichaNaTela:    Record<string, unknown> | null
}): Promise<string | null> {
  if (o.clientId) {
    const fichaAtual = await fichaDePreAtendimento(admin, o.tenantId)
    let respostas: Record<string, unknown> | null = o.anamneseNaTela?.respostas ?? null
    if (!respostas) {
      const mr = await ler(admin.from('medical_records').select('general_anamnesis')
        .eq('client_id', o.clientId).maybeSingle(), 'buscar a anamnese da cliente') as { general_anamnesis: unknown } | null
      respostas = paraAnamneseGeral(mr?.general_anamnesis ?? null, fichaAtual)?.respostas ?? {}
    }
    const falta = faltaNaAnamnese(fichaAtual.rows, respostas)
    if (falta) return falta.mensagem
  }

  if (o.procedureId) {
    const proc = await ler(admin.from('procedures').select('form_id')
      .eq('id', o.procedureId).eq('tenant_id', o.tenantId).maybeSingle(), 'buscar o procedimento') as { form_id: string | null } | null
    const form = proc?.form_id
      ? await ler(admin.from('forms').select('schema')
          .eq('id', proc.form_id).eq('tenant_id', o.tenantId).eq('tipo', 'PROCEDIMENTO').maybeSingle(), 'buscar a ficha do procedimento') as { schema: unknown } | null
      : null
    if (form) {
      let respostas = o.fichaNaTela
      if (!respostas) {
        const entrada = await ler(admin.from('medical_record_entries').select('form_data')
          .eq('appointment_id', o.appointmentId).maybeSingle(), 'buscar a ficha salva') as { form_data: { ficha?: { answers?: unknown } } | null } | null
        const salvas = entrada?.form_data?.ficha?.answers
        respostas = salvas && typeof salvas === 'object' && !Array.isArray(salvas) ? salvas as Record<string, unknown> : {}
      }
      const falta = faltaNaFichaDoProcedimento(normalizeFormSchema(form.schema).rows, respostas, { semInjetaveis: o.semInjetaveis })
      if (falta) return falta.mensagem
    }
  }
  return null
}
