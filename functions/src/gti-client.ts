/* © 2026 Aditum — Aditum FieldOps — cliente GTI (facturación electrónica CR).
   Contrato HTTP/JSON agnóstico: arma el payload v4.4, lo envía a GTI y normaliza
   la respuesta. GTI genera el XML, lo firma y lo manda a Hacienda; nosotros solo
   enviamos JSON y persistimos el consecutivo + clave numérica que devuelve. */

import { FiscalCurrency, GTI_CURRENCY_CODE } from './shared';

/* ---------------- config + constantes ---------------- */

export interface GtiConfig {
  accountNumber: string;   // pNumCuenta / NumCuenta
  username: string;        // pUsuario
  password: string;        // pClave (en claro: ya descifrada por el llamador)
  activityCode: string;    // CodigoActividad del emisor
  terminal: number;        // Terminal del punto de emisión
  environment: 'sandbox' | 'production';
}

const SANDBOX_BASE = 'https://pruebas.gticr.com/AplicacionFEPruebas/';
const PRODUCTION_BASE = 'https://www.facturaelectronica.cr/';
const TAX_PERCENTAGE = 13.0;
const REQUEST_TIMEOUT_MS = 30_000;

function baseUrl(cfg: GtiConfig): string {
  return cfg.environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
}

/** Mapa de códigos de EstadoHacienda → estado interno. */
export const HACIENDA_STATUS_MAP: Record<number, string> = {
  100: 'DOCUMENT_ACCEPTED_TAX_OFFICE',
  101: 'DOCUMENT_IN_PROCESS_AT_TAX_OFFICE',
  102: 'DOCUMENT_REJECTED_BY_TAX_OFFICE',
  103: 'DOCUMENT_ERROR_TAX_OFFICE',
  104: 'DOCUMENT_NOT_FOUND_IN_GTI_DATABASE',
  105: 'PENDING_SEND_TO_TAX_OFFICE',
  106: 'AWAITING_TAX_OFFICE_RESPONSE',
  107: 'DOCUMENT_STATUS_UNKNOWN_TAX_OFFICE',
  108: 'RETRY_DOCUMENT_QUERY_LATER',
};
export function haciendaStatus(code: number): string {
  return HACIENDA_STATUS_MAP[code] || 'UNKNOWN_STATUS';
}
/** Estados finales: ya no tiene sentido seguir consultando. */
export const STATUS_FINAL = ['DOCUMENT_ACCEPTED_TAX_OFFICE', 'DOCUMENT_REJECTED_BY_TAX_OFFICE'];

/* ---------------- helpers puros ---------------- */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Desglose de IVA: los montos del sistema vienen IVA-incluido. */
export function calcAmounts(amount: number): { subTotal: number; tax: number; total: number } {
  const totalIn = Number(amount) || 0;
  const subTotal = round2(totalIn / (1 + TAX_PERCENTAGE / 100));
  const tax = round2(subTotal * (TAX_PERCENTAGE / 100));
  const total = round2(subTotal + tax);
  return { subTotal, tax, total };
}

/** Normaliza texto a ASCII puro (GTI/Hacienda son sensibles en Notas/descripciones). */
export function normalizeText(s: string): string {
  if (!s) return '';
  let out = String(s);
  out = out.replace(/<br\s*\/?>/gi, '\n').replace(/<\/br>/gi, '\n'); // saltos de línea
  out = out.replace(/<[^>]+>/g, ''); // quitar HTML
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, ''); // quitar diacríticos
  out = out.replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
  out = out.replace(/[^\x00-\x7F]/g, ''); // descartar no-ASCII restante
  return out;
}

function limit(s: string, n: number): string {
  return String(s || '').slice(0, n);
}

/** Elimina del objeto las claves cuyo valor es null/undefined/'' (equivale a Jackson NON_NULL). */
function compact<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = v;
  }
  return out;
}

/* ---------------- builders de payload ---------------- */

export interface FiscalLineInput {
  cabys?: string;        // chargeType.cabysCode (opcional)
  prodServCode?: string; // chargeType.code → CodProdServ
  description: string;
  amount: number;        // monto de la línea
  emitIva: boolean;
  /** ¿El `amount` ya incluye IVA? true (default) = se desglosa ÷1.13 (OT/consolidadas);
      false = `amount` es base y el IVA 13% se suma encima (compositor manual). */
  ivaIncluded?: boolean;
}

/** Desglose por línea según `emitIva` + `ivaIncluded`. */
function lineAmounts(line: FiscalLineInput): { subTotal: number; tax: number; total: number } {
  if (!line.emitIva) {
    const total = round2(line.amount);
    return { subTotal: total, tax: 0, total };
  }
  if (line.ivaIncluded === false) {
    const subTotal = round2(line.amount);
    const tax = round2(subTotal * (TAX_PERCENTAGE / 100));
    return { subTotal, tax, total: round2(subTotal + tax) };
  }
  return calcAmounts(line.amount);
}

