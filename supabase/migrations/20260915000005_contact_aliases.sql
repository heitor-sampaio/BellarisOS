-- Identidade do contato deixou de ser uma coisa só.
--
-- O WhatsApp passou a mandar @lid (identificador privado) no lugar do número,
-- e a Cloud API passou a mandar BSUID (`BR.1A2B…`) em `contacts[].user_id` /
-- `messages[].from_user_id`, com `wa_id`/`from` podendo simplesmente NÃO VIR
-- quando o contato usa username.
--
-- A mesma pessoa chega ora com um identificador, ora com outro. Sem guardar
-- todos, ela vira duas conversas e dois cards — e o card nasce com um "telefone"
-- de 15 dígitos que é na verdade o @lid, para o qual ninguém consegue ligar.
--
-- `contact_external_id` continua sendo a chave (o índice único depende dela);
-- `contact_aliases` é o conjunto de TODOS os identificadores já vistos desta
-- pessoa neste canal, e é por ele que a reconciliação acontece.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_aliases text[] NOT NULL DEFAULT '{}';

-- Backfill: o que já existe conhece a si mesmo.
UPDATE conversations
   SET contact_aliases = ARRAY(
     SELECT DISTINCT x FROM unnest(ARRAY[contact_external_id, contact_phone]) AS x
      WHERE x IS NOT NULL AND x <> ''
   )
 WHERE contact_aliases = '{}';

-- A busca é sempre "alguma conversa deste tenant tem este alias?".
CREATE INDEX IF NOT EXISTS idx_conversations_aliases
  ON conversations USING gin (contact_aliases);

COMMENT ON COLUMN conversations.contact_aliases IS
  'Todos os identificadores já vistos deste contato no canal: telefone, @lid, BSUID. Usado para reconciliar a mesma pessoa chegando com ids diferentes.';
