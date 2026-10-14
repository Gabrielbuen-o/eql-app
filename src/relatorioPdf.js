// Monta os PDFs dos relatórios de obra: modelo EQL (todos os relatórios) e
// modelo American Tower (ancoragem: uma parte por base, fotos em pares "Foto 01: legenda").
import { A4, novoPdf } from './pdf.js';

const AZUL = [4, 107, 210];
const TINTA = [22, 24, 29];
const CINZA = [107, 114, 128];
const FUNDO = [243, 245, 248];
const LINHA = [218, 222, 228];
const PRETO = [0, 0, 0];

// Baixa a imagem e reduz para o PDF não ficar pesado (sai em JPEG, fundo branco)
export async function prepararImagem(url, maxLado = 1280, qualidade = 0.8) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Não deu para baixar uma das fotos. Confira a internet e tente de novo.');
  const bmp = await createImageBitmap(await r.blob());
  const esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * esc)), h = Math.max(1, Math.round(bmp.height * esc));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const jpg = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', qualidade));
  return { bytes: new Uint8Array(await jpg.arrayBuffer()), w, h };
}

const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dd = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------
// Modelo EQL
// cab: { tipo, titulo }  info: [[rótulo, valor]]  secoes: [{ titulo, sub, fotos: [{ img, legenda, detalhe }] }]
// ---------------------------------------------------------------------
export function pdfEql({ cab, info, observacao, secoes, logo, rodape }) {
  const doc = novoPdf({ titulo: cab.titulo, autor: 'EQL Group' });
  const M = 36, CW = A4.w - M * 2, BASE = A4.h - 40;
  const logoId = logo ? doc.registrarImagem(logo) : null;
  let y = 0;

  const topoCompleto = () => {
    doc.pagina();
    if (logoId) doc.imagemCaber(logoId, M, 30, 44, 44);
    doc.texto('EQL Group', M + 54, 48, { tam: 15, negrito: true, cor: TINTA });
    doc.texto('Toda obra sob controle', M + 54, 62, { tam: 8.5, cor: CINZA });
    doc.texto('RELATÓRIO FOTOGRÁFICO', A4.w - M, 44, { tam: 7.5, negrito: true, cor: AZUL, alinhar: 'dir' });
    const tl = doc.quebrar(cab.titulo, 300, 14, true).slice(0, 2);
    tl.forEach((l, i) => doc.texto(l, A4.w - M, 61 + i * 16, { tam: 14, negrito: true, cor: TINTA, alinhar: 'dir' }));
    y = 61 + (tl.length - 1) * 16 + 14;
    doc.linha(M, y, A4.w - M, y, { cor: AZUL, esp: 2 });
    y += 12;
  };
  const topoSimples = () => {
    doc.pagina();
    if (logoId) doc.imagemCaber(logoId, M, 24, 22, 22);
    doc.texto('EQL Group', M + 28, 39, { tam: 10, negrito: true, cor: TINTA });
    doc.texto(cab.titulo, A4.w - M, 39, { tam: 9, negrito: true, cor: CINZA, alinhar: 'dir' });
    doc.linha(M, 52, A4.w - M, 52, { cor: AZUL, esp: 1.2 });
    y = 64;
  };
  const caber = (h) => { if (y + h > BASE) topoSimples(); };

  topoCompleto();

  // quadro de informações (2 colunas)
  const itens = info.filter(([, v]) => v != null && String(v).trim() !== '');
  if (itens.length) {
    const colW = (CW - 24) / 2;
    const linhas = [];
    for (let i = 0; i < itens.length; i += 2) linhas.push(itens.slice(i, i + 2));
    const alturas = linhas.map((par) => Math.max(...par.map(([, v]) => doc.quebrar(v, colW, 9.5, true).length)) * 12 + 14);
    const h = alturas.reduce((a, b) => a + b, 0) + 12;
    doc.retangulo(M, y, CW, h, { preenche: FUNDO, raio: 8 });
    let yy = y + 10;
    linhas.forEach((par, li) => {
      par.forEach(([rot, v], ci) => {
        const x = M + 12 + ci * (colW + 0);
        doc.texto(String(rot).toUpperCase(), x, yy + 7, { tam: 6.5, negrito: true, cor: CINZA });
        doc.paragrafo(v, x, yy + 19, colW - 8, { tam: 9.5, negrito: true, cor: TINTA, entre: 1.25 });
      });
      yy += alturas[li];
    });
    y += h + 12;
  }
  if (observacao && observacao.trim()) {
    const ls = doc.quebrar(observacao.trim(), CW - 24, 9.5);
    const h = ls.length * 12 + 26;
    caber(h);
    doc.retangulo(M, y, CW, h, { borda: LINHA, raio: 8 });
    doc.texto('OBSERVAÇÃO', M + 12, y + 14, { tam: 6.5, negrito: true, cor: CINZA });
    ls.forEach((l, i) => doc.texto(l, M + 12, y + 28 + i * 12, { tam: 9.5, cor: TINTA }));
    y += h + 14;
  }

  // fotos: 2 por linha
  const GAP = 14, FW = (CW - GAP) / 2, FH = 188;
  let n = 0;
  secoes.forEach((s) => {
    if (!s.fotos.length) return;
    caber(22 + FH + 44);
    doc.retangulo(M, y, 3, 14, { preenche: AZUL });
    doc.texto(s.titulo, M + 10, y + 11, { tam: 11, negrito: true, cor: TINTA });
    if (s.sub) doc.texto(s.sub, A4.w - M, y + 11, { tam: 8, cor: CINZA, alinhar: 'dir' });
    y += 22;
    for (let i = 0; i < s.fotos.length; i += 2) {
      const par = s.fotos.slice(i, i + 2);
      const alt = Math.max(...par.map((f) => (f.legenda ? Math.min(2, doc.quebrar(f.legenda, FW, 8.5).length) * 10.5 : 0) + (f.detalhe ? 10 : 0)));
      caber(FH + 22 + alt);
      par.forEach((f, k) => {
        const x = M + k * (FW + GAP);
        n++;
        doc.retangulo(x, y, FW, FH, { preenche: FUNDO });
        doc.imagemCaber(doc.registrarImagem(f.img), x, y, FW, FH);
        let yy = y + FH + 12;
        doc.texto(`Foto ${dd(n)}`, x, yy, { tam: 8.5, negrito: true, cor: AZUL });
        yy += 11;
        if (f.legenda) yy = doc.paragrafo(f.legenda, x, yy, FW, { tam: 8.5, cor: TINTA, maxLinhas: 2, entre: 1.23 });
        if (f.detalhe) doc.texto(f.detalhe, x, yy, { tam: 7.5, cor: CINZA });
      });
      y += FH + 22 + alt + 6;
    }
    y += 4;
  });

  // rodapé em todas as páginas
  const total = doc.totalPaginas;
  for (let i = 0; i < total; i++) {
    doc.irPara(i);
    doc.linha(M, A4.h - 30, A4.w - M, A4.h - 30, { cor: LINHA, esp: 0.5 });
    doc.texto(rodape || `EQL Group · gerado em ${agora()}`, M, A4.h - 19, { tam: 7, cor: CINZA });
    doc.texto(`Página ${i + 1} de ${total}`, A4.w - M, A4.h - 19, { tam: 7, cor: CINZA, alinhar: 'dir' });
  }
  return doc.gerar();
}

