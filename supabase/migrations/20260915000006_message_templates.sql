-- Templates de mensagem (HSM) do WhatsApp oficial.
--
-- Fora da janela de 24h a Meta só entrega mensagem a partir de um template
-- APROVADO por ela. Sem isto, conversa que passou do prazo fica morta: o
-- inbox bloqueia o envio e não há o que fazer além de esperar o cliente voltar.
--
-- O template vive em dois lugares: aqui (o rascunho que a rede escreve e
-- edita à vontade) e na Meta (a versão submetida, que tem id próprio e um
-- status que só ela decide). `meta_template_id` é a ponte entre os dois.
CREATE TABLE IF NOT EXISTS public.message_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- `name` é a chave do template na Meta: minúsculas, dígitos e underscore.
  -- Imutável depois de submetido — a Meta indexa o template por ele.
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'UTILITY',   -- MARKETING | UTILITY | AUTHENTICATION
  language    text NOT NULL DEFAULT 'pt_BR',

  -- Componentes. Cabeçalho e rodapé são opcionais; corpo é obrigatório.
  header_text text,
  body_text   text NOT NULL,
  footer_text text,
  -- [{ type: 'QUICK_REPLY'|'URL', text, url? }]
  buttons     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Exemplo de cada variável, exigido pela Meta para revisar o template.
  -- { "nome": "Ana", "data": "12/03" }
  example_values jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- DRAFT é só nosso: a Meta não conhece rascunho. Os demais vêm dela.
  status      text NOT NULL DEFAULT 'DRAFT',
  -- DRAFT | PENDING | APPROVED | REJECTED | PAUSED | DISABLED
  meta_template_id  text,
  rejection_reason  text,

  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,

  CONSTRAINT message_templates_status_check CHECK (
    status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')
  ),
  CONSTRAINT message_templates_category_check CHECK (
    category IN ('MARKETING','UTILITY','AUTHENTICATION')
  ),
  -- O nome só é único DENTRO de um idioma: a Meta trata "lembrete/pt_BR" e
  -- "lembrete/en_US" como o mesmo template em duas línguas.
  CONSTRAINT message_templates_nome_unico UNIQUE (tenant_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant
  ON public.message_templates (tenant_id, status);

-- O webhook de status da Meta chega com o id dela, sem dizer a rede.
CREATE INDEX IF NOT EXISTS idx_message_templates_meta_id
  ON public.message_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_templates_tenant ON public.message_templates;
CREATE POLICY message_templates_tenant ON public.message_templates
  USING ((tenant_id)::text = jwt_claim('tenant_id'));

-- Qual template originou a mensagem: sem isto o histórico mostra o texto já
-- interpolado e ninguém consegue auditar o que foi disparado a partir de quê.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL;

COMMENT ON TABLE public.message_templates IS
  'Templates HSM do WhatsApp oficial. DRAFT é local; os demais status vêm da Meta.';
