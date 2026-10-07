// Monta um .zip simples (sem compressão — fotos e vídeos já são comprimidos) no próprio navegador.
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dataDos(d) {
  const t = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [t, dd];
}

// arquivos: [{ nome, blob }] → Blob (application/zip)
export async function montarZip(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let offset = 0;
  const [hora, dia] = dataDos(new Date());
  for (const { nome, blob } of arquivos) {
    const dados = new Uint8Array(await blob.arrayBuffer());
    const n = enc.encode(nome), crc = crc32(dados);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, hora, true); lh.setUint16(12, dia, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true); lh.setUint16(26, n.length, true); lh.setUint16(28, 0, true);
    partes.push(lh, n, dados);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, hora, true); ch.setUint16(14, dia, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true); ch.setUint16(28, n.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch, n);
    offset += 30 + n.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, offset, true);
  return new Blob([...partes, ...central, fim], { type: 'application/zip' });
}