// ---------------------------------------------------------------------
// Modelo American Tower (ancoragem)
// campos: { site, data, endereco, operadora, supervisor, contratada }
// bases: [{ sigla, nome, fotos: [{ img, legenda }] }]
// ---------------------------------------------------------------------
export function pdfAmericanTower({ campos, bases, logo }) {
  const doc = novoPdf({ titulo: `Relatório fotográfico · ${campos.site || ''}`, autor: campos.contratada || 'EQL Group' });
  const X0 = 40, TW = A4.w - 80, MEIO = X0 + TW / 2, BASE = A4.h - 36;
  const logoId = logo ? doc.registrarImagem(logo) : null;
  const B = { borda: PRETO, esp: 0.75 };
  let y = 0;

  const cabecalho = (base, completo) => {
    doc.pagina();
    y = 36;
    // logo + título
    doc.retangulo(X0, y, TW, 58, B);
    if (logoId) doc.imagemCaber(logoId, X0 + 8, y + 5, 110, 48);
    doc.texto('RELATÓRIO FOTOGRÁFICO PARA RECEBIMENTO', X0 + TW / 2 + 40, y + 27, { tam: 8.5, negrito: true, alinhar: 'centro' });
    doc.texto('DE SERVIÇOS EM SITES ROOFTOP - BTS - RDS - DAS', X0 + TW / 2 + 40, y + 38, { tam: 8.5, negrito: true, alinhar: 'centro' });
    y += 58;
    if (completo) {
      const pares = [
        [`Site (ID ATC): ${campos.site || ''}`, `Data do relatório: ${campos.data || ''}`],
        [`Endereço: ${campos.endereco || ''}`, `Operadora: ${campos.operadora || ''}`],
        [`Supervisor: ${campos.supervisor || ''}`, `Contratada: ${campos.contratada || ''}`],
      ];
      pares.forEach(([a, b]) => {
        const la = doc.quebrar(a, TW / 2 - 8, 8, true), lb = doc.quebrar(b, TW / 2 - 8, 8, true);
        const h = Math.max(16, Math.max(la.length, lb.length) * 10 + 6);
        doc.retangulo(X0, y, TW / 2, h, B);
        doc.retangulo(MEIO, y, TW / 2, h, B);
        la.forEach((l, i) => doc.texto(l, X0 + 4, y + 11 + i * 10, { tam: 8, negrito: true }));
        lb.forEach((l, i) => doc.texto(l, MEIO + 4, y + 11 + i * 10, { tam: 8, negrito: true }));
        y += h;
      });
    }
    // qual base
    doc.retangulo(X0, y, TW, 16, { ...B, preenche: [230, 230, 230] });
    doc.texto(`${base.sigla}${base.nome ? ' · ' + base.nome : ''}${completo ? '' : ' (continuação)'}`, X0 + 4, y + 11, { tam: 8.5, negrito: true });
    y += 16;
  };

  const FH = 165, RH = 13;
  bases.forEach((base) => {
    if (!base.fotos.length) return;
    cabecalho(base, true);
    for (let i = 0; i < base.fotos.length; i += 2) {
      const par = base.fotos.slice(i, i + 2);
      const capH = Math.max(28, ...par.map((f) => Math.min(4, doc.quebrar(f.legenda || '', TW / 2 - 12, 7.5).length) * 9 + 8));
      const alt = FH + RH + capH;
      if (y + alt > BASE) cabecalho(base, false);
      [0, 1].forEach((k) => {
        const x = k ? MEIO : X0;
        const f = par[k];
        doc.retangulo(x, y, TW / 2, FH, B);
        doc.retangulo(x, y + FH, TW / 2, RH, B);
        doc.retangulo(x, y + FH + RH, TW / 2, capH, B);
        if (!f) return;
        doc.imagemCaber(doc.registrarImagem(f.img), x + 3, y + 3, TW / 2 - 6, FH - 6);
        doc.texto(`Foto ${dd(i + k + 1)}:`, x + 4, y + FH + 9.5, { tam: 8 });
        const ls = doc.quebrar(f.legenda || '', TW / 2 - 12, 7.5).slice(0, 4);
        const y0 = y + FH + RH + (capH - ls.length * 9) / 2 + 7;
        ls.forEach((l, j) => doc.texto(l, x + TW / 4, y0 + j * 9, { tam: 7.5, alinhar: 'centro' }));
      });
      y += alt;
    }
  });
  return doc.gerar();
}
