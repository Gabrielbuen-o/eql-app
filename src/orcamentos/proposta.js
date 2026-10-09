// Saída COMERCIAL do orçamento: tudo o que o cliente pode ver.
// Apresentação, texto copiado, WhatsApp e PDF usam SÓ este objeto — nada de custos, margens ou limites.
import { brl, fmtM, fmtN } from './muros.js';

const dataBr = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('pt-BR') : '');

export const BENEFICIOS = [
  'Montagem rápida e prática, com menos etapas na obra.',
  'O concreto aparente dispensa reboco e pintura inicial, quando esse acabamento é aceito pelo cliente.',
  'Baixa necessidade de manutenção, com uso adequado e inspeções periódicas.',
];

export function propostaComercial(r, e, p, extra = {}) {
  const com = r.comercial;
  const adicionais = (e.comercial?.adicionais || []).filter((a) => a.cobrado !== false && Number(a.quantidade) * Number(a.preco) > 0)
    .map((a) => ({ descricao: a.descricao || 'Adicional', quantidade: Number(a.quantidade) || 0, unidade: a.unidade || 'un', valor: Math.round(Number(a.quantidade) * Number(a.preco) * 100) / 100 }));
  const c = e.condicoes || {};
  return {
    numero: extra.numero && extra.numero !== 'Novo' ? extra.numero : '', revisao: extra.revisao ?? 0, final: r.final, ok: r.ok,
    cliente: e.cliente, contato: e.contato, telefone: e.telefone, projeto: e.projeto, local: e.local,
    data: dataBr(e.data), validade: dataBr(e.validade), pagamento: e.pagamento, responsavel: extra.responsavel || '',
    altura: r.altura, L: r.qt.L, area: r.qt.area, trechos: r.qt.trechos.map((t) => ({ nome: t.nome, L: t.L })),
    vaos: r.qt.vaos, modular: r.qt.modular, ajuste: r.qt.ajuste,
    placas: r.qt.placas, mouroes: r.qt.mouroes, placasFornecidas: r.qt.placasFornecidas, mouroesFornecidos: r.qt.mouroesFornecidos,
    placaDesc: p.dimensoes?.placa_desc, mouraoDesc: p.dimensoes?.mourao_desc,
    escopo: r.escopo.nome, temMaterial: r.escopo.material, temMontagem: r.escopo.montagem,
    equipes: r.prazo.aplica ? r.prazo.equipes : null, dias: r.prazo.aplica ? r.prazo.dias : null,
    fabricacao: e.prazo?.fabricacao || '', entrega: e.prazo?.entrega || '',
    material: { tabela: com.material.tabela, receita: com.material.receita },
    instalacao: { tabela: com.instalacao.tabela, receita: com.instalacao.receita },
    adicionais, desconto: com.desconto, tabela: com.tabela, total: com.total, porM: com.porM, porM2: com.porM2,
    exclusoes: r.exclusoes, observacoes: e.comercial?.observacoes || '',
    condicoes: [
      e.mouroes_antes && r.escopo.montagem ? 'Montagem com os mourões já implantados e a frente liberada.' : null,
      c.pecas === 'fabricar' ? 'Peças sob encomenda (fabricação conforme prazo informado).' : null,
      c.frente === 'confirmar' ? 'Liberação da frente de trabalho a confirmar.' : null,
    ].filter(Boolean),
    pendencias: r.final ? [] : [...r.erros, ...r.pendencias.map((x) => x.texto)],
  };
}

