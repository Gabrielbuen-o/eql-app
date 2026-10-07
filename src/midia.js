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

function desenharCanvas(fonte, lado) {
  const w0 = fonte.width || fonte.naturalWidth || fonte.videoWidth, h0 = fonte.height || fonte.naturalHeight || fonte.videoHeight;
  const escala = Math.min(1, lado / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * escala));
  c.height = Math.max(1, Math.round(h0 * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}
const paraBlob = (c, q) => new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('falha ao comprimir'))), 'image/jpeg', q));
const desenhar = (fonte, lado, q) => paraBlob(desenharCanvas(fonte, lado), q);

// Ao escolher/tirar a foto: reduz já (para não pesar a memória do celular) e guarda a miniatura de prévia.
// O carimbo (data, hora, obra, local) é aplicado na hora de enviar, quando obra e nome já estão definidos.
export async function comprimirFoto(arquivo) {
  let img;
  try { img = await abrirImagem(arquivo); } catch {
    throw new Error(`Não deu para abrir "${arquivo.name || 'a foto'}". Tire a foto pela câmera do app ou envie em JPG.`);
  }
  const base = await desenhar(img, FOTO_LADO, 0.88);
  const miniatura = await desenhar(img, MINI_LADO, MINI_QUALIDADE);
  img.close?.();
  return { base, miniatura, original: arquivo.size };
}

// Grava o carimbo no rodapé da foto. linhas: [principal, ...secundárias]
export async function carimbar(base, linhas) {
  const img = await abrirImagem(base);
  const c = desenharCanvas(img, FOTO_LADO);
  img.close?.();
  desenharCarimbo(c.getContext('2d'), c.width, c.height, linhas);
  const foto = await paraBlob(c, FOTO_QUALIDADE);
  const miniatura = await desenhar(c, MINI_LADO, MINI_QUALIDADE);
  return { foto, miniatura };
}


// Desenha a faixa do carimbo (usada nas fotos e, quadro a quadro, nos vídeos gravados no app)
export function desenharCarimbo(ctx, W, H, linhas) {
  const u = Math.max(W, H) / 100;                 // unidade proporcional ao tamanho da foto
  const f1 = Math.round(Math.max(16, u * 2.5));   // data e hora
  const f2 = Math.round(Math.max(12, u * 1.6));   // demais linhas
  const pad = Math.round(f2 * 0.9), gap = Math.round(f2 * 0.35);
  const alturaTexto = f1 + linhas.slice(1).length * (f2 + gap) + gap;
  const faixa = alturaTexto + pad * 2;
  const g = ctx.createLinearGradient(0, H - faixa * 1.5, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - faixa * 1.5, W, faixa * 1.5);
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = Math.round(u * 0.3);
  let y = H - pad - (linhas.length - 1) * (f2 + gap);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${f1}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
  ctx.fillText(linhas[0], pad, y - gap);
  ctx.font = `600 ${f2}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
  linhas.slice(1).forEach((l) => { y += f2 + gap; ctx.fillText(l, pad, y - gap, W - pad * 2); });
  // marca discreta à direita
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.85;
  ctx.font = `800 ${f2}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillText('EQL Group', W - pad, H - pad - gap);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.shadowBlur = 0;
}

// Lê data/hora original e GPS do EXIF de um JPEG (fotos da galeria). Devolve {} se não tiver.
export async function lerExif(arquivo) {
  try {
    const buf = new DataView(await arquivo.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xFFD8) return {};
    let p = 2;
    while (p + 4 < buf.byteLength) {
      const marca = buf.getUint16(p), tam = buf.getUint16(p + 2);
      if (marca === 0xFFE1 && buf.getUint32(p + 4) === 0x45786966) return exifTiff(buf, p + 10);
      if ((marca & 0xFF00) !== 0xFF00) break;
      p += 2 + tam;
    }
  } catch { /* sem EXIF */ }
  return {};
}
function exifTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
  const ascii = (o, n) => { let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; };
  const ler = (ifd) => {
    const out = {}; const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = u16(e), tipo = u16(e + 2), cont = u32(e + 4);
      const val = cont * ({ 2: 1, 5: 8, 10: 8, 3: 2, 4: 4 }[tipo] || 1) > 4 ? u32(e + 8) : e + 8;
      if (tipo === 2) out[tag] = ascii(val, cont);
      else if (tipo === 5) out[tag] = Array.from({ length: cont }, (_, k) => u32(val + k * 8) / (u32(val + k * 8 + 4) || 1));
      else if (tipo === 3) out[tag] = u16(e + 8);
      else if (tipo === 4) out[tag] = u32(e + 8);
    }
    return out;
  };
  const ifd0 = ler(u32(4));
  const res = {};
  const exif = ifd0[0x8769] ? ler(ifd0[0x8769]) : {};
  const dt = exif[0x9003] || exif[0x9004] || ifd0[0x0132];
  const m = dt && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (m) res.quando = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (ifd0[0x8825]) {
    const g = ler(ifd0[0x8825]);
    const gr = (a) => a && a[0] + a[1] / 60 + a[2] / 3600;
    if (g[2] && g[4]) {
      res.lat = gr(g[2]) * (g[1] === 'S' ? -1 : 1);
      res.lon = gr(g[4]) * (g[3] === 'W' ? -1 : 1);
    }
  }
  return res;
}

// Texto curto para as coordenadas (vai no carimbo)
export const coordTexto = (lat, lon, prec) =>
  `${lat.toFixed(5).replace('.', ',')}, ${lon.toFixed(5).replace('.', ',')}${prec ? ` (±${Math.round(prec)} m)` : ''}`;
export const linkMapa = (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`;

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
