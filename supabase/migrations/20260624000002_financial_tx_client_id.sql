-- Permite vincular uma financial_transaction diretamente a um cliente
-- (necessário para transações de checkout que não passam por um appointment)
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_client_id
  ON public.financial_transactions (client_id)
  WHERE client_id IS NOT NULL;
