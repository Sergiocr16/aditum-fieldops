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
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', route: 'dashboard', routes: ['dashboard'], locked: true },
  { key: 'tickets', labelKey: 'nav.tickets', icon: 'ticket', route: 'tickets', routes: ['tickets', 'ticketForm', 'ticketDetail'] },
  { key: 'technicians', labelKey: 'nav.technicians', icon: 'users', route: 'technicians', routes: ['technicians'] },
  { key: 'contracts', labelKey: 'contracts.nav', icon: 'file', route: 'contracts', routes: ['contracts', 'contractForm', 'contractDetail'] },
  { key: 'equipment', labelKey: 'equipment.nav', icon: 'wrench', route: 'equipment', routes: ['equipment', 'templateEditor'] },
  { key: 'serviceOrders', labelKey: 'serviceOrders.nav', icon: 'ticket', route: 'serviceOrders', routes: ['serviceOrders', 'soDetail'] },
  { key: 'calendar', labelKey: 'calendar.nav', icon: 'calendar', route: 'calendar', routes: ['calendar'] },
  { key: 'billing', labelKey: 'billing.nav', icon: 'download', route: 'billing', routes: ['billing'] },
  { key: 'inventory', labelKey: 'inventory.nav', icon: 'building', route: 'inventory', routes: ['inventory'] },
  { key: 'wiki', labelKey: 'wiki.nav', icon: 'globe', route: 'wiki', routes: ['wiki', 'wikiForm'] },
  { key: 'notifySettings', labelKey: 'notifySettings.nav', icon: 'bell', route: 'notifySettings', routes: ['notifySettings'] },
  { key: 'tenantSettings', labelKey: 'tenantSettings.nav', icon: 'settings', route: 'tenantSettings', routes: ['tenantSettings'], locked: true },
];

/** Módulos que un admin puede activar/desactivar (todos menos los locked). */
export const CONFIGURABLE_MODULES = MODULES.filter((m) => !m.locked);

/** Módulos fijos por rol (coordinador/facturación). El admin ve todo (o lo que
    su lista `modules` permita). Siempre se agrega el dashboard. */
export const ROLE_MODULES: Record<string, string[]> = {
  coordinador: ['dashboard', 'contracts', 'equipment', 'serviceOrders', 'calendar', 'notifySettings'],
  facturacion: ['dashboard', 'billing'],
};

/** ¿Este usuario puede ver el módulo? Para admin: `modules` vacío = todos.
    Para coordinador/facturación: el set fijo de su rol. */
export function canSeeModule(moduleKey: string, role: string | undefined, modules?: string[] | null): boolean {
  if (role === 'coordinador' || role === 'facturacion') {
    return (ROLE_MODULES[role] || []).includes(moduleKey);
  }
  // admin
  const def = MODULES.find((m) => m.key === moduleKey);
  if (def?.locked) return true;
  if (!modules || modules.length === 0) return true;
  return modules.includes(moduleKey);
}

/** ¿Puede entrar a esta ruta? (resuelve la ruta a su módulo). */
export function canAccessRoute(route: string, role: string | undefined, modules?: string[] | null): boolean {
  const def = MODULES.find((m) => m.routes.includes(route));
  if (!def) return true; // rutas sueltas no mapeadas: no las bloqueamos
  return canSeeModule(def.key, role, modules);
}

/** Lista de módulos visibles para el usuario, en orden del catálogo. */
export function visibleModules(role: string | undefined, modules?: string[] | null): ModuleDef[] {
  return MODULES.filter((m) => canSeeModule(m.key, role, modules));
}
