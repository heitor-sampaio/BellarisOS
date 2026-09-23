'use client'

import { Trash2, X } from 'lucide-react'
import { EVENTOS, NODES } from '@estetica-os/types'
import type {
  NoDoGrafo, TipoDeNo, GrupoDeCondicao, RegraDeCondicao, OperadorDeCondicao,
} from '@estetica-os/types'
import { ROTULOS } from '@/lib/automacoes/validar'
import type { OpcoesDoEditor } from '@/actions/automacoes'

/**
 * O painel de configuração do node selecionado.
 *
 * Cada tipo pede coisas diferentes, e o formulário é montado a partir do tipo —
 * um formulário genérico com "chave/valor" transferiria para a recepção da
 * clínica a tarefa de saber o nome interno dos campos.
 */

const OPERADORES: { valor: OperadorDeCondicao; rotulo: string; semValor?: boolean }[] = [
  { valor: 'igual',      rotulo: 'é igual a' },
  { valor: 'diferente',  rotulo: 'é diferente de' },
  { valor: 'contem',     rotulo: 'contém' },
  { valor: 'nao_contem', rotulo: 'não contém' },
  { valor: 'maior',      rotulo: 'é maior que' },
  { valor: 'menor',      rotulo: 'é menor que' },
  { valor: 'preenchido', rotulo: 'está preenchido', semValor: true },
  { valor: 'vazio',      rotulo: 'está vazio',      semValor: true },
]

/**
 * Os caminhos que a pessoa pode escolher, em português.
 *
 * Lista curada, não "todos os campos do banco": quem monta o fluxo escolhe de
 * uma lista de perguntas que fazem sentido no dia a dia da clínica, e não de um
 * dicionário de colunas.
 */
const CAMPOS: { grupo: string; itens: { caminho: string; rotulo: string }[] }[] = [
  { grupo: 'Cliente', itens: [
    { caminho: 'cliente.nome',      rotulo: 'Nome' },
    { caminho: 'cliente.telefone',  rotulo: 'Telefone' },
    { caminho: 'cliente.email',     rotulo: 'E-mail' },
    { caminho: 'cliente.tags',      rotulo: 'Tags' },
    { caminho: 'cliente.genero',    rotulo: 'Gênero' },
    { caminho: 'cliente.aniversarioHoje', rotulo: 'Faz aniversário hoje' },
    { caminho: 'cliente.ativo',     rotulo: 'Está ativo' },
  ] },
  { grupo: 'Agendamento', itens: [
    { caminho: 'agendamento.status',       rotulo: 'Situação' },
    { caminho: 'agendamento.valor',        rotulo: 'Valor' },
    { caminho: 'agendamento.procedimento', rotulo: 'Procedimento' },
    { caminho: 'agendamento.profissional', rotulo: 'Profissional' },
    { caminho: 'agendamento.data',         rotulo: 'Data e hora' },
  ] },
  { grupo: 'Oportunidade', itens: [
    { caminho: 'lead.etapa',    rotulo: 'Etapa do funil' },
    { caminho: 'lead.origem',   rotulo: 'Origem' },
    { caminho: 'lead.valor',    rotulo: 'Valor' },
    { caminho: 'lead.tags',     rotulo: 'Tags' },
  ] },
  { grupo: 'Conversa', itens: [
    { caminho: 'conversa.canal',  rotulo: 'Canal' },
    { caminho: 'conversa.status', rotulo: 'Situação' },
  ] },
  { grupo: 'O fato', itens: [
    { caminho: 'evento.nome',     rotulo: 'Nome do evento' },
    { caminho: 'evento.origem',   rotulo: 'Origem (app, webhook…)' },
    { caminho: 'evento.atorTipo', rotulo: 'Quem fez (usuário, sistema…)' },
  ] },
]

interface Props {
  no:       NoDoGrafo
  /** Etapas, cargos, pessoas e tags da rede — carregadas uma vez pelo editor. */
  opcoes:   OpcoesDoEditor | null
  onChange: (config: Record<string, unknown>) => void
  onExcluir: () => void
  onFechar:  () => void
  somenteLeitura?: boolean
}

