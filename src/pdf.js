// Gerador de PDF próprio e enxuto (sem biblioteca): páginas A4, texto em Helvetica,
// retângulos, linhas e fotos JPEG. Coordenadas em pontos, a partir do canto SUPERIOR esquerdo.

// larguras das letras da Helvetica (código 32 a 255, Windows-1252), em milésimos do tamanho
const L_REG = '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500';
const L_BOLD = '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556';
const LARG = { F1: L_REG.split(',').map(Number), F2: L_BOLD.split(',').map(Number) };

// caracteres fora do Latin-1 que existem na tabela Windows-1252
const CP1252 = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
function codigo(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c < 127) return c;
  if (c >= 160 && c <= 255) return c;
  if (CP1252[ch]) return CP1252[ch];
  if (ch === '\u2212') return 45; // sinal de menos
  if (c === 9) return 32;
  return 63; // "?"
}
const bytesTexto = (t) => Array.from(String(t ?? ''), codigo);

export const A4 = { w: 595.28, h: 841.89 };
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const cor = (c) => (c || [0, 0, 0]).map((x) => n2(x / 255)).join(' ');

export function novoPdf({ titulo = 'Relatório', autor = 'EQL Group' } = {}) {
  const paginas = []; // { partes: [string] }
  const imagens = []; // { bytes, w, h }
  let atual = null;

  const doc = {
    largura(texto, tam = 10, negrito = false) {
      const tab = LARG[negrito ? 'F2' : 'F1'];
      return bytesTexto(texto).reduce((t, b) => t + (tab[b - 32] || 556), 0) * tam / 1000;
    },
    // quebra o texto em linhas que caibam na largura (respeita quebras de linha)
    quebrar(texto, larguraMax, tam = 10, negrito = false) {
      const linhas = [];
      String(texto ?? '').split(/\r?\n/).forEach((par) => {
        let linha = '';
        par.split(/\s+/).filter(Boolean).forEach((pal) => {
          const tenta = linha ? linha + ' ' + pal : pal;
          if (doc.largura(tenta, tam, negrito) <= larguraMax) { linha = tenta; return; }
          if (linha) linhas.push(linha);
          // palavra maior que a linha: corta
          let p = pal;
          while (doc.largura(p, tam, negrito) > larguraMax && p.length > 1) {
            let k = p.length - 1;
            while (k > 1 && doc.largura(p.slice(0, k), tam, negrito) > larguraMax) k--;
            linhas.push(p.slice(0, k)); p = p.slice(k);
          }
          linha = p;
        });
        linhas.push(linha);
      });
      return linhas;
    },
    pagina() { atual = { partes: [] }; paginas.push(atual); return paginas.length - 1; },
    irPara(i) { atual = paginas[i]; },
    get totalPaginas() { return paginas.length; },
    // y = linha de base do texto, medida de cima
    texto(t, x, y, { tam = 10, negrito = false, cor: c, alinhar = 'esq' } = {}) {
      const bs = bytesTexto(t);
      if (!bs.length) return;
      const w = doc.largura(t, tam, negrito);
      const x0 = alinhar === 'centro' ? x - w / 2 : alinhar === 'dir' ? x - w : x;
      const esc = bs.map((b) => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : String.fromCharCode(b))).join('');
      atual.partes.push(`BT /${negrito ? 'F2' : 'F1'} ${n2(tam)} Tf ${cor(c)} rg ${n2(x0)} ${n2(A4.h - y)} Td (${esc}) Tj ET`);
    },
    // várias linhas; devolve o y depois da última
    paragrafo(t, x, y, larguraMax, { tam = 10, negrito = false, cor: c, alinhar = 'esq', entre = 1.25, maxLinhas = 99 } = {}) {
      let linhas = doc.quebrar(t, larguraMax, tam, negrito);
      if (linhas.length > maxLinhas) { linhas = linhas.slice(0, maxLinhas); linhas[maxLinhas - 1] = linhas[maxLinhas - 1].replace(/.{0,2}$/, '…'); }
      const xx = alinhar === 'centro' ? x + larguraMax / 2 : alinhar === 'dir' ? x + larguraMax : x;
      linhas.forEach((l, i) => doc.texto(l, xx, y + i * tam * entre, { tam, negrito, cor: c, alinhar }));
      return y + linhas.length * tam * entre;
    },
    retangulo(x, y, w, h, { borda, preenche, esp = 0.75, raio = 0 } = {}) {
      const p = [];
      if (preenche) p.push(`${cor(preenche)} rg`);
      if (borda) p.push(`${cor(borda)} RG ${n2(esp)} w`);
      const op = preenche && borda ? 'B' : preenche ? 'f' : 'S';
      if (raio > 0) {
        const r = Math.min(raio, w / 2, h / 2), k = 0.5523 * r, X = x, Y = A4.h - y - h;
        p.push(`${n2(X + r)} ${n2(Y)} m ${n2(X + w - r)} ${n2(Y)} l ${n2(X + w - r + k)} ${n2(Y)} ${n2(X + w)} ${n2(Y + r - k)} ${n2(X + w)} ${n2(Y + r)} c`,
          `${n2(X + w)} ${n2(Y + h - r)} l ${n2(X + w)} ${n2(Y + h - r + k)} ${n2(X + w - r + k)} ${n2(Y + h)} ${n2(X + w - r)} ${n2(Y + h)} c`,
          `${n2(X + r)} ${n2(Y + h)} l ${n2(X + r - k)} ${n2(Y + h)} ${n2(X)} ${n2(Y + h - r + k)} ${n2(X)} ${n2(Y + h - r)} c`,
          `${n2(X)} ${n2(Y + r)} l ${n2(X)} ${n2(Y + r - k)} ${n2(X + r - k)} ${n2(Y)} ${n2(X + r)} ${n2(Y)} c h ${op}`);
      } else p.push(`${n2(x)} ${n2(A4.h - y - h)} ${n2(w)} ${n2(h)} re ${op}`);
      atual.partes.push('q ' + p.join(' ') + ' Q');
    },
    linha(x1, y1, x2, y2, { cor: c, esp = 0.75 } = {}) {
      atual.partes.push(`q ${cor(c)} RG ${n2(esp)} w ${n2(x1)} ${n2(A4.h - y1)} m ${n2(x2)} ${n2(A4.h - y2)} l S Q`);
    },
    // imagem: { bytes (JPEG), w, h } — registra uma vez e reaproveita
    registrarImagem(img) { imagens.push(img); return imagens.length; },
    imagem(id, x, y, w, h) {
      atual.partes.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(A4.h - y - h)} cm /Im${id} Do Q`);
      (atual.usadas ||= new Set()).add(id);
    },
    // coloca a imagem inteira dentro da caixa, centralizada (sem cortar)
    imagemCaber(id, x, y, w, h) {
      const img = imagens[id - 1];
      const esc = Math.min(w / img.w, h / img.h);
      const iw = img.w * esc, ih = img.h * esc;
      doc.imagem(id, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    },

    gerar() {
      const enc = new TextEncoder();
      const partes = [];
      let tam = 0;
      const offsets = [];
      const push = (u8) => { partes.push(u8); tam += u8.length; };
      const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
      const obj = (n, corpo, stream) => {
        offsets[n] = tam;
        push(enc.encode(`${n} 0 obj\n`));
        if (stream) {
          push(latin1(corpo + `\nstream\n`)); push(stream); push(enc.encode('\nendstream'));
        } else push(latin1(corpo));
        push(enc.encode('\nendobj\n'));
      };
      push(latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
      // 1 catálogo · 2 páginas · 3 Helvetica · 4 Helvetica-Bold · 5 info · 6.. imagens · depois páginas e conteúdos
      const nImg0 = 6;
      const nPag0 = nImg0 + imagens.length;
      const kids = paginas.map((_, i) => `${nPag0 + i * 2} 0 R`).join(' ');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const strPdf = (t) => '(' + bytesTexto(t).map((b) => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : String.fromCharCode(b))).join('') + ')';
      obj(5, `<< /Title ${strPdf(titulo)} /Author ${strPdf(autor)} /Producer (EQL Group) >>`);
      imagens.forEach((img, i) => obj(nImg0 + i,
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`, img.bytes));
      paginas.forEach((pg, i) => {
        const np = nPag0 + i * 2, nc = np + 1;
        const xo = [...(pg.usadas || [])].map((id) => `/Im${id} ${nImg0 + id - 1} 0 R`).join(' ');
        obj(np, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ' /XObject << ' + xo + ' >>' : ''} >> /Contents ${nc} 0 R >>`);
        const conteudo = latin1(pg.partes.join('\n'));
        obj(nc, `<< /Length ${conteudo.length} >>`, conteudo);
      });
      const total = nPag0 + paginas.length * 2;
      const xref = tam;
      let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
      for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      push(enc.encode(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
      return new Blob(partes, { type: 'application/pdf' });
    },
  };
  return doc;
}
