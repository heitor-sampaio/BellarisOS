import {
  Check, Plus, Package, Gift, BarChart3, ShieldCheck, Search, FileSpreadsheet, Megaphone, Building2, ArrowRight,
  MessagesSquare, CalendarDays, CalendarPlus, Wallet, Smartphone, PenLine, Star, Bell, X, Sparkles, LifeBuoy,
} from 'lucide-react'
import { Navegador, Celular } from '@/components/molduras'
import { AvisosDoHero, DemoConversa, DemoCopilot } from '@/components/demos'
import { TELAS, type Tela } from '@/lib/telas'

/**
 * O texto do site (2026-10-17). Regra: NADA inventado — sem depoimento, sem
 * cliente, sem número de uso. Cada promessa aqui é uma funcionalidade que
 * existe no sistema (conferida no DEVLOG e no código); funcionalidade que
 * ainda depende de aprovação de terceiro (Instagram e Messenger, pela análise
 * do app na Meta) fica de fora até valer em produção.
 */

type Links = { comecar: string; entrar: string; privacidade: string }

/**
 * `data-revelar` marca o que ENTRA quando chega na tela (o valor é a direção:
 * vazio sobe, `esquerda`/`direita` vêm do lado, `zoom` cresce); `--ordem`
 * escalona os vizinhos. Quem liga é `components/movimento.tsx` — sem ele, a
 * marca não faz nada e a página fica como sempre foi.
 */
const ordem = (n: number) => ({ '--ordem': n }) as React.CSSProperties

export function Topo({ links }: { links: Links }) {
  return (
    <header className="site-topo">
      <div className="site-container site-topo-linha">
        <a href="#inicio" className="site-wordmark" aria-label="BellarisOS, início">BellarisOS <span>✦</span></a>
        <nav className="site-ancoras" aria-label="Seções">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#app-da-cliente">App da cliente</a>
          <a href="#precos">Preços</a>
          <a href="#perguntas">Perguntas</a>
        </nav>
        <div className="site-acoes">
          <a className="site-entrar" href={links.entrar}>Entrar</a>
          <a className="site-botao site-botao-primario site-botao-pequeno" href={links.comecar}>Começar grátis</a>
        </div>
      </div>
    </header>
  )
}

export function Hero({ links }: { links: Links }) {
  return (
    <section id="inicio" className="site-hero">
      <div className="site-container">
        <div className="site-hero-texto">
          <span className="site-overline" data-revelar style={ordem(0)}>✦ O sistema operacional da clínica de estética</span>
          <h1 className="site-h1" data-revelar style={ordem(1)}>A clínica inteira <span className="site-h1-marca">num lugar só.</span></h1>
          <p className="site-lead" data-revelar style={{ maxWidth: 660, ...ordem(2) }}>
            Agenda, WhatsApp, prontuário, vendas, financeiro e marketing num sistema só, fácil de usar —
            no lugar de vários sistemas que não conversam entre si. E um app para a sua cliente agendar sozinha.
          </p>
          <div className="site-hero-chamadas" data-revelar style={ordem(3)}>
            <a className="site-botao site-botao-primario" href={links.comecar}>
              Começar grátis <ArrowRight size={18} className="site-botao-seta" aria-hidden="true" />
            </a>
            <a className="site-botao site-botao-secundario" href="#precos">Ver os preços</a>
          </div>
          <p className="site-hero-nota" data-revelar style={ordem(4)}>14 dias com tudo liberado. Sem cartão de crédito.</p>
        </div>
        <div className="site-hero-visual" data-revelar="zoom" style={ordem(5)}>
          {/* O palco inclina a tela e a endireita conforme a página rola. */}
          <div className="site-hero-palco">
            <Navegador tela={TELAS.agenda} prioridade tamanhos="(min-width: 1100px) 1000px, 100vw" />
            <div className="site-hero-celular">
              <Celular tela={TELAS.inboxCelular} prioridade />
            </div>
          </div>
          <AvisosDoHero />
        </div>
      </div>
    </section>
  )
}