export interface FiscalReceptor {
  name: string;
  identType: number;
  identNumber: string;
  comercialName?: string;
  email: string;
  ccEmails?: string;
  activityCode?: string;
  province?: number | null;
  canton?: number | null;
  district?: number | null;
  neighborhood?: number | null;
  direction?: string;
  internalCode?: string;
}

export interface FiscalReference {
  numeroRef: string;   // consecutivo de la factura original
  fechaRef: string;    // 'yyyy-MM-ddTHH:mm:ss'
  razonNota: string;
}

export interface BuildDocInput {
  config: GtiConfig;
  tipoDoc: 1 | 3;            // 1=factura, 3=nota de crédito
  currency: FiscalCurrency;
  fechaFactura: string;      // 'yyyy-MM-ddTHH:mm:ss' (hora CR)
  receptor: FiscalReceptor;
  lines: FiscalLineInput[];
  notes?: string;
  reference?: FiscalReference; // solo notas de crédito
}

function buildReceptor(r: FiscalReceptor) {
  return compact({
    Nombre: limit(r.name, 100),
    ActividadEconomica: r.activityCode || undefined,
    TipoIdent: Number(r.identType),
    Identificacion: String(r.identNumber),
    NombComercial: r.comercialName ? limit(r.comercialName, 80) : undefined,
    Provincia: r.province ?? undefined,
    Canton: r.canton ?? undefined,
    Distrito: r.district ?? undefined,
    Barrio: r.neighborhood ?? undefined,
    Direccion: r.direction ? limit(r.direction, 160) : undefined,
    Correo: r.email,
    Copia: r.ccEmails || undefined,
    CodInterno: r.internalCode || undefined,
  });
}

function buildLine(line: FiscalLineInput) {
  const desc = limit(normalizeText(line.description), 200);
  // Código comercial (CodProdServ): nunca vacío. Cae al CABYS si no hay código interno.
  // Si CABYS es "surtido", Hacienda exige código comercial; un valor vacío lo rechaza.
  const com = String(line.prodServCode || line.cabys || '').trim();
  const commercial = com ? { CodProdServ: [com], CodTipo: [2] } : {};
  const a = lineAmounts(line);
  if (line.emitIva) {
    return compact({
      Codigo: line.cabys || undefined,
      ...commercial,
      Cantidad: 1,
      UnidadMedida: 24,
      Descripcion: desc,
      PrecioUnitario: a.subTotal,
      Impuestos: [{ CodigoImp: 1, CodigoTarifa: 8, PorcentajeImp: 13.0, MontoImp: a.tax }],
    });
  }
  // No sujeto: monto exacto, tarifa 11 (0%).
  return compact({
    Codigo: line.cabys || undefined,
    ...commercial,
    Cantidad: 1,
    UnidadMedida: 24,
    Descripcion: desc,
    PrecioUnitario: a.total,
    MontoTotal: a.total,
    ImpuestoNeto: 0,
    Impuestos: [{ CodigoImp: 1, CodigoTarifa: 11, PorcentajeImp: 0.0, MontoImp: 0 }],
  });
}

/** CABYS que empieza con 9 = servicio; el resto = bien/mercancía (clasificación de Hacienda). */
function isServiceCabys(cabys?: string): boolean {
  return String(cabys || '').trim().startsWith('9');
}

function buildTotals(lines: FiscalLineInput[]) {
  let totalServGravado = 0;
  let totalMercaGravada = 0;
  let totalServNoSujeto = 0;
  let totalNoSujeto = 0;
  let totalImpuesto = 0;
  let totalVenta = 0;        // neto: subtotal (gravado) o total (no sujeto)
  let totalComprobante = 0;  // bruto con IVA
  for (const line of lines) {
    const service = isServiceCabys(line.cabys);
    if (line.emitIva) {
      const { subTotal, tax, total } = lineAmounts(line);
      if (service) totalServGravado += subTotal; else totalMercaGravada += subTotal;
      totalImpuesto += tax;
      totalVenta += subTotal;
      totalComprobante += total;
    } else {
      const total = round2(line.amount);
      if (service) totalServNoSujeto += total;
      totalNoSujeto += total;
      totalVenta += total;
      totalComprobante += total;
    }
  }
  const totalGravado = round2(totalServGravado + totalMercaGravada);
  return compact({
    TotalServGravado: totalServGravado ? round2(totalServGravado) : undefined,
    TotalMercaGravada: totalMercaGravada ? round2(totalMercaGravada) : undefined,
    TotalGravado: totalGravado || undefined,
    TotalServNoSujeto: totalServNoSujeto ? round2(totalServNoSujeto) : undefined,
    TotalNoSujeto: totalNoSujeto ? round2(totalNoSujeto) : undefined,
    TotalVenta: round2(totalVenta),
    TotalVentaNeta: round2(totalVenta),
    TotalImpuesto: round2(totalImpuesto),
    TotalComprobante: round2(totalComprobante),
  });
}

