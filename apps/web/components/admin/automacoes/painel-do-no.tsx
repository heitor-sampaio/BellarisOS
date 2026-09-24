'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { EVENTOS, NODES, INTERVALO_MINIMO_MIN, rotuloDoEvento } from '@estetica-os/types'
import type {
  NoDoGrafo, GrafoDeAutomacao, TipoDeNo,
  GrupoDeCondicao, RegraDeCondicao, OperadorDeCondicao,
} from '@estetica-os/types'
import { ROTULOS } from '@/lib/automacoes/validar'
import {
  variaveisDisponiveis, eventoDoGatilhoDe,
  type GrupoDeVariaveis, type CampoVisto,
} from '@/lib/automacoes/disponiveis'
import { nomeDoPasso, chaveDoPasso } from '@/lib/automacoes/passos'
import { conferirExpressao, ehCaminhoSimples, NOMES_DE_FUNCAO } from '@/lib/automacoes/expressao'
import { amostraDoEvento } from '@/actions/automacoes'
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

interface Props {
  no:       NoDoGrafo
  /** O grafo inteiro: a lista de campos depende de ONDE o node está. */
  grafo:    GrafoDeAutomacao
  /** Etapas, cargos, pessoas e tags da rede — carregadas uma vez pelo editor. */
  opcoes:   OpcoesDoEditor | null
  onChange: (config: Record<string, unknown>) => void
  onRenomear: (nome: string) => void
  onExcluir: () => void
  onFechar:  () => void
  somenteLeitura?: boolean
}

