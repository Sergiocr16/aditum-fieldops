/* © 2026 Aditum — Aditum FieldOps — Motor de tema (white-label).
   Deriva la escala completa navy/dorado a partir de 2 colores base (primario + acento),
   aproximando las relaciones del tema Aditum. Se usa tanto en la app autenticada
   (TenantProvider → :root) como en las páginas públicas (estilo inline en el wrapper). */

export const ADITUM_PRIMARY = '#002A42';
export const ADITUM_ACCENT = '#DEB66E';

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

/** Mezcla un color hacia blanco (amt>0) o negro (amt<0), amt en [-1,1]. */
export function mix(hex: string, amt: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amt >= 0 ? 255 : 0;
  const k = Math.abs(amt);
  return toHex(
    rgb[0] + (target - rgb[0]) * k,
    rgb[1] + (target - rgb[1]) * k,
    rgb[2] + (target - rgb[2]) * k,
  );
}

export function isValidHex(hex?: string): boolean {
  return !!parseHex(hex || '');
}

/** Devuelve texto blanco o oscuro según el contraste con el color de fondo dado
    (luminancia perceptual). Evita texto negro ilegible sobre un acento oscuro (rojo, etc.). */
export function readableOn(hex?: string): string {
  const rgb = parseHex(hex || '');
  if (!rgb) return '#0c1a24';
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.6 ? '#0c1a24' : '#ffffff';
}

/** Variables CSS de marca derivadas de primario + acento. */
export function brandVars(primary?: string, accent?: string): Record<string, string> {
  const p = isValidHex(primary) ? (primary as string) : ADITUM_PRIMARY;
  const a = isValidHex(accent) ? (accent as string) : ADITUM_ACCENT;
  return {
    '--navy-900': mix(p, -0.28),
    '--navy-800': p,
    '--navy-700': mix(p, 0.06),
    '--navy-600': mix(p, 0.16),
    '--navy-500': mix(p, 0.28),
    '--gold': a,
    '--gold-600': mix(a, -0.18),
    '--gold-100': mix(a, 0.78),
    '--gold-50': mix(a, 0.9),
    // Texto legible sobre el acento (botones dorados) y sobre el primario.
    '--gold-fg': readableOn(a),
    '--on-primary': readableOn(p),
  };
}

/** Aplica (o limpia) las variables de marca en un elemento. */
export function applyBrandVars(el: HTMLElement | null, primary?: string, accent?: string) {
  if (!el) return;
  const vars = brandVars(primary, accent);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

export function clearBrandVars(el: HTMLElement | null) {
  if (!el) return;
  for (const k of Object.keys(brandVars())) el.style.removeProperty(k);
}

/** Branding tal como llega del DTO público o del doc del tenant. */
export interface Branding {
  appName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

/* ---- Cache del branding (evita el flash del fallback al recargar) ----
   Guardamos primario/acento/logo del tenant en localStorage y los aplicamos
   de forma síncrona al arrancar (boot), antes del primer render. Se limpia al
   cerrar sesión para no mostrar la marca del tenant anterior en un login distinto. */
const BRAND_CACHE_KEY = 'fo_brand';

export function cacheBranding(b?: Branding | null) {
  try {
    if (b && (b.primaryColor || b.accentColor || b.logoUrl)) {
      localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ primaryColor: b.primaryColor || '', accentColor: b.accentColor || '', logoUrl: b.logoUrl || '' }));
    } else {
      localStorage.removeItem(BRAND_CACHE_KEY);
    }
  } catch { /* ignore */ }
}

export function readCachedBranding(): Branding | null {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

export function clearCachedBranding() {
  try { localStorage.removeItem(BRAND_CACHE_KEY); } catch { /* ignore */ }
}

/** Aplica el branding cacheado al root al arrancar (síncrono, antes del primer paint). */
export function bootBranding() {
  const b = readCachedBranding();
  if (b && (b.primaryColor || b.accentColor)) applyBrandVars(document.documentElement, b.primaryColor, b.accentColor);
}