const FAIXA = [
  'Agenda', 'WhatsApp', 'Prontuário', 'Injetáveis', 'Pacotes', 'Financeiro', 'Comissões', 'Estoque',
  'Fidelidade', 'Automações', 'Termos assinados', 'Copilot', 'App da cliente', 'Relatórios', 'Campanhas',
]

/**
 * A faixa que corre embaixo do hero. É decoração (cada item está descrito na
 * página): vai duas vezes, para a volta não ter emenda, e fica parada para
 * quem pede menos movimento.
 */
export function Faixa() {
  const itens = FAIXA.map(f => <span key={f} className="site-faixa-item">{f}<i>✦</i></span>)
  return (
    <div className="site-faixa" aria-hidden="true">
      <div className="site-faixa-trilho">
        <span className="site-faixa-grupo">{itens}</span>
        <span className="site-faixa-grupo">{itens}</span>
      </div>
    </div>
  )
}

/**
 * A troca (pedido do Heitor, 2026-10-19): o BellarisOS SUBSTITUI a pilha de
 * ferramentas que não conversam entre si. Cada linha é o que a equipe faz hoje
 * à mão, entre um sistema e outro — e a funcionalidade que existe no lugar
 * (conferida no sistema: agendar pelo inbox, caixa e DRE, comissão com regra,
 * termo pelo app, baixa de estoque com lote, automações).
 */
const TROCAS = [
  { antes: 'Combina o horário no WhatsApp e copia na agenda', depois: 'Agenda na própria conversa — e o horário já está na agenda' },
  { antes: 'Fecha o caixa numa planilha à parte', depois: 'Recebeu na recepção, entrou no caixa e no resultado do mês' },
  { antes: 'Calcula a comissão à mão no fim do mês', depois: 'A comissão se calcula sozinha, com a regra da clínica' },
  { antes: 'Guarda o termo assinado numa pasta de papel', depois: 'O termo é assinado no celular e fica na ficha da cliente' },
  { antes: 'Confere o estoque no olho', depois: 'O produto usado na sessão sai do estoque, com lote e validade' },
  { antes: 'Manda lembrete de horário um por um', depois: 'Lembrete, confirmação e retorno saem sozinhos' },
]

export function Troca() {
  return (
    <section id="troca" className="site-secao" aria-labelledby="troca-titulo">
      <div className="site-container">
        <div className="site-cabeca site-cabeca-centro" data-revelar>
          <span className="site-overline">✦ Um sistema no lugar de vários</span>
          <h2 id="troca-titulo" className="site-h2">Chega de passar a limpo de um sistema para o outro.</h2>
          <p className="site-lead">
            Agenda num aplicativo, financeiro na planilha, WhatsApp no celular de alguém, termo no papel.
            Nada conversa com nada — e a equipe passa o dia copiando de um lugar para o outro.
          </p>
        </div>
        <div className="site-troca">
          <div className="site-troca-cabeca">
            <span className="site-troca-rotulo">Hoje, em vários sistemas</span>
            <span className="site-troca-rotulo site-troca-rotulo-marca">Com o BellarisOS</span>
          </div>
          {TROCAS.map((t, i) => (
            <div key={t.antes} className="site-troca-linha" data-troca data-revelar style={ordem(i)}>
              <p className="site-troca-antes" data-antes><X size={16} aria-hidden="true" /><span>{t.antes}</span></p>
              <span className="site-troca-seta" aria-hidden="true"><ArrowRight size={18} /></span>
              <p className="site-troca-depois" data-depois><Check size={16} aria-hidden="true" /><span>{t.depois}</span></p>
            </div>
          ))}
        </div>
        <p className="site-troca-fecho" data-revelar>
          Um cadastro, uma agenda, um caixa — atualizados na hora, para a equipe inteira.
        </p>
      </div>
    </section>
  )
}