export function textoProposta(pc, { whatsapp = false } = {}) {
  const b = (t) => (whatsapp ? `*${t}*` : t);
  const linhas = [];
  linhas.push(b(`EQL Group — Proposta de muro pré-moldado${pc.numero ? ` ${pc.numero}${pc.revisao ? ` rev. ${pc.revisao}` : ''}` : ''}`));
  if (!pc.final) linhas.push('(PRÉVIA — sujeita a confirmação dos itens em aberto)');
  linhas.push('');
  if (pc.cliente) linhas.push(`Cliente: ${pc.cliente}`);
  if (pc.projeto) linhas.push(`Projeto: ${pc.projeto}`);
  if (pc.local) linhas.push(`Local: ${pc.local}`);
  linhas.push(`Muro: ${fmtM(pc.L)} × ${fmtM(pc.altura)} (${fmtN(pc.area)} m²)`);
  linhas.push(`Escopo: ${pc.escopo}`);
  const pecas = [];
  if (pc.placasFornecidas) pecas.push(`${pc.placasFornecidas} placas${pc.placaDesc ? ` (${pc.placaDesc})` : ''}`);
  if (pc.mouroesFornecidos) pecas.push(`${pc.mouroesFornecidos} mourões${pc.mouraoDesc ? ` (${pc.mouraoDesc})` : ''}`);
  if (pecas.length) linhas.push(`Fornecimento: ${pecas.join(' e ')}`);
  if (pc.dias) linhas.push(`Montagem: ${pc.equipes} equipe${pc.equipes > 1 ? 's' : ''} · ${pc.dias} dia${pc.dias > 1 ? 's' : ''} ${pc.dias > 1 ? 'úteis' : 'útil'} (prazo de montagem; fabricação e entrega têm cronograma próprio)`);
  if (pc.fabricacao) linhas.push(`Fabricação: ${pc.fabricacao}`);
  if (pc.entrega) linhas.push(`Entrega das peças: ${pc.entrega}`);
  linhas.push('');
  if (pc.material.tabela) linhas.push(`Material: ${brl(pc.material.tabela)}`);
  if (pc.instalacao.tabela) linhas.push(`Montagem das placas: ${brl(pc.instalacao.tabela)}`);
  pc.adicionais.forEach((a) => linhas.push(`${a.descricao}: ${brl(a.valor)}`));
  if (pc.desconto > 0) linhas.push(`Desconto: − ${brl(pc.desconto)}`);
  linhas.push(b(`Total: ${brl(pc.total)}`) + ` (${brl(pc.porM)}/m · ${brl(pc.porM2)}/m²)`);
  linhas.push('');
  if (pc.exclusoes.length) linhas.push(`Não inclui: ${pc.exclusoes.join('; ')}.`);
  pc.condicoes.forEach((c) => linhas.push(c));
  if (pc.pagamento) linhas.push(`Condições de pagamento: ${pc.pagamento}`);
  if (pc.validade) linhas.push(`Validade da proposta: ${pc.validade}`);
  if (pc.observacoes) { linhas.push(''); linhas.push(pc.observacoes); }
  linhas.push('');
  BENEFICIOS.forEach((x) => linhas.push(`• ${x}`));
  return linhas.join('\n');
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// PDF comercial: abre a proposta pronta para "Salvar como PDF" (impressão do navegador)
export function abrirPdf(pc) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const logo = `${location.origin}/img/logo-96.png?v=2`;
  const linha = (rot, val) => `<tr><td>${esc(rot)}</td><td class="v">${val}</td></tr>`;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta ${esc(pc.numero)} — ${esc(pc.cliente || 'EQL')}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; } body { font-family: "Plus Jakarta Sans", system-ui, -apple-system, Arial, sans-serif; color: #16181D; margin: 0; font-size: 12.5px; line-height: 1.45; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #046BD2; padding-bottom: 12px; margin-bottom: 18px; }
  header .marca { display: flex; gap: 10px; align-items: center; } header img { width: 44px; height: 44px; }
  header b { font-size: 18px; } header small { display: block; color: #5F6672; }
  .num { text-align: right; color: #5F6672; } .num b { color: #16181D; font-size: 14px; display: block; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #046BD2; margin: 20px 0 8px; }
  .grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .cx { background: #F3F6FA; border-radius: 8px; padding: 9px 11px; } .cx span { display: block; color: #5F6672; font-size: 11px; } .cx b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 7px 4px; border-bottom: 1px solid #E3E6EA; } td.v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { font-size: 16px; font-weight: 800; border-bottom: 0; padding-top: 10px; } tr.total td.v { color: #046BD2; }
  .sub { color: #5F6672; font-size: 11.5px; text-align: right; }
  ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
  .previa { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: 900; color: rgba(198, 40, 40, .09); transform: rotate(-24deg); pointer-events: none; }
  .aviso { background: #FCE2D6; color: #9A3412; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #E3E6EA; color: #5F6672; font-size: 11px; }
</style></head><body>
${pc.final ? '' : '<div class="previa">PRÉVIA</div>'}
<header><div class="marca"><img src="${logo}" alt=""><div><b>EQL Group</b><small>Muros pré-moldados</small></div></div>
<div class="num"><b>${esc(pc.numero || 'Proposta')}${pc.revisao ? ` · rev. ${pc.revisao}` : ''}</b>${esc(pc.data)}${pc.validade ? ` · válida até ${esc(pc.validade)}` : ''}</div></header>
${pc.final ? '' : `<div class="aviso"><b>Prévia</b> — valores sujeitos à confirmação: ${esc(pc.pendencias.join(' · ') || 'itens em aberto')}</div>`}
<h1>${esc(pc.projeto || 'Muro pré-moldado')}</h1>
<div>${esc([pc.cliente, pc.contato, pc.local].filter(Boolean).join(' · '))}</div>
<h2>A obra</h2>
<div class="grade">
  <div class="cx"><span>Extensão solicitada</span><b>${fmtM(pc.L)}</b></div>
  <div class="cx"><span>Altura</span><b>${fmtM(pc.altura)}</b></div>
  <div class="cx"><span>Área</span><b>${fmtN(pc.area)} m²</b></div>
  <div class="cx"><span>Escopo</span><b style="font-size:12px">${esc(pc.escopo)}</b></div>
  <div class="cx"><span>Placas</span><b>${pc.placas}</b></div>
  <div class="cx"><span>Mourões</span><b>${pc.mouroes}</b></div>
  <div class="cx"><span>Equipes de montagem</span><b>${pc.equipes ?? '—'}</b></div>
  <div class="cx"><span>Prazo de montagem</span><b>${pc.dias ? `${pc.dias} dia${pc.dias > 1 ? 's' : ''} ${pc.dias > 1 ? 'úteis' : 'útil'}` : '—'}</b></div>
</div>
${pc.ajuste > 0.0001 ? `<p class="sub" style="text-align:left">Modulação: ${pc.vaos} vãos (${fmtM(pc.modular)} modulares para ${fmtM(pc.L)} solicitados — ajuste a detalhar).</p>` : ''}
${pc.trechos.length > 1 ? `<p>${pc.trechos.map((t) => `${esc(t.nome || 'Trecho')}: ${fmtM(t.L)}`).join(' · ')}</p>` : ''}
<h2>Valores</h2>
<table>
  ${pc.material.tabela ? linha(`Material${pc.placasFornecidas || pc.mouroesFornecidos ? ` (${[pc.placasFornecidas ? `${pc.placasFornecidas} placas` : '', pc.mouroesFornecidos ? `${pc.mouroesFornecidos} mourões` : ''].filter(Boolean).join(' e ')})` : ''}`, brl(pc.material.tabela)) : ''}
  ${pc.instalacao.tabela ? linha(`Montagem das placas (${fmtM(pc.L)})`, brl(pc.instalacao.tabela)) : ''}
  ${pc.adicionais.map((a) => linha(`${a.descricao}${a.quantidade !== 1 ? ` (${fmtN(a.quantidade, 0)} ${a.unidade})` : ''}`, brl(a.valor))).join('')}
  ${pc.desconto > 0 ? linha('Desconto', '− ' + brl(pc.desconto)) : ''}
  <tr class="total"><td>Total</td><td class="v">${brl(pc.total)}</td></tr>
</table>
<p class="sub">${brl(pc.porM)} por metro · ${brl(pc.porM2)} por m² (sobre a medida solicitada)</p>
${pc.dias ? '<p class="sub" style="text-align:left">O prazo informado é da montagem. Fabricação, entrega, fundações e implantação dos mourões têm cronogramas próprios.</p>' : ''}
${pc.fabricacao || pc.entrega ? `<p>${pc.fabricacao ? `Fabricação: ${esc(pc.fabricacao)}. ` : ''}${pc.entrega ? `Entrega das peças: ${esc(pc.entrega)}.` : ''}</p>` : ''}
<h2>Condições</h2>
<ul>${[...pc.condicoes, pc.pagamento ? `Pagamento: ${pc.pagamento}` : null, pc.validade ? `Validade da proposta: ${pc.validade}` : null].filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>A combinar.</li>'}</ul>
${pc.exclusoes.length ? `<h2>Não incluso</h2><ul>${pc.exclusoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${pc.observacoes ? `<h2>Observações</h2><p>${esc(pc.observacoes).replace(/\n/g, '<br>')}</p>` : ''}
<h2>Por que muro pré-moldado EQL</h2>
<ul>${BENEFICIOS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<footer>EQL Group · ${esc(pc.responsavel ? `Responsável: ${pc.responsavel}` : '')}</footer>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  w.document.close();
  return true;
}
