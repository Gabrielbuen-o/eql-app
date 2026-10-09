// RFI no modelo oficial (planilha em public/modelos/rfi.xlsx).
// Abre o modelo, preenche o cabeçalho e coloca cada foto no seu lugar (FOTO 01 … FOTO 46),
// sem mexer em mais nada do arquivo (logos, bordas, impressão continuam iguais).
import { montarZip } from './zip.js';

const MODELO = '/modelos/rfi.xlsx';

// Cabeçalho do modelo: campo → célula
export const CAMPOS_RFI = [
  { id: 'cliente', rotulo: 'Cliente', cel: 'F9', padrao: 'CLARO' },
  { id: 'id_cliente', rotulo: 'ID Cliente (site)', cel: 'P9' },
  { id: 'id_towerco', rotulo: 'ID TowerCo', cel: 'W9' },
  { id: 'endereco', rotulo: 'Endereço', cel: 'F10', largo: true },
  { id: 'data', rotulo: 'Data de RFI', cel: 'W10' },
  { id: 'bairro', rotulo: 'Bairro', cel: 'F11' },
  { id: 'municipio', rotulo: 'Município', cel: 'W11' },
  { id: 'uf', rotulo: 'UF', cel: 'AB11', curto: true },
  { id: 'tipo_site', rotulo: 'Tipo de site', cel: 'F12', padrao: 'RT' },
  { id: 'altura', rotulo: 'Altura (m)', cel: 'P12' },
  { id: 'medidor', rotulo: 'Nº do medidor', cel: 'W12' },
  { id: 'pendencia', rotulo: 'Pendência', cel: 'F13', padrao: 'NÃO', opcoes: ['NÃO', 'SIM'] },
  { id: 'descricao', rotulo: 'Descrição da pendência', cel: 'P13', largo: true },
  { id: 'prazo', rotulo: 'Prazo de regularização', cel: 'F14' },
];

export function camposIniciais(r, obra) {
  const c = { ...(r.campos || {}) };
  for (const f of CAMPOS_RFI) if (c[f.id] == null && f.padrao) c[f.id] = f.padrao;
  if (c.id_cliente == null && obra?.nome) c.id_cliente = obra.nome;
  if (c.data == null && r.dia) c.data = r.dia.split('-').reverse().join('/');
  return c;
}

