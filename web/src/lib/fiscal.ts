/* © 2026 Aditum — Aditum FieldOps — constantes y helpers de facturación electrónica (web) */

/** Tipos de identificación fiscal de Hacienda (código → clave i18n `clients.identType_*`). */
export const IDENT_TYPES = [
  { code: 1, key: 'cedulaFisica' },
  { code: 2, key: 'cedulaJuridica' },
  { code: 3, key: 'dimex' },
  { code: 4, key: 'nite' },
  { code: 10, key: 'extranjera' },
] as const;

export const FISCAL_CURRENCIES = ['CRC', 'USD'] as const;
export type FiscalCurrency = (typeof FISCAL_CURRENCIES)[number];

export const currencySymbol = (c?: string) => (c === 'USD' ? '$' : '₡');

export function formatMoney(amount?: number | null, currency?: string): string {
  if (amount == null) return '—';
  return currencySymbol(currency) + Number(amount).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Desglose por línea para la UI. `ivaIncluded=false` (manual) = el IVA se suma encima del monto base. */
export function lineCalc(amount: number, emitIva: boolean, ivaIncluded = false): { subtotal: number; iva: number; total: number } {
  const a = Number(amount) || 0;
  if (!emitIva) return { subtotal: round2(a), iva: 0, total: round2(a) };
  if (ivaIncluded) {
    const subtotal = round2(a / 1.13);
    const iva = round2(subtotal * 0.13);
    return { subtotal, iva, total: round2(subtotal + iva) };
  }
  const iva = round2(a * 0.13);
  return { subtotal: round2(a), iva, total: round2(a + iva) };
}

export type FiscalTone = 'ok' | 'err' | 'pending' | 'none';

/** Tono visual para un estado de emisión electrónica. */
export function fiscalTone(status?: string): FiscalTone {
  if (!status || status === 'NO_RECEPTOR' || status === 'PENDING') return 'none';
  if (status === 'DOCUMENT_ACCEPTED_TAX_OFFICE') return 'ok';
  if (status === 'DOCUMENT_REJECTED_BY_TAX_OFFICE' || status === 'DOCUMENT_ERROR_TAX_OFFICE' || status === 'INVALID_CREDENTIALS' || status.startsWith('ERROR')) return 'err';
  return 'pending';
}
