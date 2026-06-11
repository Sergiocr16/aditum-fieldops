/* © 2026 Aditum — Aditum FieldOps — catálogos fiscales de Hacienda (JSON estáticos, lazy + cache).
   Generados por scripts/build-fiscal-catalogs.mjs en web/public/fiscal/. */
import { useEffect, useState } from 'react';

export interface ActivityRow { c: string; n: string }
export interface TerrRow { id: number; fid: string; n: string; t: string; p: number | null }
export interface CabysRow { c: string; d: string; t: number | null }

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let activityP: Promise<ActivityRow[]> | null = null;
let terrP: Promise<TerrRow[]> | null = null;
let cabysP: Promise<CabysRow[]> | null = null;

const fetchJson = <T,>(path: string): Promise<T> => fetch(path).then((r) => r.json());

export const loadActivity = () => (activityP ??= fetchJson<ActivityRow[]>('/fiscal/activity.json'));
export const loadTerritorial = () => (terrP ??= fetchJson<TerrRow[]>('/fiscal/territorial.json'));
export const loadCabys = () => (cabysP ??= fetchJson<CabysRow[]>('/fiscal/cabys.json'));

/** Filtra por substring (sin tildes, case-insensitive) en los campos dados, con tope. */
export function filterText<T>(items: T[], q: string, fields: (keyof T)[], limit = 50): T[] {
  const n = norm(q);
  if (!n) return items.slice(0, limit);
  const out: T[] = [];
  for (const it of items) {
    if (fields.some((f) => norm(it[f]).includes(n))) {
      out.push(it);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/* ---- Actividades ---- */
export function useActivity() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  useEffect(() => { loadActivity().then(setRows).catch(() => {}); }, []);
  return {
    rows,
    search: (q: string, limit = 50) => filterText(rows, q, ['c', 'n'], limit),
    byCode: (c?: string) => (c ? rows.find((r) => r.c === c) : undefined),
  };
}

/* ---- CABYS ---- */
export function useCabys() {
  const [rows, setRows] = useState<CabysRow[]>([]);
  useEffect(() => { loadCabys().then(setRows).catch(() => {}); }, []);
  return {
    rows,
    search: (q: string, limit = 50) => filterText(rows, q, ['c', 'd'], limit),
    byCode: (c?: string) => (c ? rows.find((r) => r.c === c) : undefined),
  };
}

/* ---- División territorial (árbol por belongs_to_id) ---- */
export function useTerritorial() {
  const [rows, setRows] = useState<TerrRow[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { loadTerritorial().then((r) => { setRows(r); setReady(true); }).catch(() => setReady(true)); }, []);
  const childrenOf = (parentId: number | null) => rows.filter((r) => r.p === parentId);
  const byId = (id: number | null | undefined) => (id == null ? undefined : rows.find((r) => r.id === id));
  /** Hijo de `parentId` con un `fiscalId` dado (para reconstruir la cascada al editar). */
  const findChild = (parentId: number | null, fid?: string | number | null) =>
    fid == null || fid === '' ? undefined : rows.find((r) => r.p === parentId && r.fid === String(fid));
  return { ready, rows, provinces: () => childrenOf(null), childrenOf, byId, findChild };
}
