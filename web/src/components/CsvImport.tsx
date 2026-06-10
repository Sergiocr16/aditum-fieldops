/* © 2026 Aditum — Aditum FieldOps — Generic CSV/XLSX import modal (preview + column mapping by header) */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Icon, Button, Modal, toast } from './ui';

export interface CsvColumn {
  key: string;
  label: string;
  required?: boolean;
  /** Header aliases accepted in the file (case-insensitive). */
  aliases?: string[];
}

export default function CsvImport({
  open,
  onClose,
  title,
  columns,
  templateName,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: CsvColumn[];
  templateName: string;
  onImport: (rows: Record<string, any>[]) => Promise<{ created: number; skipped?: number; errors?: { row: number; error: string }[] }>;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped?: number; errors?: { row: number; error: string }[] } | null>(null);

  const matchKey = (header: string): string | null => {
    const h = header.trim().toLowerCase();
    for (const c of columns) {
      if (c.label.toLowerCase() === h || c.key.toLowerCase() === h) return c.key;
      if ((c.aliases || []).some((a) => a.toLowerCase() === h)) return c.key;
    }
    return null;
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const mapped = json.map((raw) => {
          const out: Record<string, any> = {};
          for (const [header, value] of Object.entries(raw)) {
            const key = matchKey(header);
            if (key) out[key] = typeof value === 'string' ? value.trim() : value;
          }
          return out;
        }).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
        setRows(mapped);
        setFileName(file.name);
        if (!mapped.length) toast(t('csvImport.empty'), 'error');
      } catch {
        toast(t('csvImport.parseError'), 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const sample: Record<string, string> = {};
    columns.forEach((c) => (sample[c.label] = ''));
    const ws = XLSX.utils.json_to_sheet([sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, templateName + '.xlsx');
  };

  const run = async () => {
    const missing = columns.filter((c) => c.required && rows.some((r) => !String(r[c.key] ?? '').trim()));
    if (missing.length) {
      toast(t('csvImport.missingRequired', { col: missing[0].label }), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await onImport(rows);
      setResult(res);
      setRows([]);
      setFileName('');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title} sub={t('csvImport.sub')} width={640}
      footer={<>
        <Button variant="ghost" onClick={close}>{t('common.close')}</Button>
        {rows.length > 0 && <Button onClick={run} disabled={busy}>{busy ? '…' : t('csvImport.import', { n: rows.length })}</Button>}
      </>}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />

      {result ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, fontWeight: 600, color: 'var(--st-apro-fg)', marginBottom: 8 }}>
            <Icon name="checkCircle" size={18} />
            {t('csvImport.done', { created: result.created })}
            {result.skipped ? ' · ' + t('csvImport.skipped', { n: result.skipped }) : ''}
          </div>
          {!!result.errors?.length && (
            <div style={{ background: 'var(--st-rech-bg)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--st-rech-fg)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('csvImport.errors', { n: result.errors.length })}</div>
              {result.errors.slice(0, 8).map((e, i) => (
                <div key={i} className="mono">Fila {e.row}: {e.error}</div>
              ))}
              {result.errors.length > 8 && <div>…</div>}
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', border: '2px dashed var(--border)', background: 'var(--bg)', borderRadius: 12, padding: '28px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}
          >
            <Icon name="upload" size={24} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('csvImport.drop')}</span>
            <span style={{ fontSize: 12.5 }}>{t('csvImport.formats')}</span>
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {t('csvImport.columns')}: {columns.map((c) => c.label + (c.required ? '*' : '')).join(', ')}
            </span>
            <Button size="sm" variant="ghost" icon="download" onClick={downloadTemplate}>{t('csvImport.template')}</Button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13.5 }}>
            <Icon name="file" size={16} />
            <span style={{ fontWeight: 600 }}>{fileName}</span>
            <span style={{ color: 'var(--text-3)' }}>· {t('csvImport.rows', { n: rows.length })}</span>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 30, height: 30 }} onClick={() => { setRows([]); setFileName(''); }}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>{columns.map((c) => <td key={c.key}>{String(r[c.key] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>+{rows.length - 30}…</div>}
        </div>
      )}
    </Modal>
  );
}
