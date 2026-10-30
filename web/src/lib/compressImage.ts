/* © 2026 Aditum — Aditum FieldOps — compresión de fotos en el cliente antes de subir.
   Las fotos del celular pesan 3–12 MB (12–48 MP). Las redimensionamos a un lado máximo de
   MAX_SIDE px y las re-codificamos a JPEG (calidad QUALITY). Se aplica a todo upload de
   imagen (evidencia, checklist, fotos generales, Wiki). Los videos se comprimen en el
   backend (onEvidenceFinalized, ffmpeg); los PDF se suben tal cual.

   Seguro por diseño: si algo falla (formato no decodificable, navegador sin canvas) o el
   resultado no es más chico, devuelve el archivo original — nunca bloquea la subida. */

const MAX_SIDE = 1920;
const QUALITY = 0.8;
/** Imágenes por debajo de este tamaño y dentro de MAX_SIDE no se tocan. */
const SKIP_BELOW_BYTES = 400 * 1024;

const COMPRESSIBLE = /^image\/(jpeg|png|webp|heic|heif)$/i;

async function decode(file: File): Promise<{ src: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation 'from-image' respeta la rotación EXIF de las fotos del celular.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
      return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fallback a <img> (p. ej. Safari viejo) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Devuelve una versión comprimida (JPEG) de la imagen, o el mismo archivo si no aplica. */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.test(file.type)) return file;
  let decoded: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    decoded = await decode(file);
    const { width, height } = decoded;
    if (!width || !height) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) return file;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return file;
    // Fondo blanco: JPEG no tiene transparencia (PNG con alfa quedaría negro).
    ctx2d.fillStyle = '#ffffff';
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.imageSmoothingQuality = 'high';
    ctx2d.drawImage(decoded.src, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    decoded?.close();
  }
}

/** Extensión de archivo coherente con el tipo final (tras comprimir). */
export function extOf(file: File, fallback = 'jpg'): string {
  if (file.type === 'image/jpeg') return 'jpg';
  return (file.name.split('.').pop() || fallback).toLowerCase();
}
