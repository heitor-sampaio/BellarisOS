import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prontuarioLegivel } from '@/lib/lgpd/export'
import { fotosDoProntuario, linhasDasFotosNoPdf } from '@/lib/lgpd/fotos'

/**
 * O prontuário liberado leva as fotos e a ficha de saúde SEM repetir a que já
 * veio por um pedido respondido (LG-12 do catálogo de Clientes). D14 da 39ª: no
 * pacote da Isolina as fotos vinham só contadas ("fotos: 1", sem o arquivo nem
 * o link), e a ficha de saúde aparecia duas vezes no JSON — em `anamneseGeral`
 * (a do prontuário) e em `fichasDeSaude` (a do pedido respondido), com as
 * mesmas respostas. O PDF já não repetia (`fichasDeSaudeDoProntuario`, D3 da
 * 33ª); o JSON passa pela mesma regra.
 */

const WEB = join(__dirname, '..')
const FICHA = { nome: 'Pré-atendimento', rows: [{ id: 'r1', fields: [{ id: 'allergies', type: 'textarea', label: 'Alergias' }] }] }
const PELO_LINK = {
  respondidaEm: '2026-11-20T13:00:00.000Z', respondidaPor: 'a cliente, pelo link', ficha: 'Ficha de saúde',
  respostas: [{ pergunta: 'Alergias', resposta: 'Dipirona' }],
}

describe('a ficha de saúde no JSON do prontuário', () => {
  it('a ficha do prontuário que já veio pelo pedido respondido não se repete', () => {
    const p = prontuarioLegivel({
      anamneseGeral: { versao: 2, ficha: FICHA, respostas: { allergies: 'Dipirona' }, respondidoEm: '2026-11-20T13:00:00.000Z', origem: 'CLIENTE_LINK' },
      atendimentos: [],
      fichasDeSaude: [PELO_LINK],
    })!
    expect(p.anamneseGeral, 'a ficha não aparece de novo como "anamnese geral"').toBeUndefined()
    expect(p.fichasDeSaude).toEqual([PELO_LINK])
  })

  it('a do prontuário que não veio por pedido entra nas fichas de saúde, uma vez', () => {
    const p = prontuarioLegivel({
      anamneseGeral: { versao: 2, ficha: FICHA, respostas: { allergies: 'Látex' }, respondidoEm: '2026-11-26T14:00:00.000Z', origem: 'EQUIPE' },
      atendimentos: [],
      fichasDeSaude: [PELO_LINK],
    })!
    expect(p.anamneseGeral).toBeUndefined()
    expect((p.fichasDeSaude as { respostas: unknown }[]).map(f => f.respostas)).toEqual([
      [{ pergunta: 'Alergias', resposta: 'Látex' }],
      [{ pergunta: 'Alergias', resposta: 'Dipirona' }],
    ])
  })

  it('a ficha antiga (sem a versão 2) segue como estava', () => {
    const p = prontuarioLegivel({ anamneseGeral: { allergies: 'Dipirona' }, atendimentos: [], fichasDeSaude: [] })!
    expect(p.anamneseGeral).toEqual({ allergies: 'Dipirona' })
  })
})

describe('as fotos do prontuário no pacote', () => {
  const docs = [
    { appointment_id: 'a1', category: 'foto_clinica', name: 'Antes', file_name: 'antes.jpg', file_path: 'r/c/antes.jpg', created_at: '2026-11-20T13:00:00.000Z', apagado_em: null },
    { appointment_id: 'a1', category: 'foto_clinica', name: 'Some', file_name: 'x.jpg', file_path: 'r/c/x.jpg', created_at: '2026-11-20T13:00:00.000Z', apagado_em: '2026-11-21T10:00:00.000Z' },
    { appointment_id: 'a1', category: 'exame', name: 'Exame', file_name: 'e.pdf', file_path: 'r/c/e.pdf', created_at: '2026-11-20T13:00:00.000Z', apagado_em: null },
    { appointment_id: null, category: 'foto_clinica', name: null, file_name: 'ficha.jpg', file_path: 'r/c/ficha.jpg', created_at: '2026-11-19T10:00:00.000Z', apagado_em: null },
    { appointment_id: 'a1', category: 'foto_clinica', name: 'Sumiu', file_name: 's.jpg', file_path: 'r/c/sumiu.jpg', created_at: '2026-11-20T13:05:00.000Z', apagado_em: null },
  ]
  const pedidos: { bucket: string; caminhos: string[]; validade: number }[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], validade: number) => {
          pedidos.push({ bucket, caminhos, validade })
          return { data: caminhos.map(c => c.includes('sumiu')
            ? { path: c, signedUrl: '', error: 'Object not found' }
            : { path: c, signedUrl: `https://x/${c}?token=t`, error: null }), error: null }
        },
      }),
    },
  }

  it('cada foto clínica viva vai com um link assinado de 30 dias; as do atendimento nele, as outras na ficha', async () => {
    const fotos = await fotosDoProntuario(admin as never, docs, new Set(['a1']), 30 * 24 * 3600)
    expect(pedidos).toEqual([{ bucket: 'client-documents', caminhos: ['r/c/antes.jpg', 'r/c/ficha.jpg', 'r/c/sumiu.jpg'], validade: 30 * 24 * 3600 }])
    expect(fotos.porAtendimento.get('a1')).toEqual([
      { nome: 'Antes', anexadaEm: '2026-11-20T13:00:00.000Z', link: 'https://x/r/c/antes.jpg?token=t' },
      { nome: 'Sumiu', anexadaEm: '2026-11-20T13:05:00.000Z', link: null },
    ])
    expect(fotos.daFicha).toEqual([{ nome: 'ficha.jpg', anexadaEm: '2026-11-19T10:00:00.000Z', link: 'https://x/r/c/ficha.jpg?token=t' }])
  })

  it('o PDF diz cada foto, com o link, ou que o arquivo não foi encontrado', () => {
    const linhas = linhasDasFotosNoPdf([
      { nome: 'Antes', anexadaEm: '2026-11-20T13:00:00.000Z', link: 'https://x/a?token=t' },
      { nome: 'Sumiu', anexadaEm: '2026-11-20T13:05:00.000Z', link: null },
    ], () => '20/11/2026 10:00')
    expect(linhas).toEqual([
      '   Foto "Antes" (20/11/2026 10:00): https://x/a?token=t',
      '   Foto "Sumiu" (20/11/2026 10:00): o arquivo não foi encontrado',
    ])
  })

  it('o pacote monta as fotos por aí, no JSON e no PDF', () => {
    const f = readFileSync(join(WEB, 'lib/lgpd/export.ts'), 'utf8')
    expect(f).toMatch(/fotosDoProntuario\(/)
    expect(f).toMatch(/linhasDasFotosNoPdf\(/)
  })
})