/** Suma del comprobante (con IVA) — útil para persistir el total del documento. */
export function documentTotals(lines: FiscalLineInput[]): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  for (const line of lines) {
    const a = lineAmounts(line);
    subtotal += a.subTotal;
    tax += a.tax;
    total += a.total;
  }
  return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total) };
}

/** Arma el payload completo (raíz `Documentos`) para CargarDocumento. */
export function buildDocumentPayload(input: BuildDocInput): any {
  const { config, currency } = input;
  const encabezado = compact({
    FechaFactura: input.fechaFactura,
    TipoDoc: input.tipoDoc,
    SituacionEnvio: 1,
    CantDeci: 2,
    Sucursal: 1,
    CodigoActividad: Number(config.activityCode),
    Terminal: Number(config.terminal),
    Moneda: GTI_CURRENCY_CODE[currency],
    MedioPagos: [{ TipoMedioPago: '4' }],
    CondicionVenta: 1,
    Receptor: buildReceptor(input.receptor),
  });
  const documento: any = compact({
    Encabezado: encabezado,
    Lineas: input.lines.map(buildLine),
    Referencia: input.reference
      ? {
          TipoDocRef: 1,
          NumeroRef: input.reference.numeroRef,
          FechaRef: input.reference.fechaRef,
          AccionRef: 1,
          RazonNota: limit(normalizeText(input.reference.razonNota), 180),
        }
      : undefined,
    Totales: buildTotals(input.lines),
    Otros: input.notes ? { Notas: limit(normalizeText(input.notes), 500) } : undefined,
    Extra: { EsVersion4_4: true },
  });
  return {
    NumCuenta: Number(config.accountNumber),
    Documentos: [documento],
  };
}

/* ---------------- HTTP ---------------- */

interface HttpResult {
  status: number;
  json: any;
  text: string;
}

async function postJson(url: string, body: any, extraHeaders?: Record<string, string>): Promise<HttpResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* respuesta no-JSON: queda en text */
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function creds(cfg: GtiConfig): string {
  const p = new URLSearchParams();
  p.set('pNumCuenta', String(cfg.accountNumber));
  p.set('pUsuario', String(cfg.username));
  p.set('pClave', String(cfg.password));
  return p.toString();
}

/** Carga un documento (factura/NC). Devuelve la respuesta cruda de GTI (ResponseDTO).
    `CodigoActividad` se fuerza a Double (p.ej. 8110.0): GTI lo valida como decimal,
    igual que aditum-jh; mandarlo como entero (8110) provoca "CodigoActividad no válido". */
export async function cargarDocumento(cfg: GtiConfig, payload: any): Promise<HttpResult> {
  const url = `${baseUrl(cfg)}ApiCargaFactura/api/Documentos/CargarDocumento?${creds(cfg)}`;
  const raw = JSON.stringify(payload).replace(/("CodigoActividad":)(-?\d+)(?=[,}])/g, '$1$2.0');
  return postJson(url, raw);
}

/** Consulta el estado del documento ante Hacienda por consecutivo. */
export async function estadoHacienda(cfg: GtiConfig, consecutivo: string): Promise<HttpResult> {
  const url = `${baseUrl(cfg)}ApiCargaFactura/api/Documentos/EstadoHacienda?${creds(cfg)}&pConsecutivo=${encodeURIComponent(consecutivo)}`;
  return postJson(url, {});
}

/** Reenvía el correo del documento al receptor. */
export async function reenviarCorreo(cfg: GtiConfig, consecutivo: string, correo: string): Promise<HttpResult> {
  const url = `${baseUrl(cfg)}ApiCargaFactura/api/Documentos/ReenviarCorreo?${creds(cfg)}&pConsecutivo=${encodeURIComponent(consecutivo)}&pCorreo=${encodeURIComponent(correo)}`;
  return postJson(url, {});
}

/** Ping de validación de credenciales (van en headers). 200 = válidas. */
export async function ping(cfg: GtiConfig): Promise<HttpResult> {
  const path =
    cfg.environment === 'production'
      ? 'WebApiAceptacion/api/Consulta/PendientesAceptacion'
      : 'ApiRecepcionDocs/api/Consulta/PendientesAceptacion';
  const url = `${baseUrl(cfg)}${path}`;
  return postJson(url, {}, {
    NumCuenta: String(cfg.accountNumber),
    Usuario: String(cfg.username),
    Clave: String(cfg.password),
  });
}
