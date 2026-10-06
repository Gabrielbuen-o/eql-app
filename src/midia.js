// Compressão de fotos e checagem de vídeos antes do envio (deixa o sistema leve)

const FOTO_LADO = 1440;    // lado maior da foto enviada (dá para ver detalhes; ~150–300 KB)
const FOTO_QUALIDADE = 0.7;
const MINI_LADO = 360;     // miniatura para listas e calendário (~15–25 KB)
const MINI_QUALIDADE = 0.62;
export const VIDEO_MAX_SEG = 30;
export const VIDEO_MAX_MB = 50;

async function abrirImagem(arquivo) {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    // navegadores antigos: usa <img> (já respeita a rotação da câmera)
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

function desenhar(fonte, lado, qualidade) {
  const w0 = fonte.width || fonte.naturalWidth, h0 = fonte.height || fonte.naturalHeight;
  const escala = Math.min(1, lado / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * escala));
  c.height = Math.max(1, Math.round(h0 * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('falha ao comprimir'))), 'image/jpeg', qualidade));
}

// Devolve { foto, miniatura, original } em JPEG; lança erro se o formato não abrir
export async function comprimirFoto(arquivo) {
  let img;
  try { img = await abrirImagem(arquivo); } catch {
    throw new Error(`Não deu para abrir "${arquivo.name}". Tire a foto pela câmera do app ou envie em JPG.`);
  }
  const foto = await desenhar(img, FOTO_LADO, FOTO_QUALIDADE);
  const miniatura = await desenhar(img, MINI_LADO, MINI_QUALIDADE);
  img.close?.();
  return { foto, miniatura, original: arquivo.size };
}

// Confere duração e tamanho do vídeo; devolve { duracao } ou lança erro com mensagem amigável
export function conferirVideo(arquivo) {
  return new Promise((ok, erro) => {
    if (arquivo.size > VIDEO_MAX_MB * 1024 * 1024) {
      erro(new Error(`O vídeo tem ${Math.round(arquivo.size / 1048576)} MB. O máximo é ${VIDEO_MAX_MB} MB: grave mais curto ou em 720p.`));
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const fim = (fn) => { URL.revokeObjectURL(url); fn(); };
    v.onloadedmetadata = () => fim(() => {
      const d = v.duration;
      if (Number.isFinite(d) && d > VIDEO_MAX_SEG + 1) erro(new Error(`O vídeo tem ${Math.round(d)} segundos. O máximo é ${VIDEO_MAX_SEG} segundos.`));
      else ok({ duracao: Number.isFinite(d) ? Math.round(d) : null });
    });
    v.onerror = () => fim(() => ok({ duracao: null })); // formato que o navegador não lê (ex.: alguns .mov): aceita pelo tamanho
    v.src = url;
  });
}

export const tamanho = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