export function PainelDoNo({
  no, grafo, opcoes, onChange, onRenomear, onExcluir, onFechar, somenteLeitura,
}: Props) {
  const c = (no.config ?? {}) as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => onChange({ ...c, ...patch })

  /**
   * O que o último fato real daquele evento trouxe.
   *
   * O catálogo declara o que o evento deveria carregar; isto mostra o que ELE
   * de fato carregou, com um exemplo ao lado. É a diferença entre oferecer uma
   * lista teórica e oferecer o dado que chega — e é o que responde "é este
   * campo mesmo?" sem abrir o banco.
   */
  const evento = eventoDoGatilhoDe(grafo, no.id)
  // Guardada COM o evento a que pertence, e usada só quando os dois batem.
  // Gatilho trocado no meio do caminho não pode deixar a amostra antiga na
  // tela: seriam campos de outro evento, oferecidos como se fossem deste.
  const [amostra, setAmostra] = useState<{ evento: string; campos: CampoVisto[] } | null>(null)

  useEffect(() => {
    if (!evento) return
    let valeu = true
    amostraDoEvento(evento)
      .then(campos => { if (valeu) setAmostra({ evento, campos }) })
      .catch(() => {})
    return () => { valeu = false }
  }, [evento])

  const vistos = amostra?.evento === evento ? amostra.campos : []

  // O painel remonta a cada node (`key` no editor), então o rascunho nasce
  // sempre com o nome do passo que está aberto.
  const [rascunhoNome, setRascunhoNome] = useState(nomeDoPasso(no, grafo))

  const variaveis = variaveisDisponiveis(grafo, no.id, { vistos })

  // O gatilho de tempo tem duas famílias de frequência: a que repete de tempos
  // em tempos ("a cada 30 minutos") e a que acontece num horário do dia. Os
  // campos de uma não fazem sentido na outra.
  const porIntervalo = c.frequencia === 'minutos' || c.frequencia === 'horas'

  return (
    <aside
      className="auto-gaveta"
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
        {/* O nome vem primeiro porque é por ele que os passos seguintes leem o
            que este deixou — é identidade, não enfeite. */}
        <Campo rotulo="Nome do passo">
          {/* Rascunho local, aplicado ao sair do campo: renomear a cada tecla
              faria o nome passar por "" no meio da digitação, e as referências
              dos outros passos seriam reescritas para um nome pela metade. */}
          <input
            className="field" value={rascunhoNome}
            disabled={somenteLeitura}
            onChange={e => setRascunhoNome(e.target.value)}
            onBlur={() => { if (rascunhoNome !== nomeDoPasso(no, grafo)) onRenomear(rascunhoNome) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder={ROTULOS[no.tipo as TipoDeNo]}
          />
          <Dica>
            Os passos seguintes leem o que este produziu por{' '}
            <code>{`{{passos.${chaveDoPasso(no, grafo)}.…}}`}</code>.
            Renomear troca as referências junto.
          </Dica>
        </Campo>

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
                  {nomes.map(n => <option key={n} value={n}>{rotuloDoEvento(n)}</option>)}
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
            variaveis={variaveis}
            onChange={g => set({ grupo: g })}
            somenteLeitura={somenteLeitura}
          />
        )}

        {no.tipo === NODES.CONDICAO_ESCOLHA && (
          <>
            <Campo rotulo="Comparar o campo">
              <SelectDeCampo
                valor={(c.campo as string) ?? ''}
                grupos={variaveis}
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
              <TextoComVariaveis
                valor={(c.corpo as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ corpo: v })}
                somenteLeitura={somenteLeitura}
                placeholder="Telefone {{cliente.telefone}}"
              />
              <Dica>
                A lista acima insere a variável no lugar do cursor. Ela traz o
                que este ponto do fluxo tem: o que chegou no gatilho, o cliente
                e o que os passos anteriores deixaram.
              </Dica>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ACAO_ANOTAR && (
          <Campo rotulo="Texto da anotação">
            <TextoComVariaveis
              valor={(c.texto as string) ?? ''}
              grupos={variaveis}
              onChange={v => set({ texto: v })}
              somenteLeitura={somenteLeitura}
              placeholder="Cliente voltou pelo anúncio de {{evento.dados.campanhaNome}}"
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
              <TextoComVariaveis
                valor={(c.texto as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ texto: v })}
                linhas={4}
                somenteLeitura={somenteLeitura}
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
          <MoverDeEtapa
            config={c} opcoes={opcoes} set={set} somenteLeitura={somenteLeitura}
          />
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

        {no.tipo === NODES.GATILHO_AGENDA && (
          <>
            <Campo rotulo="Com que frequência">
              <select
                className="field" value={(c.frequencia as string) ?? 'diaria'}
                disabled={somenteLeitura}
                onChange={e => {
                  const f = e.target.value
                  const porIntervalo = f === 'minutos' || f === 'horas'
                  // Cada família tem o seu campo, e o da outra é apagado: um
                  // `hora: '09:00'` esquecido numa automação "a cada 30
                  // minutos" ficaria no JSON parecendo que ela respeita um
                  // horário que ninguém lê.
                  set({
                    frequencia: f,
                    hora:      porIntervalo ? undefined : (c.hora as string) ?? '09:00',
                    intervalo: porIntervalo
                      ? Number(c.intervalo ?? 0) || (f === 'minutos' ? 30 : 1)
                      : undefined,
                  })
                }}
              >
                <option value="minutos">A cada X minutos</option>
                <option value="horas">A cada X horas</option>
                <option value="diaria">Todo dia</option>
                <option value="semanal">Toda semana</option>
                <option value="mensal">Todo mês</option>
              </select>
            </Campo>

            {porIntervalo && (
              <Campo rotulo={c.frequencia === 'horas' ? 'A cada (horas)' : 'A cada (minutos)'}>
                <input
                  type="number"
                  min={c.frequencia === 'horas' ? 1 : INTERVALO_MINIMO_MIN}
                  step={c.frequencia === 'horas' ? 1 : INTERVALO_MINIMO_MIN}
                  className="field"
                  value={String(c.intervalo ?? '')}
                  disabled={somenteLeitura}
                  onChange={e => set({ intervalo: e.target.value ? Number(e.target.value) : undefined })}
                />
                <Dica>
                  A conta é a partir do último disparo, não do relógio: ligar às
                  9:07 com &quot;a cada 30 minutos&quot; dá 9:37, 10:07…{' '}
                  {c.frequencia === 'minutos' && (
                    <>O mínimo é {INTERVALO_MINIMO_MIN} minutos, que é de quanto
                    em quanto o relógio do sistema passa.</>
                  )}
                </Dica>
              </Campo>
            )}

            {c.frequencia === 'semanal' && (
              <Campo rotulo="No dia">
                <select
                  className="field" value={String(c.diaDaSemana ?? 1)}
                  disabled={somenteLeitura}
                  onChange={e => set({ diaDaSemana: Number(e.target.value) })}
                >
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
                    .map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </Campo>
            )}

            {c.frequencia === 'mensal' && (
              <Campo rotulo="No dia do mês">
                <input
                  type="number" min={1} max={28} className="field"
                  value={String(c.diaDoMes ?? 1)}
                  disabled={somenteLeitura}
                  onChange={e => set({ diaDoMes: Number(e.target.value) })}
                />
                <Dica>Até o dia 28: 29, 30 e 31 não existem em todo mês.</Dica>
              </Campo>
            )}

            {!porIntervalo && (
              <Campo rotulo="Às">
                <input
                  type="time" className="field" value={(c.hora as string) ?? '09:00'}
                  disabled={somenteLeitura}
                  onChange={e => set({ hora: e.target.value })}
                />
                <Dica>
                  O relógio roda de cinco em cinco minutos, então o disparo
                  acontece na primeira passagem depois do horário.
                </Dica>
              </Campo>
            )}
          </>
        )}

        {no.tipo === NODES.BUSCAR_CLIENTES && (
          <>
            <Campo rotulo="Sem retorno há (dias)">
              <input
                type="number" min={1} className="field"
                value={String(c.semRetornoHaDias ?? '')}
                disabled={somenteLeitura}
                onChange={e => set({ semRetornoHaDias: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="deixe vazio para não filtrar"
              />
            </Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={!!c.aniversarioHoje}
                disabled={somenteLeitura}
                onChange={e => set({ aniversarioHoje: e.target.checked })}
                style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
                Só quem faz aniversário hoje
              </span>
            </label>
            <Campo rotulo="Unidade">
              <select
                className="field" value={(c.unidadeId as string) ?? ''}
                disabled={somenteLeitura}
                onChange={e => set({ unidadeId: e.target.value || null })}
              >
                <option value="">Todas</option>
                {(opcoes?.unidades ?? []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="No máximo">
              <input
                type="number" min={1} max={500} className="field"
                value={String(c.limite ?? 200)}
                disabled={somenteLeitura}
                onChange={e => set({ limite: Number(e.target.value) })}
              />
              <Dica>
                Cada cliente encontrado vira uma execução própria. O teto é a
                diferença entre a campanha que você quis e um disparo em massa
                que ninguém revisou.
              </Dica>
            </Campo>
          </>
        )}

        {no.tipo === NODES.ESPERA_DURACAO && (
          <Campo rotulo="Esperar">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min={1} className="field" style={{ width: 90 }}
                value={String(c.quantidade ?? 1)}
                disabled={somenteLeitura}
                onChange={e => set({ quantidade: Number(e.target.value) })}
              />
              <select
                className="field" value={(c.unidade as string) ?? 'dias'}
                disabled={somenteLeitura}
                onChange={e => set({ unidade: e.target.value })}
              >
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
            <Dica>
              A espera não segura nada rodando: o fluxo fica guardado e volta
              sozinho, mesmo que o sistema reinicie no meio.
            </Dica>
          </Campo>
        )}

        {no.tipo === NODES.ESPERA_ATE && (
          <>
            <Campo rotulo="Esperar até a data em">
              {/* Contextual como o resto: a data que interessa muitas vezes é a
                  que veio no próprio gatilho (`evento.dados.agendadoPara`), e
                  antes a lista tinha duas opções fixas que não a incluíam. */}
              <SelectDeCampo
                valor={(c.campo as string) ?? ''}
                grupos={variaveis}
                onChange={v => set({ campo: v })}
                somenteLeitura={somenteLeitura}
              />
            </Campo>
            <Campo rotulo="Com deslocamento">
              <select
                className="field" value={String(c.minutos ?? -1440)}
                disabled={somenteLeitura}
                onChange={e => set({ minutos: Number(e.target.value) })}
              >
                <option value="-2880">2 dias antes</option>
                <option value="-1440">1 dia antes</option>
                <option value="-180">3 horas antes</option>
                <option value="-60">1 hora antes</option>
                <option value="0">No momento exato</option>
                <option value="60">1 hora depois</option>
                <option value="1440">1 dia depois</option>
                <option value="4320">3 dias depois</option>
              </select>
              <Dica>
                Se o momento já tiver passado quando o fluxo chegar aqui, ele
                segue na hora em vez de esperar um instante que não existe mais.
              </Dica>
            </Campo>
          </>
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
        // `auto-rodape` afasta do botão flutuante do app, que no celular fica
        // no canto de baixo à esquerda — bem em cima deste botão.
        <div className="auto-rodape" style={{ padding: 16, borderTop: '1px solid var(--hairline)' }}>
          <button
            type="button" onClick={onExcluir} className="btn-ghost"
            style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)' }}
          >
            <Trash2 size={14} /> Remover do fluxo
          </button>
        </div>
      )}
    </aside>
  )
}

/** Os que estão no catálogo e no quadro, mas ainda sem executor. */
// Todos os tipos do catálogo têm editor e executor. A lista fica aqui,
// vazia, porque é ela que o painel consulta — e um tipo novo sem editor
// precisa aparecer explicitamente, não sumir num `else` silencioso.
const NODES_SEM_EDITOR: TipoDeNo[] = []

// ─── Peças ──────────────────────────────────────────────────────────────────

/**
 * Rótulo + controle.
 *
 * `<label>` de verdade, e não um `<p>` por cima: clicar no rótulo passa a focar
 * o campo, e cada controle deste painel passa a ter nome — que é o que permite
 * procurá-lo por "Título" em vez de "o terceiro input", tanto para quem usa
 * leitor de tela quanto para o teste.
 */
/**
 * A escolha da etapa de destino.
 *
 * Com mais de um funil na rede, uma lista única de "Funil · Etapa" cresce pelo
 * produto das duas coisas e obriga a ler o prefixo de cada linha para achar o
 * funil certo. Então o funil vira o primeiro passo da escolha e a lista de
 * etapas passa a ser a dele. Com um funil só o seletor não aparece: seria uma
 * escolha de uma opção.
 *
 * **O funil não é gravado como destino** — quem manda é o `etapaId`, e a etapa
 * já pertence a um funil. Ele é só o caminho até ela, e por isso nasce
 * derivado da etapa que já estava escolhida, sem campo novo no grafo.
 */
function MoverDeEtapa({ config, opcoes, set, somenteLeitura }: {
  config:  Record<string, unknown>
  opcoes:  OpcoesDoEditor | null
  set:     (patch: Record<string, unknown>) => void
  somenteLeitura?: boolean
}) {
  const etapas    = opcoes?.etapas ?? []
  const escolhida = etapas.find(e => e.id === ((config.etapaId as string) ?? ''))

  // Só o funil TROCADO À MÃO vira estado; o resto se deriva da etapa gravada.
  // Um `useState` inicializado de uma vez nasceria vazio, porque as opções
  // chegam depois do primeiro render e a etapa ainda não teria funil conhecido.
  const [funilTrocado, setFunilTrocado] = useState<string | null>(null)

  // Funil arquivado some da lista, menos quando é o destino que já está
  // gravado: aí esconder o funil apagaria da tela para onde a automação move.
  const funis  = (opcoes?.funis ?? []).filter(f => !f.arquivado || f.id === escolhida?.funilId)
  const varios = funis.length > 1
  const funilId = funilTrocado ?? escolhida?.funilId ?? ''

  // Com um funil só (ou nenhum, em rede cujas etapas nasceram antes dos funis)
  // a lista não é filtrada: todas as etapas são dele.
  const daEtapa = varios ? etapas.filter(e => e.funilId === funilId) : etapas

  const escolher = (id: string) => {
    const op = etapas.find(x => x.id === id)
    // Os nomes vão junto só para o card do quadro dizer "para Fechamento" sem
    // consultar nada. Quem manda é o id. O nome do funil só entra quando há
    // mais de um — senão o card repetiria em toda automação a mesma palavra.
    set({
      etapaId:   id,
      etapaNome: op?.nome ?? null,
      funilNome: varios ? op?.funil ?? null : null,
    })
  }

  return (
    <>
      {varios && (
        <Campo rotulo="Funil">
          <select
            className="field" value={funilId}
            disabled={somenteLeitura}
            onChange={e => {
              setFunilTrocado(e.target.value)
              // Trocar de funil zera a etapa: a que estava escolhida é de
              // outro funil, e deixá-la gravada faria o seletor mostrar vazio
              // enquanto a automação continuava movendo para o lugar antigo.
              escolher('')
            }}
          >
            <option value="">Escolha o funil…</option>
            {funis.map(f => (
              <option key={f.id} value={f.id}>
                {f.nome}{f.arquivado ? ' (arquivado)' : ''}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Mover para">
        <select
          className="field" value={(config.etapaId as string) ?? ''}
          disabled={somenteLeitura || (varios && !funilId)}
          onChange={e => escolher(e.target.value)}
        >
          <option value="">
            {varios && !funilId ? 'Escolha o funil primeiro…' : 'Escolha a etapa…'}
          </option>
          {daEtapa.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </Campo>
    </>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block',
        fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)',
        marginBottom: 5,
      }}>
        {rotulo}
      </span>
      {children}
    </label>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

/** Valor do item que abre o campo escrito à mão. */
const OUTRO = '__outro__'

/**
 * A escolha do campo a comparar.
 *
 * A lista é montada a partir de onde o node está no grafo: o payload do evento
 * que dispara, as entidades e o que cada passo anterior deixou. O exemplo ao
 * lado vem do último fato real — é ele que dá a certeza de estar pegando o
 * campo certo antes de a automação rodar.
 *
 * **"Outro campo…"** existe porque nenhuma lista cobre tudo: `dados` aceita
 * campo que ninguém declarou, e sem esta saída a automação ficaria bloqueada
 * esperando alguém mexer no código. Continua sendo um CAMINHO, não expressão —
 * quem monta isto é a recepção da clínica.
 */
function SelectDeCampo({
  valor, grupos, onChange, somenteLeitura,
}: {
  valor:   string
  grupos:  GrupoDeVariaveis[]
  onChange: (v: string) => void
  somenteLeitura?: boolean
}) {
  const naLista = grupos.some(g => g.itens.some(i => i.caminho === valor))
  // Campo escrito à mão (ou herdado de um grafo antigo) abre já no modo livre:
  // cair na lista mostraria "Escolha o campo…" com um valor salvo por baixo.
  const [livre, setLivre] = useState(!!valor && !naLista)

  if (livre) {
    // Conferida enquanto se digita: no motor, expressão quebrada devolve vazio
    // em silêncio — o erro tem de aparecer aqui, onde dá para consertar.
    const erro = valor.trim() && !ehCaminhoSimples(valor) ? conferirExpressao(valor) : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input
          className="field" value={valor} disabled={somenteLeitura}
          onChange={e => onChange(e.target.value)}
          placeholder="evento.dados.algumCampo"
          // O mesmo vermelho da lista de problemas do editor: um terceiro tom
          // de erro na mesma tela seria ruído.
          style={erro ? { borderColor: 'var(--danger)' } : undefined}
        />
        {erro && (
          <p style={{ fontSize: 'var(--text-overline)', color: 'var(--danger)', lineHeight: 1.5 }}>{erro}</p>
        )}
        <Dica>
          Um caminho (<code>evento.dados.texto</code>) ou uma expressão:{' '}
          <code>{"contem(evento.dados.texto, 'preço')"}</code>,{' '}
          <code>{"cliente.email ?? 'sem e-mail'"}</code>.{' '}
          Funções: {NOMES_DE_FUNCAO.join(', ')}.
        </Dica>
        {!somenteLeitura && (
          <button
            type="button" className="btn-ghost"
            style={{ alignSelf: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}
            onClick={() => { setLivre(false); onChange('') }}
          >
            Voltar para a lista
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      className="field" value={valor} disabled={somenteLeitura}
      onChange={e => {
        if (e.target.value === OUTRO) { setLivre(true); return }
        onChange(e.target.value)
      }}
    >
      <option value="">Escolha o campo…</option>
      {grupos.map(g => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.itens.map(i => (
            <option key={i.caminho} value={i.caminho}>
              {i.exemplo ? `${i.rotulo} — ${i.exemplo}` : i.rotulo}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={OUTRO}>Outro campo ou expressão…</option>
    </select>
  )
}

/**
 * Um texto que aceita variáveis, com a lista ao lado.
 *
 * Sem isto, usar uma variável exigia decorar o caminho e digitar as chaves
 * duplas na mão — e um `{{cliete.nome}}` com erro de digitação vira string
 * vazia na mensagem do cliente, sem nada avisar. Aqui a variável é escolhida e
 * escrita na posição do cursor.
 */
function TextoComVariaveis({
  valor, grupos, onChange, linhas, placeholder, somenteLeitura,
}: {
  valor:  string
  grupos: GrupoDeVariaveis[]
  onChange: (v: string) => void
  linhas?: number
  placeholder?: string
  somenteLeitura?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  function inserir(caminho: string) {
    if (!caminho) return
    const trecho = `{{${caminho}}}`
    const campo = ref.current
    // Sem o campo montado (ou sem cursor), vai para o fim: melhor um texto
    // para ajeitar do que um clique que não faz nada.
    const corte = campo?.selectionStart ?? valor.length
    const fim   = campo?.selectionEnd   ?? valor.length
    const novo  = `${valor.slice(0, corte)}${trecho}${valor.slice(fim)}`
    onChange(novo)
    requestAnimationFrame(() => {
      if (!campo) return
      campo.focus()
      const posicao = corte + trecho.length
      campo.setSelectionRange(posicao, posicao)
    })
  }

  return (
    <>
      <textarea
        ref={ref}
        className="field" rows={linhas ?? 3} value={valor}
        disabled={somenteLeitura}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {!somenteLeitura && (
        <select
          className="field"
          style={{ marginTop: 6, fontSize: 'var(--text-2xs)' }}
          value=""
          onChange={e => { inserir(e.target.value); e.target.value = '' }}
        >
          <option value="">Inserir variável…</option>
          {grupos.map(g => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.itens.map(i => (
                <option key={i.caminho} value={i.caminho}>
                  {i.exemplo ? `${i.rotulo} — ${i.exemplo}` : i.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </>
  )
}

function EditorDeGrupo({
  grupo, variaveis, onChange, somenteLeitura,
}: {
  grupo: GrupoDeCondicao
  variaveis: GrupoDeVariaveis[]
  onChange: (g: GrupoDeCondicao) => void
  somenteLeitura?: boolean
}) {
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
              valor={r.campo} grupos={variaveis} somenteLeitura={somenteLeitura}
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
                style={{ alignSelf: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}
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
          // Nasce com o primeiro campo do gatilho, não com `cliente.nome`
          // fixo: num fluxo de estoque não existe cliente nenhum, e a regra
          // apareceria perguntando por um campo que nunca terá valor.
          onClick={() => onChange({
            ...grupo,
            regras: [...regras, {
              campo: variaveis[0]?.itens[0]?.caminho ?? '',
              operador: 'preenchido',
            }],
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
