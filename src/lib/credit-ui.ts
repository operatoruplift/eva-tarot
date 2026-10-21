import { ReadingServiceError } from './readings.ts';
import type { CommerceCatalog, CommerceWallet } from './commerce.ts';

/** A service outage is never a reason to offer a purchase. */
export function requiresReadingCredits(cause: unknown): cause is ReadingServiceError {
  return cause instanceof ReadingServiceError && cause.status === 402 && cause.code === 'credits_required';
}

export function usesOnlineCredits(catalog: CommerceCatalog | null): boolean {
  return catalog?.settings.pricing_mode === 'paid' || catalog?.settings.pricing_mode === 'free_trial';
}

export function availableCreditProducts(catalog: CommerceCatalog | null) {
  return (catalog?.products || []).filter(product => product.active && product.kind === 'credits'
    && Number.isSafeInteger(product.credits) && product.credits > 0
    && Number.isSafeInteger(product.price_vnd) && product.price_vnd > 0)
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
}

export type CreditSnapshot = {
  catalog: CommerceCatalog | null;
  wallet: CommerceWallet | null;
  loading: boolean;
  unavailable: boolean;
};
export const emptyCreditSnapshot: CreditSnapshot = { catalog: null, wallet: null, loading: false, unavailable: false };

/** Coalesce browser resume events; a finished reply may invalidate an older in-flight balance. */
export function createCreditRefresh(options: {
  loadCatalog: () => Promise<CommerceCatalog>;
  loadWallet: () => Promise<CommerceWallet>;
  onUpdate: (snapshot: CreditSnapshot) => void;
}) {
  let snapshot = emptyCreditSnapshot;
  let inFlight: Promise<void> | null = null;
  let disposed = false;
  let rerun = false;
  const publish = (next: CreditSnapshot) => { snapshot = next; if (!disposed) options.onUpdate(next); };
  const refresh = (invalidate = false): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (inFlight) { if (invalidate) rerun = true; return inFlight; }
    inFlight = (async () => {
      do {
        rerun = false;
        publish({ ...snapshot, loading: true });
        try {
          const catalog = await options.loadCatalog();
          if (disposed) return;
          // Free/unknown policy must not create a wallet or grant credits as a side effect.
          publish({ ...snapshot, catalog, wallet: usesOnlineCredits(catalog) ? snapshot.wallet : null, loading: true });
          const wallet = usesOnlineCredits(catalog) ? await options.loadWallet() : null;
          if (!disposed) publish({ catalog, wallet, loading: false, unavailable: false });
        } catch {
          if (!disposed) publish({ ...snapshot, loading: false, unavailable: true });
        }
      } while (rerun && !disposed);
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return { refresh, dispose: () => { disposed = true; rerun = false; } };
}
