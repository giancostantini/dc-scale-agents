-- 099: Reajuste automático de distribución de dividendos
--
-- Un mes/moneda puede necesitar MÁS de un reparto: la distribución
-- original (seq=0) y, si después entra un movimiento nuevo de ese mes
-- cuando la original ya está paga, uno o más "reajustes" (seq>=1) que
-- reparten SOLO la diferencia, sin tocar la original.
--
-- La PK pasa de (month_key, currency) a (month_key, currency, seq).
--   · seq=0  → distribución original (comportamiento actual).
--   · seq>=1 → reajustes. El label va en notes ("Reajuste distribución
--              de <mes>").

ALTER TABLE public.dividend_distributions
  ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.dividend_distributions.seq IS
  'Secuencia dentro del mes/moneda. 0 = distribución original; >=1 = reajustes (reparten solo la diferencia detectada después de pagar la original).';

-- Reemplazar la PK compuesta (month_key, currency) de la migración 082
-- por la triple con seq.
ALTER TABLE public.dividend_distributions
  DROP CONSTRAINT IF EXISTS dividend_distributions_pkey;

ALTER TABLE public.dividend_distributions
  ADD CONSTRAINT dividend_distributions_pkey
    PRIMARY KEY (month_key, currency, seq);