/**
 * O posicionamento (decisão do Heitor, 2026-10-18): o BellarisOS não é um
 * sistema financeiro com agenda em volta, nem cinco ferramentas ligadas — é
 * ERP e CRM no mesmo sistema, o sistema operacional da clínica. As frentes
 * em volta do núcleo, e a cliente ligada a elas pelo app dela.
 */
interface Frente { area: string; icone: typeof Wallet; titulo: string; sigla?: string; itens: string[] }
const FRENTES: Frente[] = [
  { area: 'com', icone: MessagesSquare, titulo: 'Comercial', sigla: 'CRM', itens: ['O WhatsApp da equipe num inbox só', 'Funil de oportunidades', 'De qual anúncio a cliente veio', 'Venda de pacote e pré-pago'] },
  { area: 'ate', icone: CalendarDays, titulo: 'Atendimento', itens: ['Agenda por profissional e sala', 'Prontuário e injetáveis', 'Termos assinados sem papel', 'Estoque com baixa na sessão'] },
  { area: 'fin', icone: Wallet, titulo: 'Financeiro', sigla: 'ERP', itens: ['Caixa, contas a pagar e a receber', 'O resultado do mês (DRE)', 'Comissões com regra', 'Parcelas no financeiro'] },
  { area: 'mar', icone: Megaphone, titulo: 'Marketing', itens: ['Automações sem programador', 'Campanhas por WhatsApp e no app', 'Fidelidade com pontos', 'Anúncio ligado à venda'] },
]

