/* © 2026 Aditum — Aditum FieldOps — catálogo de módulos del panel admin.
   Fuente única para el sidebar, el guard de rutas y el editor de permisos por admin. */

export interface ModuleDef {
  key: string;
  /** Clave i18n del nombre visible. */
  labelKey: string;
  icon: string;
  /** Ruta a la que navega el item del sidebar. */
  route: string;
  /** Rutas que cuentan como "dentro" de este módulo (para active + guard). */
  routes: string[];
  /** No se puede ocultar (siempre visible para cualquier admin). */
  locked?: boolean;
  /** Feature del tenant que habilita este módulo. Ausente = siempre disponible. */
  feature?: TenantFeature;
}

/** Módulos que usa la empresa (a nivel tenant). Ausente = todos activos. */
export type TenantFeature = 'tickets' | 'maintenance' | 'inventory' | 'wiki';
export const TENANT_FEATURES: TenantFeature[] = ['tickets', 'maintenance', 'inventory', 'wiki'];

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', route: 'dashboard', routes: ['dashboard'], locked: true },
  { key: 'tickets', labelKey: 'nav.tickets', icon: 'ticket', route: 'tickets', routes: ['tickets', 'ticketForm', 'ticketDetail'], feature: 'tickets' },
  { key: 'technicians', labelKey: 'nav.technicians', icon: 'users', route: 'technicians', routes: ['technicians'] },
  { key: 'contracts', labelKey: 'contracts.nav', icon: 'file', route: 'contracts', routes: ['contracts', 'contractForm', 'contractDetail'], feature: 'maintenance' },
  { key: 'equipment', labelKey: 'equipment.nav', icon: 'wrench', route: 'equipment', routes: ['equipment', 'templateEditor'], feature: 'maintenance' },
  { key: 'serviceOrders', labelKey: 'serviceOrders.nav', icon: 'ticket', route: 'serviceOrders', routes: ['serviceOrders', 'soDetail'], feature: 'maintenance' },
  { key: 'calendar', labelKey: 'calendar.nav', icon: 'calendar', route: 'calendar', routes: ['calendar'], feature: 'maintenance' },
  { key: 'billing', labelKey: 'billing.nav', icon: 'download', route: 'billing', routes: ['billing'], feature: 'maintenance' },
  { key: 'inventory', labelKey: 'inventory.nav', icon: 'building', route: 'inventory', routes: ['inventory'], feature: 'inventory' },
  { key: 'wiki', labelKey: 'wiki.nav', icon: 'globe', route: 'wiki', routes: ['wiki', 'wikiForm'], feature: 'wiki' },
  { key: 'notifySettings', labelKey: 'notifySettings.nav', icon: 'bell', route: 'notifySettings', routes: ['notifySettings'], feature: 'maintenance' },
  { key: 'tenantSettings', labelKey: 'tenantSettings.nav', icon: 'settings', route: 'tenantSettings', routes: ['tenantSettings'], locked: true },
];

/** ¿La empresa tiene activada esta feature? Ausente/null = todas activas (legacy). */
export function tenantHasFeature(feature: TenantFeature, features?: string[] | null): boolean {
  if (!features) return true;
  return features.includes(feature);
}
function moduleEnabledByTenant(def: ModuleDef | undefined, features?: string[] | null): boolean {
  if (!def?.feature) return true;
  return tenantHasFeature(def.feature, features);
}

/** Módulos que un admin puede activar/desactivar (todos menos los locked). */
export const CONFIGURABLE_MODULES = MODULES.filter((m) => !m.locked);

/** Módulos fijos por rol (coordinador/facturación). El admin ve todo (o lo que
    su lista `modules` permita). Siempre se agrega el dashboard. */
export const ROLE_MODULES: Record<string, string[]> = {
  coordinador: ['dashboard', 'contracts', 'equipment', 'serviceOrders', 'calendar', 'notifySettings'],
  facturacion: ['dashboard', 'billing'],
};

/** ¿Este usuario puede ver el módulo? Combina: feature del tenant (qué usa la
    empresa) + rol + (para admin) su lista `modules`. */
export function canSeeModule(moduleKey: string, role: string | undefined, modules?: string[] | null, features?: string[] | null): boolean {
  const def = MODULES.find((m) => m.key === moduleKey);
  if (!moduleEnabledByTenant(def, features)) return false; // la empresa no usa esa feature
  if (role === 'coordinador' || role === 'facturacion') {
    return (ROLE_MODULES[role] || []).includes(moduleKey);
  }
  // admin
  if (def?.locked) return true;
  if (!modules || modules.length === 0) return true;
  return modules.includes(moduleKey);
}

/** ¿Puede entrar a esta ruta? (resuelve la ruta a su módulo). */
export function canAccessRoute(route: string, role: string | undefined, modules?: string[] | null, features?: string[] | null): boolean {
  const def = MODULES.find((m) => m.routes.includes(route));
  if (!def) return true; // rutas sueltas no mapeadas: no las bloqueamos
  return canSeeModule(def.key, role, modules, features);
}

/** Lista de módulos visibles para el usuario, en orden del catálogo. */
export function visibleModules(role: string | undefined, modules?: string[] | null, features?: string[] | null): ModuleDef[] {
  return MODULES.filter((m) => canSeeModule(m.key, role, modules, features));
}
