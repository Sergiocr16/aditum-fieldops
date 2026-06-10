/* © 2026 Aditum — Aditum FieldOps — Signature pad (canvas, pointer events, no deps) */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (empty: boolean) => void }>(
  function SignaturePad({ height = 220, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    useEffect(() => {
      const canvas = canvasRef.current!;
      const wrap = wrapRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const resize = () => {
        const w = wrap.clientWidth;
        // preservar el dibujo al redimensionar
        const prev = canvas.width ? canvas.toDataURL() : null;
        canvas.width = w * dpr;
        canvas.height = height * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = height + 'px';
        const c = canvas.getContext('2d')!;
        c.scale(dpr, dpr);
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, height);
        c.lineWidth = 2.2;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.strokeStyle = '#1f2937';
        if (prev) {
          const img = new Image();
          img.onload = () => c.drawImage(img, 0, 0, w, height);
          img.src = prev;
        }
      };
      resize();
      const obs = new ResizeObserver(resize);
      obs.observe(wrap);
      return () => obs.disconnect();
    }, [height]);

    const pos = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: React.PointerEvent) => {
      e.preventDefault();
      canvasRef.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawing.current || !last.current) return;
      e.preventDefault();
      const p = pos(e);
      const c = canvasRef.current!.getContext('2d')!;
      const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
      c.beginPath();
      c.moveTo(last.current.x, last.current.y);
      c.quadraticCurveTo(mid.x, mid.y, p.x, p.y);
      c.stroke();
      last.current = p;
      if (empty) {
        setEmpty(false);
        onChange?.(false);
      }
    };
    const up = () => {
      drawing.current = false;
      last.current = null;
    };

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current!;
        const c = canvas.getContext('2d')!;
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.restore();
        setEmpty(true);
        onChange?.(true);
      },
      isEmpty: () => empty,
      toBlob: () => new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob((b) => resolve(b), 'image/png')),
    }), [empty, onChange]);

    return (
      <div ref={wrapRef} style={{ width: '100%' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ width: '100%', height, borderRadius: 'var(--r-md)', border: '1.5px dashed var(--border-strong)', background: '#fff', touchAction: 'none', display: 'block' }}
        />
      </div>
    );
  }
);

export default SignaturePad;