export function nomeArquivoRfi(r, obra, campos) {
  const site = (campos.id_cliente || obra?.nome || 'SITE').trim();
  const cliente = (campos.cliente || 'CLARO').trim().toUpperCase();
  const limpo = (t) => t.replace(/[\\/:*?"<>|]+/g, '-');
  return limpo(`RT - ${site} RFI ${cliente} COLLO ${(r.dia || '').replaceAll('-', '')}.xlsx`);
}

// ---------- ler o .xlsx (é um .zip) ----------
async function lerZip(buf) {
  const v = new DataView(buf);
  let fim = buf.byteLength - 22;
  while (fim >= 0 && v.getUint32(fim, true) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error('Modelo do RFI inválido.');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < total; i++) {
    const metodo = v.getUint16(p + 10, true);
    const tam = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(new Uint8Array(buf, p + 46, nl));
    p += 46 + nl + el + cl;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const bruto = new Uint8Array(buf, ini, tam);
    let dados;
    if (metodo === 0) dados = bruto.slice();
    else if (metodo === 8) dados = new Uint8Array(await new Response(new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error('Modelo do RFI em formato não suportado.');
    out.push({ nome, dados });
  }
  return out;
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// escreve texto numa célula, mantendo o estilo (bordas, fonte) do modelo
function setCelula(xml, ref, texto) {
  const re = new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)\\s*(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_, attrs) => {
    const s = (attrs.match(/ s="\d+"/) || [''])[0];
    if (texto === '' || texto == null) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(texto)}</t></is></c>`;
  });
}

const colNum = (letras) => [...letras].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); // A=1

function medidas(xml) {
  const fmt = xml.match(/<sheetFormatPr([^>]*)>/)?.[1] || '';
  const padraoAlt = Number(fmt.match(/defaultRowHeight="([\d.]+)"/)?.[1] || 15);
  const padraoLarg = Number(fmt.match(/defaultColWidth="([\d.]+)"/)?.[1] || 8.43);
  const larg = {};
  for (const m of xml.matchAll(/<col ([^>]*)\/>/g)) {
    const a = m[1], min = Number(a.match(/min="(\d+)"/)[1]), max = Number(a.match(/max="(\d+)"/)[1]), w = Number(a.match(/width="([\d.]+)"/)?.[1] || padraoLarg);
    for (let i = min; i <= Math.min(max, 200); i++) larg[i] = w;
  }
  const alt = {};
  for (const m of xml.matchAll(/<row r="(\d+)"([^>]*)>/g)) { const h = m[2].match(/ ht="([\d.]+)"/); if (h) alt[Number(m[1])] = Number(h[1]); }
  const colPx = (c) => Math.trunc(((256 * (larg[c] ?? padraoLarg) + Math.trunc(128 / 7)) / 256) * 7);
  const rowPx = (r) => ((alt[r] ?? padraoAlt) * 96) / 72;
  return { colPx, rowPx };
}

// espaços das fotos: áreas mescladas de 13 linhas (B:N à esquerda, Q:AC à direita), na ordem do relatório
function espacos(xml) {
  const out = [];
  for (const m of xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)) {
    const [c0, r0, c1, r1] = [colNum(m[1]), Number(m[2]), colNum(m[3]), Number(m[4])];
    if (r1 - r0 >= 10 && r0 > 20 && c1 - c0 >= 10) out.push({ c0, r0, c1, r1 });
  }
  return out.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
}

// foto do relatório → JPEG leve para a planilha (até 1000 px)
async function prepararFoto(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Não deu para baixar uma das fotos.');
  const bmp = await createImageBitmap(await resp.blob());
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

const EMU = 9525;
function ancora({ col, colOff, row, rowOff, cx, cy, id, rid, nome }) {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>`
    + `<xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${esc(nome)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
    + `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
    + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

// gera a planilha preenchida. Retorna { blob, nome, colocadas, sobraram }
export async function gerarRfiXlsx({ r, obra, campos, etapas, urlArquivo, progresso = () => {} }) {
  progresso('Abrindo o modelo…');
  const resp = await fetch(MODELO);
  if (!resp.ok) throw new Error('Não encontrei o modelo do RFI.');
  const arquivos = await lerZip(await resp.arrayBuffer());
  const pega = (n) => arquivos.find((a) => a.nome === n);
  const txt = (n) => new TextDecoder().decode(pega(n).dados);
  const poe = (n, conteudo) => {
    const dados = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo;
    const a = pega(n); if (a) a.dados = dados; else arquivos.push({ nome: n, dados });
  };

  // cabeçalho
  let sheet = txt('xl/worksheets/sheet1.xml');
  for (const f of CAMPOS_RFI) sheet = setCelula(sheet, f.cel, campos[f.id] ?? '');

  // fotos nos espaços: etapas na ordem do modelo, cada uma com a quantidade recomendada de espaços
  const lugares = espacos(sheet);
  const { colPx, rowPx } = medidas(sheet);
  const fotos = (r.arquivos || []).filter((a) => a.tipo !== 'video');
  const plano = [];
  let k = 0, sobraram = 0;
  for (const e of etapas) {
    const fs = fotos.filter((a) => a.etapa === e.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    for (let j = 0; j < e.rec; j++, k++) if (fs[j] && lugares[k]) plano.push({ lugar: lugares[k], foto: fs[j], etapa: e });
    sobraram += Math.max(0, fs.length - e.rec);
  }

  let drawing = txt('xl/drawings/drawing1.xml');
  let rels = txt('xl/drawings/_rels/drawing1.xml.rels');
  const novas = [], novasRels = [];
  for (const [i, p] of plano.entries()) {
    progresso(`Colocando as fotos… ${i + 1} de ${plano.length}`);
    const img = await prepararFoto(urlArquivo(p.foto.caminho));
    const { c0, r0, c1, r1 } = p.lugar;
    let W = 0; for (let c = c0; c <= c1; c++) W += colPx(c);
    let H = 0; for (let rr = r0; rr <= r1; rr++) H += rowPx(rr);
    const margem = 6;
    const esc2 = Math.min((W - 2 * margem) / img.w, (H - 2 * margem) / img.h);
    const w = img.w * esc2, h = img.h * esc2;
    // posição centralizada dentro da área
    let x = (W - w) / 2, col = c0;
    while (col < c1 && x >= colPx(col)) { x -= colPx(col); col++; }
    let y = (H - h) / 2, row = r0;
    while (row < r1 && y >= rowPx(row)) { y -= rowPx(row); row++; }
    const nomeMidia = `rfi-foto-${String(i + 1).padStart(2, '0')}.jpeg`;
    poe(`xl/media/${nomeMidia}`, img.bytes);
    const rid = `rIdFoto${i + 1}`;
    novasRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${nomeMidia}"/>`);
    novas.push(ancora({
      col: col - 1, colOff: Math.round(x * EMU), row: row - 1, rowOff: Math.round(y * EMU),
      cx: Math.round(w * EMU), cy: Math.round(h * EMU), id: 1000 + i, rid, nome: `Foto ${i + 1} - ${p.etapa.nome}`,
    }));
  }
  drawing = drawing.replace('</xdr:wsDr>', novas.join('') + '</xdr:wsDr>');
  rels = rels.replace('</Relationships>', novasRels.join('') + '</Relationships>');
  poe('xl/drawings/drawing1.xml', drawing);
  poe('xl/drawings/_rels/drawing1.xml.rels', rels);
  poe('xl/worksheets/sheet1.xml', sheet);

  // nome da aba = data do RFI (o modelo vem como "DD-MM-AAAA")
  const aba = (r.dia || '').split('-').reverse().join('-') || 'RFI';
  poe('xl/workbook.xml', txt('xl/workbook.xml').replaceAll('DD-MM-AAAA', aba));
  if (pega('docProps/app.xml')) poe('docProps/app.xml', txt('docProps/app.xml').replaceAll('DD-MM-AAAA', aba));
  const ct = txt('[Content_Types].xml');
  if (!/Extension="jpeg"/i.test(ct)) poe('[Content_Types].xml', ct.replace('<Default Extension="xml"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="xml"'));

  progresso('Montando a planilha…');
  const zip = await montarZip(arquivos.map((a) => ({ nome: a.nome, blob: new Blob([a.dados]) })));
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, nome: nomeArquivoRfi(r, obra, campos), colocadas: plano.length, espacos: lugares.length, sobraram };
}