export function UmSistema() {
  return (
    <section id="um-sistema" className="site-secao" aria-labelledby="um-sistema-titulo">
      <div className="site-container">
        <div className="site-cabeca site-cabeca-centro" data-revelar>
          <span className="site-overline">✦ ERP + CRM</span>
          <h2 id="um-sistema-titulo" className="site-h2">Não são sistemas separados. É um sistema só.</h2>
          <p className="site-lead">
            O comercial, o atendimento, o financeiro e o marketing trabalham sobre a mesma cliente,
            a mesma agenda e o mesmo caixa. E a sua cliente tem o app dela, ligado a tudo isso.
          </p>
        </div>
        <div className="site-mapa">
          <div className="site-nucleo" data-revelar="zoom">
            <span className="site-nucleo-marca">BellarisOS <span>✦</span></span>
            <strong>O sistema operacional da clínica</strong>
            <p>Um cadastro de cliente, uma agenda, um caixa — e cada parte do sistema lendo os mesmos dados.</p>
          </div>
          {FRENTES.map(({ area, icone: Icone, titulo, sigla, itens }, i) => (
            <div key={area} className={`site-frente site-frente-${area}`} data-revelar style={ordem(i + 1)}>
              <div className="site-frente-cabeca">
                <span className="site-item-icone" aria-hidden="true"><Icone size={19} /></span>
                <h3 className="site-h3">{titulo}</h3>
                {sigla && <span className="site-frente-sigla">{sigla}</span>}
              </div>
              <ul>{itens.map(t => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
          <div className="site-frente site-frente-app" data-revelar style={ordem(5)}>
            <div className="site-frente-cabeca">
              <span className="site-item-icone" aria-hidden="true"><Smartphone size={19} /></span>
              <h3 className="site-h3">App da cliente</h3>
              <span className="site-frente-sigla">Diferencial</span>
            </div>
            <ul>{APP_NA_FRENTE.map(t => <li key={t}>{t}</li>)}</ul>
            <a href="#app-da-cliente" className="site-frente-link">Conhecer o app <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </section>
  )
}

const PASSOS = [
  { titulo: 'A conversa chega', texto: 'A mensagem do WhatsApp cai no inbox da equipe, já dizendo de qual anúncio a cliente veio.' },
  { titulo: 'Vira horário', texto: 'Na própria conversa, a recepção encontra o horário livre da profissional e agenda.' },
  { titulo: 'O atendimento', texto: 'Ficha, anamnese, fotos e prontuário na sessão — e o produto usado sai do estoque.' },
  { titulo: 'A venda', texto: 'Pacote, pré-pago ou parcelado: o financeiro e a comissão se fazem sozinhos.' },
  { titulo: 'O retorno', texto: 'Automações lembram do horário e do retorno; a fidelidade dá pontos para voltar.' },
]

export function DiaDaClinica() {
  return (
    <section className="site-secao" aria-labelledby="dia-titulo">
      <div className="site-container">
        <div className="site-cabeca" data-revelar>
          <span className="site-overline">✦ O dia da clínica</span>
          <h2 id="dia-titulo" className="site-h2">Uma cliente, do primeiro “oi” ao retorno — sem passar a limpo.</h2>
        </div>
        {/* Com movimento, a vez passa de passo em passo (o preenchido em rosé). */}
        <ol className="site-passos" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="site-passo" data-revelar style={ordem(i)}>
              <span className="site-passo-numero" aria-hidden="true">{i + 1}</span>
              <h3 className="site-h3">{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * Fácil de usar (pedido do Heitor, 2026-10-19) — sustentado pelo que o sistema
 * TEM: a busca universal (Ctrl+K), o menu recortado pelo cargo, o Copilot, o
 * app Android, o /setup com a importação de contatos e a Ajuda com chamados.
 */
const FACIL = [
  { icone: Search, titulo: 'Tudo a um atalho', texto: 'Cliente, conversa, agendamento ou tela: digite e vá, de qualquer lugar do sistema (Ctrl+K).' },
  { icone: ShieldCheck, titulo: 'Cada um vê o seu', texto: 'O menu mostra só o que o cargo da pessoa usa: a recepção não tropeça no financeiro.' },
  { icone: Sparkles, titulo: 'Peça em português', texto: 'O Copilot agenda, consulta e lança por texto ou por voz — e você confirma antes de gravar.' },
  { icone: Smartphone, titulo: 'No computador e no celular', texto: 'O mesmo sistema no navegador e no app Android, com as notificações no bolso.' },
  { icone: FileSpreadsheet, titulo: 'Comece com o que já tem', texto: 'Um passo a passo monta a clínica, e os contatos chegam de uma planilha.' },
  { icone: LifeBuoy, titulo: 'Ajuda dentro do sistema', texto: 'Abra um chamado de qualquer tela, com o print, e acompanhe a resposta ali mesmo.' },
]

export function Facil() {
  return (
    <section id="facil" className="site-secao" aria-labelledby="facil-titulo">
      <div className="site-container">
        <div className="site-cabeca" data-revelar>
          <span className="site-overline">✦ Fácil de usar</span>
          <h2 id="facil-titulo" className="site-h2">Fácil para a equipe inteira, desde o primeiro dia.</h2>
          <p className="site-lead">
            Sem instalar nada e sem manual: cada pessoa vê só o que usa, e o que ela procura está a um atalho.
          </p>
        </div>
        <div className="site-grade site-grade-3">
          {FACIL.map(({ icone: Icone, titulo, texto }, i) => (
            <div key={titulo} className="site-item" data-revelar data-luz style={ordem(i % 3)}>
              <span className="site-item-icone" aria-hidden="true"><Icone size={19} /></span>
              <h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>{titulo}</h3>
              <p>{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Um termo do sistema explicado no próprio texto (2026-10-20): sublinhado
 * pontilhado, e a explicação abre ao passar o mouse, ao focar pelo teclado ou
 * ao tocar (o botão ganha o foco). Só CSS — e o `aria-describedby` liga o
 * termo à explicação para o leitor de tela.
 */
function Termo({ id, children, dica }: { id: string; children: string; dica: string }) {
  return (
    <span className="site-termo">
      <button type="button" className="site-termo-gatilho" aria-describedby={id}>{children}</button>
      <span id={id} role="tooltip" className="site-termo-dica">{dica}</span>
    </span>
  )
}

interface Destaque {
  overline: string
  titulo: string
  texto: React.ReactNode
  itens: { forte: string; resto: string }[]
  tela: Tela
  celular?: boolean
  /** A demonstração viva que flutua sobre a tela. */
  demo?: 'conversa' | 'copilot'
}

const DESTAQUES: Destaque[] = [
  {
    overline: 'WhatsApp e atendimento', titulo: 'Todo o WhatsApp da clínica numa caixa só',
    texto: 'Várias pessoas atendendo os mesmos números, cada conversa com a ficha da cliente ao lado.',
    itens: [
      { forte: 'O WhatsApp oficial da Meta', resto: ' sem largar o aplicativo do celular — os dois funcionam juntos. Ou o WhatsApp Web, pelo QR code.' },
      { forte: 'Cada conversa vira oportunidade', resto: ' num funil de vendas, com responsável e etapa.' },
      { forte: 'Modelos aprovados pela Meta', resto: ' para lembrete, confirmação e campanha.' },
    ],
    tela: TELAS.inbox, demo: 'conversa',
  },
  {
    overline: 'Agenda e atendimento', titulo: 'A agenda que a recepção entende de primeira',
    texto: 'Por profissional e por sala, com confirmação, chegada e falta. A sessão abre a ficha certa.',
    itens: [
      { forte: 'A sessão completa', resto: ': anamnese, fichas, fotos, consumo de produtos e pagamento num lugar só.' },
      { forte: 'O histórico inteiro da cliente', resto: ' — pacotes, créditos, próximos horários — na ficha.' },
      { forte: 'Cargos sob medida', resto: ': cada pessoa vê só o que o cargo dela libera.' },
    ],
    tela: TELAS.ficha,
  },
  {
    overline: 'Prontuário', titulo: 'O planejador de injetáveis, ponto a ponto',
    texto: 'O mapa do rosto com cada ponto, o produto e a dose — e o plano de tratamento ao lado.',
    itens: [
      { forte: 'Prontuário e evolução', resto: ' guardados com o cuidado que dado de saúde pede.' },
      { forte: 'Fichas do seu jeito', resto: ': monte as perguntas de anamnese da clínica.' },
      { forte: 'Planos de tratamento', resto: ' com as sessões e o que já foi feito.' },
    ],
    tela: TELAS.injetaveis,
  },
  {
    overline: 'Vendas e financeiro', titulo: 'Vendeu, entrou no caixa. Atendeu, gerou a comissão.',
    texto: 'Pacote, procedimento pré-pago, desconto e parcelas — com cada parcela no financeiro e a comissão calculada.',
    itens: [
      { forte: 'O resultado do mês', resto: ' (DRE), contas a pagar e a receber, por unidade ou da clínica inteira.' },
      { forte: 'Comissões com regra', resto: ': por profissional, por procedimento, descontando a taxa do cartão.' },
      { forte: 'Relatórios', resto: ' de vendas, agenda, clientes e comercial, prontos para exportar.' },
    ],
    tela: TELAS.financeiro,
  },
  {
    overline: 'Termos e contratos', titulo: 'Termo assinado sem papel — e conferível por qualquer um',
    texto: 'Modelos com os dados da cliente preenchidos sozinhos. A assinatura é na clínica, pelo portal ou por um link.',
    itens: [
      { forte: 'O PDF assinado', resto: ' fica na ficha, com a verificação pública do documento.' },
      { forte: 'Prefere papel?', resto: ' Imprima, colha a assinatura e guarde o documento na ficha do mesmo jeito.' },
    ],
    tela: TELAS.documento,
  },
  {
    overline: 'Automações', titulo: 'O que a recepção faria de cabeça, o sistema faz sozinho',
    texto: <>Monte regras sem programador: quando acontecer isto, espere tanto, mande aquilo — fora do{' '}
      <Termo id="dica-silencio" dica="Das 21h às 8h (dá para mudar em cada automação), nenhuma mensagem automática sai para a cliente: o que cairia nesse horário espera e sai de manhã. Os avisos para a equipe saem na hora.">horário de silêncio</Termo>.</>,
    itens: [
      { forte: 'Lembrete e confirmação', resto: ' de horário, aniversário, retorno, reativação de quem sumiu.' },
      { forte: 'Campanhas', resto: ' para uma lista de clientes, por WhatsApp e notificação no app.' },
    ],
    tela: TELAS.automacao,
  },
  {
    overline: 'Copilot', titulo: 'Uma secretária que conhece a clínica',
    texto: 'Peça por texto ou por voz: “quais horários a Dra. Ana tem amanhã?”, “agende a Maria às 15h”. Antes de gravar qualquer coisa, ela mostra e você confirma.',
    itens: [
      { forte: 'Consulta e opera', resto: ' agenda, clientes, vendas, financeiro e estoque, com as permissões de quem pede.' },
      { forte: 'Nada clínico', resto: ' vai para a inteligência artificial: o prontuário fica no sistema.' },
    ],
    tela: TELAS.copilot, demo: 'copilot',
  },
]

/**
 * O app da cliente (2026-10-18): o diferencial, com seção própria. Só o que o
 * portal FAZ hoje — conferido tela a tela: ela não paga, não cancela nem
 * remarca por ele, e o app leva o nome da unidade, não a logo da clínica.
 */
export const APP_NA_FRENTE = ['Agenda sozinha', 'Assina os termos no celular', 'Pacotes, pontos e histórico', 'Um aviso a cada passo']

const NO_APP = [
  { icone: CalendarPlus, forte: 'Agenda sozinha', resto: 'o procedimento, a profissional e um horário livre — só o que a clínica liberar.' },
  { icone: PenLine, forte: 'Assina pelo celular', resto: 'o termo chega no app e ela assina com o dedo; o PDF vai para a ficha.' },
  { icone: Package, forte: 'Acompanha o tratamento', resto: 'pacotes com as sessões feitas, créditos e planos de tratamento.' },
  { icone: Gift, forte: 'Pontos e recompensas', resto: 'o saldo, o que vai vencer e o catálogo de recompensas da clínica.' },
  { icone: Star, forte: 'Confirma e avalia', resto: 'depois do atendimento, dá nota ao procedimento e à profissional.' },
  { icone: Bell, forte: 'Um aviso a cada passo', resto: 'horário confirmado, termo para assinar, pontos e as campanhas da clínica.' },
]

export function AppDaCliente() {
  return (
    <section id="app-da-cliente" className="site-secao" aria-labelledby="app-titulo">
      <div className="site-container">
        <div className="site-app">
          <div className="site-app-texto" data-revelar>
            <span className="site-overline">✦ App da cliente</span>
            <h2 id="app-titulo" className="site-h2">A sua cliente com a clínica no bolso.</h2>
            <p className="site-lead">
              Ela agenda, assina, acompanha o tratamento e junta pontos pelo celular — e a recepção para
              de responder no WhatsApp o que o app já mostra.
            </p>
            <ul className="site-app-lista">
              {NO_APP.map(({ icone: Icone, forte, resto }, i) => (
                <li key={forte} data-revelar style={ordem(i)}>
                  <span className="site-item-icone" aria-hidden="true"><Icone size={18} /></span>
                  <span><strong>{forte}</strong>{resto}</span>
                </li>
              ))}
            </ul>
            <p className="site-app-nota">
              A clínica cria o acesso na ficha da cliente, e ela entra com o e-mail. Os dados dela, ela pede
              pelo próprio app, como manda a LGPD.
            </p>
          </div>
          {/* Três telas do app, em leque; a do meio na frente. */}
          <div className="site-app-palco" data-revelar="zoom" style={ordem(1)}>
            <Celular tela={TELAS.portalAgendar} className="site-app-celular site-app-celular-esq" />
            <Celular tela={TELAS.portal} className="site-app-celular site-app-celular-meio" />
            <Celular tela={TELAS.portalPontos} className="site-app-celular site-app-celular-dir" />
          </div>
        </div>
      </div>
    </section>
  )
}

export function Destaques() {
  return (
    <section id="funcionalidades" className="site-secao" aria-label="Funcionalidades">
      <div className="site-container site-destaques">
        {DESTAQUES.map((d, i) => (
          <article key={d.titulo} className={`site-destaque${i % 2 ? ' site-destaque-invertido' : ''}`}>
            <div className="site-destaque-texto" data-revelar>
              <span className="site-overline">✦ {d.overline}</span>
              <h2 className="site-h2">{d.titulo}</h2>
              <p className="site-lead">{d.texto}</p>
              <ul className="site-lista">
                {d.itens.map(it => (
                  <li key={it.forte}><Check size={16} aria-hidden="true" /><span><strong>{it.forte}</strong>{it.resto}</span></li>
                ))}
              </ul>
            </div>
            {/* A tela vem do lado em que fica: do outro lado do texto. */}
            <div className={`site-destaque-visual${d.demo ? ' site-destaque-com-demo' : ''}`}
              data-revelar={i % 2 ? 'esquerda' : 'direita'} style={ordem(1)}>
              {d.celular ? <Celular tela={d.tela} className="site-destaque-celular" /> : <Navegador tela={d.tela} />}
              {d.demo === 'conversa' && <DemoConversa />}
              {d.demo === 'copilot' && <DemoCopilot />}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

const ITENS = [
  { icone: Package, titulo: 'Estoque com lotes', texto: 'Validade, mínimo por unidade e a baixa no próprio atendimento.' },
  { icone: Gift, titulo: 'Fidelidade', texto: 'Pontos, recompensas, vouchers e o bônus de aniversário.' },
  { icone: BarChart3, titulo: 'Indicadores', texto: 'Faturamento, ocupação, ticket médio e funil — os números de um lugar só.' },
  { icone: Megaphone, titulo: 'Anúncios', texto: 'Meta e Google ligados à venda: saiba qual campanha trouxe cliente que pagou.' },
  { icone: Wallet, titulo: 'Créditos e pré-pago', texto: 'Crédito da cliente e procedimento pago antes, abatidos no atendimento.' },
  { icone: Building2, titulo: 'Mais unidades', texto: 'Cresceu? Cada unidade com a operação dela, e a visão da rede inteira.' },
]
// Busca, cargos e importação moram em "Fácil de usar" (2026-10-19).

export function EAinda() {
  return (
    <section className="site-secao" aria-labelledby="ainda-titulo">
      <div className="site-container">
        <div className="site-cabeca" data-revelar>
          <span className="site-overline">✦ E ainda</span>
          <h2 id="ainda-titulo" className="site-h2">O resto do dia também mora aqui.</h2>
        </div>
        <div className="site-grade site-grade-3">
          {ITENS.map(({ icone: Icone, titulo, texto }, i) => (
            <div key={titulo} className="site-item" data-revelar data-luz style={ordem(i % 3)}>
              <span className="site-item-icone" aria-hidden="true"><Icone size={19} /></span>
              <h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>{titulo}</h3>
              <p>{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Seguranca() {
  return (
    <section className="site-secao" aria-labelledby="seguranca-titulo">
      <div className="site-container">
        <div className="site-seguranca" data-revelar>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="site-overline">✦ Segurança e LGPD</span>
            <h2 id="seguranca-titulo" className="site-h2">Dado de saúde com o cuidado que ele pede.</h2>
          </div>
          <div className="site-seguranca-itens">
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>O prontuário é de quem atende</h3><p>Só o cargo que libera o clínico vê prontuário, evolução e fotos — o resto da equipe, não.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>Cada clínica isolada</h3><p>Os dados de uma clínica nunca aparecem para outra: o isolamento está no próprio banco de dados.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>A cliente pede os dados dela</h3><p>Pelo portal, a cliente pede uma cópia de todos os dados dela, como manda a LGPD.</p></div>
            <div><h3 className="site-h3" style={{ fontSize: 'var(--site-corpo)' }}>Suporte só com a sua permissão</h3><p>A equipe do BellarisOS só entra na sua conta quando você libera — e nunca vê o clínico.</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}

const PERGUNTAS = [
  { p: 'Como funciona o teste grátis?', r: 'Você cria a conta com seu e-mail e usa o sistema inteiro por 14 dias, sem cartão de crédito. Antes de terminar, combinamos o plano; o pagamento é por Pix, boleto ou cartão.' },
  { p: 'Consigo trazer meus clientes de outro sistema?', r: 'Sim. A importação aceita uma planilha (CSV) com os contatos, e você confere tudo antes de entrar.' },
  { p: 'Preciso do WhatsApp oficial?', r: 'Não. Dá para conectar pelo WhatsApp Web, lendo o QR code, ou pelo oficial da Meta — e no oficial o aplicativo do celular continua funcionando no mesmo número. As conversas do oficial têm a tarifa da Meta, cobrada por ela direto na conta da clínica.' },
  { p: 'Quantas pessoas da equipe podem usar?', r: 'O limite de equipe, de unidades e de números de WhatsApp de cada plano está em Preços. Cada pessoa entra com o próprio acesso, e o cargo dela decide o que ela vê.' },
  { p: 'Funciona no celular?', r: 'Sim: a equipe e as clientes usam pelo navegador, no computador ou no celular. No Android também há o aplicativo, com notificações.' },
  { p: 'Minha clínica tem mais de uma unidade. Serve?', r: 'Serve. Cada unidade tem a agenda, o estoque e o caixa dela, e quem é da rede vê tudo consolidado.' },
  { p: 'Os dados são meus?', r: 'São. A clínica é a dona dos dados das clientes; o BellarisOS só os guarda e processa para o sistema funcionar, como diz a política de privacidade.' },
]

export function Perguntas() {
  return (
    <section id="perguntas" className="site-secao" aria-labelledby="perguntas-titulo">
      <div className="site-container">
        <div className="site-cabeca site-cabeca-centro" data-revelar>
          <span className="site-overline">✦ Perguntas</span>
          <h2 id="perguntas-titulo" className="site-h2">O que costumam perguntar</h2>
        </div>
        <div className="site-perguntas">
          {PERGUNTAS.map((q, i) => (
            <details key={q.p} className="site-pergunta" data-revelar style={ordem(i)}>
              <summary>{q.p}<Plus size={18} aria-hidden="true" /></summary>
              <p>{q.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Final({ links }: { links: Links }) {
  return (
    <section className="site-secao" aria-labelledby="final-titulo">
      <div className="site-container">
        <div className="site-final" data-revelar="zoom">
          <h2 id="final-titulo" className="site-h2">Teste na sua clínica, com a sua agenda.</h2>
          <p className="site-lead">14 dias com tudo liberado. Se não fizer sentido, é só não continuar.</p>
          <a className="site-botao site-botao-claro" href={links.comecar}>Começar grátis</a>
        </div>
      </div>
    </section>
  )
}

export function Rodape({ links }: { links: Links }) {
  return (
    <footer className="site-rodape">
      <div className="site-container site-rodape-linha">
        <a href="#inicio" className="site-wordmark">BellarisOS <span>✦</span></a>
        <nav aria-label="Rodapé">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#app-da-cliente">App da cliente</a>
          <a href="#precos">Preços</a>
          <a href={links.entrar}>Entrar</a>
          <a href={links.comecar}>Começar grátis</a>
          <a href={links.privacidade}>Política de Privacidade</a>
        </nav>
        <small>© {new Date().getFullYear()} BellarisOS</small>
      </div>
    </footer>
  )
}