export function PainelDoNo({ no, opcoes, onChange, onExcluir, onFechar, somenteLeitura }: Props) {
  const c = (no.config ?? {}) as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => onChange({ ...c, ...patch })

  return (
    <aside
      aria-label="Configuração do node"
      style={{
        width: 320, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{ fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)' }}>
          {ROTULOS[no.tipo as TipoDeNo]}
        </span>
        <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {no.tipo === NODES.GATILHO_EVENTO && (
          <Campo rotulo="Quando acontecer">
            <select
              className="field" value={(c.evento as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => set({ evento: e.target.value })}
            >
              <option value="">Escolha o evento…</option>
              {agruparEventos().map(([entidade, nomes]) => (
                <optgroup key={entidade} label={entidade}>
                  {nomes.map(n => <option key={n} value={n}>{n}</option>)}
                </optgroup>
              ))}
            </select>
            <Dica>
              Mudar o evento troca o gatilho da automação inteira — o que vier
              depois passa a receber outro contexto.
            </Dica>
          </Campo>
        )}

        {no.tipo === NODES.CONDICAO_SE && (
          <EditorDeGrupo
            grupo={(c.grupo as GrupoDeCondicao) ?? { juncao: 'e', regras: [] }}
            onChange={g => set({ grupo: g })}
            somenteLeitura={somenteLeitura}
          />
        )}

        {no.tipo === NODES.CONDICAO_ESCOLHA && (
          <>
            <Campo rotulo="Comparar o campo">
              <SelectDeCampo
                valor={(c.campo as string) ?? ''}
                onChange={v => set({ campo: v })}
                somenteLeitura={somenteLeitura}
              />
            </Campo>
            <EditorDeCasos
              casos={(c.casos as { chave: string; valor: string }[]) ?? []}
              onChange={casos => set({ casos })}
              somenteLeitura={somenteLeitura}
            />
          </>
        )}

        {no.tipo === NODES.ACAO_NOTIFICAR_EQUIPE && (
          <>
            <Campo rotulo="Avisar">
              <select
                className="field" value={(c.alvo as string) ?? 'unidade'}
                disabled={somenteLeitura}
                onChange={e => set({ alvo: e.target.value, alvoId: null })}
              >
                <option value="unidade">A unidade do fato</option>
                <option value="cargo">Um cargo</option>
                <option value="usuario">Uma pessoa</option>
              </select>
              {c.alvo === 'cargo' && (
                <select
                  className="field" style={{ marginTop: 6 }} value={(c.alvoId as string) ?? ''}
                  disabled={somenteLeitura}
                  onChange={e => set({ alvoId: e.target.value || null })}
                >
                  <option value="">Escolha o cargo…</option>
                  {(opcoes?.cargos ?? []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              )}
              {c.alvo === 'usuario' && (
                <select
                  className="field" style={{ marginTop: 6 }} value={(c.alvoId as string) ?? ''}
                  disabled={somenteLeitura}
                  onChange={e => set({ alvoId: e.target.value || null })}
                >
                  <option value="">Escolha a pessoa…</option>
                  {(opcoes?.pessoas ?? []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              )}
            </Campo>
            <Campo rotulo="Título">
              <input
                className="field" value={(c.titulo as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ titulo: e.target.value })}
                placeholder="Cliente novo: {{cliente.nome}}"
              />
            </Campo>
            <Campo rotulo="Mensagem">
              <textarea
                className="field" rows={3} value={(c.corpo as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ corpo: e.target.value })}
                placeholder="Telefone {{cliente.telefone}}"
              />
              <Dica>
                Use <code>{'{{cliente.nome}}'}</code>, <code>{'{{agendamento.data}}'}</code> e
                outros campos entre chaves duplas — eles viram o valor de verdade
                no disparo.
              </Dica>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ACAO_ANOTAR && (
          <Campo rotulo="Texto da anotação">
            <textarea
              className="field" rows={3} value={(c.texto as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => set({ texto: e.target.value })}
              placeholder="Cliente voltou pelo anúncio de {{evento.dados.campanha}}"
            />
            <Dica>A anotação entra na linha do tempo da oportunidade, com o nome da automação.</Dica>
          </Campo>
        )}

        {no.tipo === NODES.ACAO_MENSAGEM && (
          <>
            <Campo rotulo="Canal">
              <select
                className="field" value={(c.canal as string) ?? 'whatsapp'}
                disabled={somenteLeitura}
                onChange={e => set({ canal: e.target.value })}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
              </select>
            </Campo>
            <Campo rotulo="Mensagem">
              <textarea
                className="field" rows={4} value={(c.texto as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ texto: e.target.value })}
                placeholder="Oi {{cliente.nome}}, tudo bem?"
              />
              <Dica>
                A mensagem vai para a conversa aberta do cliente neste canal.
                Fora das <strong>24 horas</strong> da última mensagem dele, a
                Meta só aceita template aprovado — e esta versão ainda não
                envia template, então o passo falha dizendo isso em vez de dar
                um &quot;enviado&quot; que não chega.
              </Dica>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ACAO_MOVER_ETAPA && (
          <Campo rotulo="Mover para">
            <select
              className="field" value={(c.etapaId as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => {
                const op = opcoes?.etapas.find(x => x.id === e.target.value)
                // O nome vai junto só para o card do quadro poder dizer "para
                // Fechamento" sem consultar nada. Quem manda é o id.
                set({ etapaId: e.target.value, etapaNome: op?.nome ?? null })
              }}
            >
              <option value="">Escolha a etapa…</option>
              {(opcoes?.etapas ?? []).map(e => (
                <option key={e.id} value={e.id}>{e.funil} · {e.nome}</option>
              ))}
            </select>
          </Campo>
        )}

        {no.tipo === NODES.ACAO_DESFECHO && (
          <Campo rotulo="Marcar como">
            <select
              className="field" value={(c.desfecho as string) ?? 'ganho'}
              disabled={somenteLeitura}
              onChange={e => set({ desfecho: e.target.value })}
            >
              <option value="ganho">Ganho</option>
              <option value="perdido">Perdido</option>
            </select>
            <Dica>
              Move a oportunidade para a etapa de desfecho do funil em que ela
              está — é assim que o sistema representa ganho e perdido.
            </Dica>
          </Campo>
        )}

        {no.tipo === NODES.ACAO_TAG_CLIENTE && (
          <>
            <Campo rotulo="O que fazer">
              <select
                className="field" value={(c.modo as string) ?? 'adicionar'}
                disabled={somenteLeitura}
                onChange={e => set({ modo: e.target.value })}
              >
                <option value="adicionar">Adicionar a tag</option>
                <option value="remover">Remover a tag</option>
              </select>
            </Campo>
            <Campo rotulo="Tag">
              <select
                className="field" value={(c.tag as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ tag: e.target.value })}
              >
                <option value="">Escolha a tag…</option>
                {(opcoes?.tags ?? []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ACAO_ATRIBUIR && (
          <Campo rotulo="Responsável">
            <select
              className="field" value={(c.usuarioId as string) ?? ''}
              disabled={somenteLeitura}
              onChange={e => {
                const op = opcoes?.pessoas.find(x => x.id === e.target.value)
                set({ usuarioId: e.target.value || null, usuarioNome: op?.nome ?? null })
              }}
            >
              <option value="">Tirar o responsável</option>
              {(opcoes?.pessoas ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}

        {NODES_SEM_EDITOR.includes(no.tipo as TipoDeNo) && (
          <div className="card-sm" style={{ background: 'var(--bg-app)' }}>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Este node já existe no fluxo, mas ainda não roda — ele chega numa
              próxima entrega. Enquanto isso, uma automação que passe por ele
              para com o motivo registrado, em vez de seguir fingindo que a ação
              aconteceu.
            </p>
          </div>
        )}
      </div>

      {!somenteLeitura && (
        <div style={{ padding: 16, borderTop: '1px solid var(--hairline)' }}>
          <button
            type="button" onClick={onExcluir} className="btn-ghost"
            style={{ color: '#b42318', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
          >
            <Trash2 size={14} /> Remover do fluxo
          </button>
        </div>
      )}
    </aside>
  )
}

/** Os que estão no catálogo e no quadro, mas ainda sem executor. */
const NODES_SEM_EDITOR: TipoDeNo[] = [
  NODES.GATILHO_AGENDA, NODES.BUSCAR_CLIENTES,
  NODES.ESPERA_DURACAO, NODES.ESPERA_ATE, NODES.ACAO_LEMBRETE,
]

// ─── Peças ──────────────────────────────────────────────────────────────────

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        fontSize: 11, fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)',
        marginBottom: 5,
      }}>
        {rotulo}
      </p>
      {children}
    </div>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

function SelectDeCampo({
  valor, onChange, somenteLeitura,
}: { valor: string; onChange: (v: string) => void; somenteLeitura?: boolean }) {
  return (
    <select className="field" value={valor} disabled={somenteLeitura} onChange={e => onChange(e.target.value)}>
      <option value="">Escolha o campo…</option>
      {CAMPOS.map(g => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.itens.map(i => <option key={i.caminho} value={i.caminho}>{i.rotulo}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function EditorDeGrupo({
  grupo, onChange, somenteLeitura,
}: { grupo: GrupoDeCondicao; onChange: (g: GrupoDeCondicao) => void; somenteLeitura?: boolean }) {
  const regras = grupo.regras ?? []

  const mudarRegra = (i: number, patch: Partial<RegraDeCondicao>) => {
    onChange({ ...grupo, regras: regras.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Campo rotulo="Quando">
        <select
          className="field" value={grupo.juncao} disabled={somenteLeitura}
          onChange={e => onChange({ ...grupo, juncao: e.target.value as 'e' | 'ou' })}
        >
          <option value="e">Todas as regras abaixo</option>
          <option value="ou">Qualquer uma das regras</option>
        </select>
      </Campo>

      {regras.map((r, i) => {
        const op = OPERADORES.find(o => o.valor === r.operador)
        return (
          <div key={i} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <SelectDeCampo
              valor={r.campo} somenteLeitura={somenteLeitura}
              onChange={v => mudarRegra(i, { campo: v })}
            />
            <select
              className="field" value={r.operador} disabled={somenteLeitura}
              onChange={e => mudarRegra(i, { operador: e.target.value as OperadorDeCondicao })}
            >
              {OPERADORES.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
            {!op?.semValor && (
              <input
                className="field" value={String(r.valor ?? '')} disabled={somenteLeitura}
                onChange={e => mudarRegra(i, { valor: e.target.value })}
                placeholder="valor"
              />
            )}
            {!somenteLeitura && (
              <button
                type="button" className="btn-ghost"
                style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-muted)' }}
                onClick={() => onChange({ ...grupo, regras: regras.filter((_, j) => j !== i) })}
              >
                Remover regra
              </button>
            )}
          </div>
        )
      })}

      {!somenteLeitura && (
        <button
          type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
          onClick={() => onChange({
            ...grupo,
            regras: [...regras, { campo: 'cliente.nome', operador: 'preenchido' }],
          })}
        >
          + Adicionar regra
        </button>
      )}

      {regras.length === 0 && (
        <Dica>Sem nenhuma regra, a condição deixa tudo passar pelo caminho &quot;sim&quot;.</Dica>
      )}
    </div>
  )
}

function EditorDeCasos({
  casos, onChange, somenteLeitura,
}: {
  casos: { chave: string; valor: string }[]
  onChange: (c: { chave: string; valor: string }[]) => void
  somenteLeitura?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Campo rotulo="Caminhos">
        <Dica>
          Cada caso vira uma saída no quadro. O que não bater com nenhum sai
          pelo <strong>padrao</strong>.
        </Dica>
      </Campo>

      {casos.map((caso, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            className="field" value={caso.valor} disabled={somenteLeitura}
            placeholder="valor" style={{ flex: 1, minWidth: 0 }}
            onChange={e => onChange(casos.map((c, j) => (
              j === i
                // A chave da saída acompanha o valor: duas saídas com o mesmo
                // nome no quadro seriam indistinguíveis ao ligar.
                ? { valor: e.target.value, chave: chaveDeSaida(e.target.value, i) }
                : c
            )))}
          />
          {!somenteLeitura && (
            <button
              type="button" className="btn-ghost" aria-label="Remover caso"
              style={{ padding: 4, color: 'var(--text-muted)' }}
              onClick={() => onChange(casos.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      {!somenteLeitura && (
        <button
          type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
          onClick={() => onChange([...casos, { valor: '', chave: chaveDeSaida('', casos.length) }])}
        >
          + Adicionar caso
        </button>
      )}
    </div>
  )
}

function chaveDeSaida(valor: string, i: number): string {
  const limpo = valor.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return limpo || `caso_${i + 1}`
}

function agruparEventos(): [string, string[]][] {
  const mapa = new Map<string, string[]>()
  for (const nome of Object.values(EVENTOS)) {
    const entidade = nome.split('.')[0]!
    mapa.set(entidade, [...(mapa.get(entidade) ?? []), nome])
  }
  return [...mapa.entries()]
}
