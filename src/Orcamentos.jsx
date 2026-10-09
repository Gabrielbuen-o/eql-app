import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt, hoje } from './lib.js';
import { OrcamentoMuros, numeroOrc } from './orcamentos/OrcamentoMuros.jsx';
import { NOME as NOME_MUROS, PARAMETROS_INICIAIS, STATUS, brl, pct, statusNome } from './orcamentos/muros.js';
import { novaVersaoParametros } from './orcamentos/api.js';

// Cada categoria tem a sua página e as suas regras (nunca reaproveita fórmulas de outra)
const CATEGORIAS = [
  { id: 'muros', nome: NOME_MUROS, desc: 'Placas e mourões: quantitativos, prazo de montagem, proposta e margem', ativo: true },
  { id: 'impermeabilizacao', nome: 'Impermeabilização', desc: 'em breve', ativo: false },
  { id: 'obras_civis', nome: 'Obras civis (telecom)', desc: 'em breve', ativo: false },
  { id: 'concreto', nome: 'Concreto ensacado e pré-moldados avulsos', desc: 'em breve', ativo: false },
];
const nomeCat = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nome]));

// orçamentos guardados só neste aparelho (começados e ainda não gravados no sistema)
function rascunhosLocais() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('eql-orc-rascunho:')) continue;
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d) out.push({ id: k.slice(17), ts: d.ts, cliente: d.cliente, projeto: d.projeto });
    }
  } catch { /* ignora */ }
  return out.sort((a, b) => b.ts - a.ts);
}

// Endereços: /orcamentos · /orcamentos/novo/muros · /orcamentos/ORC-2026-0012 (ou o id, antes de ganhar número)
export function Orcamentos({ dados, eu, pode, avisar, resto = [], irSub = () => {} }) {
  const [escolher, setEscolher] = useState(false);
  const [parametros, setParametros] = useState(false);
  const [status, setStatus] = useState('abertos');
  const [busca, setBusca] = useState('');
  const [resp, setResp] = useState('');
  const lista = dados.orcamentos || [];
  const versoesMuros = (dados.orcamento_parametros || []).filter((v) => v.categoria === 'muros').sort((a, b) => b.versao - a.versao);
  const vigente = versoesMuros[0] || null;
  const falta = dados.faltando.has('orcamentos') || dados.faltando.has('orcamento_parametros');
  const token = (o) => (o.numero ? numeroOrc(o) : o.id);
  const setAberto = (id, opc) => { const o = lista.find((x) => x.id === id); irSub(o ? token(o) : id, opc); };

  // orçamento novo: o id nasce aqui para a tela não recarregar quando o endereço passa a ter o número
  const ehNovo = resto[0] === 'novo';
  const [idNovo, setIdNovo] = useState(null);
  useEffect(() => { if (ehNovo) setIdNovo(crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)); }, [ehNovo]);
  const chave = resto[0] && !ehNovo ? decodeURIComponent(resto[0]) : null;
  const orc = chave ? lista.find((o) => o.id === chave || (o.numero && numeroOrc(o).toUpperCase() === chave.toUpperCase())) || lista.find((o) => o.id === idNovo && chave === o.id) : null;

  // depois de salvar, o endereço troca para o número do orçamento (ORC-2026-0012), sem criar "voltar"
  useEffect(() => { if (orc && chave !== token(orc)) irSub(token(orc), { replace: true }); }, [orc?.id, orc?.numero, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ehNovo || chave) {
    const soNoAparelho = chave && !orc && rascunhosLocais().some((d) => d.id === chave);
    if (chave && !orc && chave !== idNovo && !soNoAparelho) {
      return (
        <section className="card placeholder">
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Orçamento não encontrado</h2>
          <p>{chave} não existe ou foi apagado.</p>
          <button type="button" className="pill" onClick={() => irSub(null)}>Ver todos os orçamentos</button>
        </section>
      );
    }
    if (ehNovo && !idNovo) return null;
    const id = orc ? orc.id : soNoAparelho ? chave : idNovo; // recém-salvo / só neste aparelho: continua na mesma tela
    return (
      <OrcamentoMuros key={id} novoId={id} dados={dados} eu={eu} orcamento={orc} parametrosVigentes={vigente || { versao: null, parametros: PARAMETROS_INICIAIS }}
        onVoltar={() => irSub(null)} onAbrir={(nid) => setAberto(nid, { forcar: true })} onSalvo={(sid) => irSub(sid, { replace: true, forcar: true })} avisar={avisar} />
    );
  }

  const abertos = new Set(['rascunho', 'enviado', 'negociacao']);
  const filtrados = lista
    .filter((o) => status === 'todos' || (status === 'abertos' ? abertos.has(o.status) : o.status === status))
    .filter((o) => !resp || o.responsavel_id === resp)
    .filter((o) => !busca || [numeroOrc(o), o.cliente, o.projeto].join(' ').toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.numero || 0) - (a.numero || 0));
  const mes = hoje().slice(0, 7);
  const valor = (o) => Number(o.total ?? o.resumo?.total ?? 0);
  const emAberto = lista.filter((o) => abertos.has(o.status));
  const aprovMes = lista.filter((o) => o.status === 'aprovado' && (o.atualizado_em || o.data || '').slice(0, 7) === mes);
  const decididos = lista.filter((o) => o.status === 'aprovado' || o.status === 'perdido');
  const nomePerfil = (id) => dados.perfis.find((p) => p.id === id)?.nome || '—';

  return (
    <>
      <header className="head">
        <div>
          <h1>Orçamentos</h1>
          <p className="date">Simulação durante o atendimento, proposta para o cliente e análise interna de rentabilidade</p>
        </div>
        <div className="row">
          {pode.admin && <button type="button" className="pill ghost" onClick={() => setParametros(true)}>Tabelas e parâmetros</button>}
          <button type="button" className="pill lime" onClick={() => setEscolher(true)} disabled={falta}>+ Novo orçamento</button>
        </div>
      </header>

      {falta && (
        <section className="card aviso-banco" role="status">
          <strong>Falta liberar os orçamentos no banco.</strong>
          <span>Rode o arquivo <b>14_orcamentos.sql</b> no SQL Editor do Supabase (igual aos outros).</span>
        </section>
      )}

      {(() => {
        const locais = rascunhosLocais().filter((d) => !lista.some((o) => o.id === d.id));
        return locais.length > 0 && (
          <section className="card orc-locais" role="status">
            <strong>{locais.length === 1 ? 'Um orçamento ficou só neste aparelho' : `${locais.length} orçamentos ficaram só neste aparelho`}</strong>
            <span className="note">Começou e não chegou a ser gravado no sistema (sem internet ou o computador fechou). Abra para terminar: ele grava sozinho.</span>
            <div className="row">
              {locais.map((d) => (
                <button key={d.id} type="button" className="pill" onClick={() => irSub(d.id)}>
                  {[d.cliente, d.projeto].filter(Boolean).join(' · ') || 'Orçamento sem nome'} · {new Date(d.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      <div className="epi-kpis orc-kpis">
        <div className="epi-kpi"><span className="l">Em aberto</span><b>{emAberto.length}</b><span className="h">{brl(emAberto.reduce((s, o) => s + valor(o), 0))}</span></div>
        <div className="epi-kpi"><span className="l">Aprovados no mês</span><b>{aprovMes.length}</b><span className="h">{brl(aprovMes.reduce((s, o) => s + valor(o), 0))}</span></div>
        <div className="epi-kpi"><span className="l">Taxa de aprovação</span><b>{decididos.length ? pct(decididos.filter((o) => o.status === 'aprovado').length / decididos.length) : '—'}</b><span className="h">aprovados ÷ (aprovados + perdidos)</span></div>
        <div className="epi-kpi"><span className="l">Tabela vigente · muros</span><b>{vigente ? `v${vigente.versao}` : '—'}</b><span className="h">{vigente ? `desde ${new Date(vigente.vigente_desde).toLocaleDateString('pt-BR')}` : 'padrão inicial'}</span></div>
      </div>

      <section className="card stack">
        <div className="row orc-filtros">
          <div className="row">
            {[['abertos', 'Em aberto'], ['todos', 'Todos'], ...STATUS.map((s) => [s.id, s.nome])].map(([id, n]) => (
              <button key={id} type="button" className={'pill' + (status === id ? ' on' : '')} onClick={() => setStatus(id)}>{n}</button>
            ))}
          </div>
          <div className="row">
            <select className="input" value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>{dados.perfis.filter((p) => p.papel === 'admin' || p.papel === 'gerente').map((p) => <option key={p.id} value={p.id}>{p.nome || p.email}</option>)}
            </select>
            <input className="input" placeholder="Buscar nº, cliente, projeto…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          </div>
        </div>
        <div className="epi-tabela-wrap">
          <table className="epi-tabela orc-tabela">
            <thead><tr><th>Número</th><th>Cliente</th><th>Projeto</th><th>Categoria</th><th>Data</th><th>Responsável</th><th className="num">Valor</th><th>Status</th></tr></thead>
            <tbody>
              {filtrados.map((o) => (
                <tr key={o.id} className="orc-linha" onClick={() => setAberto(o.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAberto(o.id)}>
                  <td><b>{numeroOrc(o)}</b>{o.revisao ? <small> · rev. {o.revisao}</small> : null}</td>
                  <td>{o.cliente || '—'}</td>
                  <td>{o.projeto || '—'}</td>
                  <td>{nomeCat[o.categoria] || o.categoria}</td>
                  <td>{fmt(o.data)}</td>
                  <td>{nomePerfil(o.responsavel_id)}</td>
                  <td className="num"><b>{brl(valor(o))}</b>{o.resumo && !o.resumo.final && <small> prévia</small>}</td>
                  <td><span className={'orc-st ' + o.status}>{statusNome[o.status] || o.status}</span></td>
                </tr>
              ))}
              {!filtrados.length && <tr><td colSpan={8} className="empty">{lista.length ? 'Nenhum orçamento neste filtro.' : 'Nenhum orçamento ainda. Clique em “+ Novo orçamento”.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {escolher && createPortal(
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setEscolher(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Novo orçamento" style={{ maxWidth: 560 }}>
            <div className="modal-head"><div><span className="modal-kicker">Novo orçamento</span><h2>Escolha a categoria</h2></div>
              <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setEscolher(false)}>×</button></div>
            <div className="orc-cats">
              {CATEGORIAS.map((c) => (
                <button key={c.id} type="button" className={'campo-tipo' + (c.ativo ? '' : ' breve')} disabled={!c.ativo}
                  onClick={() => { setEscolher(false); irSub('novo/' + c.id); }}>
                  <span className="campo-tipo-nome">{c.nome}</span><span className="campo-tipo-desc">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>, document.body)}
      {parametros && <Parametros versoes={versoesMuros} dados={dados} avisar={avisar} onFechar={() => setParametros(false)} />}
    </>
  );
}

// ---------- Tabela e parâmetros (gestão): cada alteração vira uma nova versão ----------
function Parametros({ versoes, dados, avisar, onFechar }) {
  const atual = versoes[0]?.parametros || PARAMETROS_INICIAIS;
  const [p, setP] = useState(() => JSON.parse(JSON.stringify(atual)));
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (cam, v) => setP((x) => { const y = JSON.parse(JSON.stringify(x)); const ks = cam.split('.'); let o = y; ks.slice(0, -1).forEach((k) => { o = o[k] ||= {}; }); o[ks.at(-1)] = v; return y; });
  const num = (t) => { const x = Number(String(t).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const mudou = JSON.stringify(p) !== JSON.stringify(atual);
  const salvar = async () => {
    if (!obs.trim()) { setErro('Escreva o motivo da alteração (fica no histórico).'); return; }
    setSalvando(true);
    const res = await novaVersaoParametros('muros', (versoes[0]?.versao || 0) + 1, p, obs.trim());
    setSalvando(false);
    if (!res.ok) { setErro(res.erro); return; }
    await dados.recarregarTabela?.('orcamento_parametros');
    avisar('Nova versão da tabela salva. Orçamentos já feitos continuam com a tabela que usaram.');
    onFechar();
  };
  const C = ({ rot, cam, pctual, vazio, dica }) => {
    const v = cam.split('.').reduce((o, k) => o?.[k], p);
    const mostra = v == null ? '' : pctual ? String(Math.round(v * 10000) / 100).replace('.', ',') : String(v).replace('.', ',');
    return (
      <label className="field"><span>{rot}{pctual ? ' (%)' : ''}</span>
        <input className="input" defaultValue={mostra} inputMode="decimal" key={cam + mostra}
          onBlur={(e) => { const t = e.target.value.trim(); set(cam, t === '' && vazio ? null : pctual ? num(t) / 100 : num(t)); }} />
        {dica && <small className="orc-dica">{dica}</small>}
      </label>
    );
  };
  const nomePerfil = (id) => dados.perfis.find((x) => x.id === id)?.nome || '—';
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Tabela e parâmetros" style={{ maxWidth: 860 }}>
        <div className="modal-head"><div><span className="modal-kicker">Muros pré-moldados · versão vigente {versoes[0]?.versao ?? 'inicial'}</span><h2>Tabela e parâmetros</h2></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button></div>
        <p className="note">Mudar aqui cria uma <b>nova versão</b>. Propostas já feitas continuam com a versão que usaram; para atualizar uma delas, abra e use “Usar a tabela vigente” (gera nova revisão se já foi emitida).</p>
        <h3 className="orc-h3">Preços de venda</h3>
        <div className="orc-campos">{C({ rot: "Placa (R$/un)", cam: "precos.placa" })}{C({ rot: "Mourão (R$/un)", cam: "precos.mourao" })}{C({ rot: "Montagem das placas (R$/m)", cam: "precos.montagem_m", dica: `tabela a ${String(p.altura_referencia).replace('.', ',')} m` })}
          <label className="field"><span>Nome da tabela</span><input className="input" value={p.nome_tabela || ''} onChange={(e) => set('nome_tabela', e.target.value)} /></label></div>
        <h3 className="orc-h3">Custos internos e produção</h3>
        <div className="orc-campos">{C({ rot: "Custo da placa (R$/un)", cam: "custos.placa" })}{C({ rot: "Custo do mourão (R$/un)", cam: "custos.mourao" })}
          {C({ rot: "FTE por equipe/dia (R$)", cam: "fte_dia" })}{C({ rot: "Produtividade (placas/equipe/dia)", cam: "produtividade_placas_dia" })}
          {C({ rot: "Vão nominal (m)", cam: "dimensoes.vao" })}{C({ rot: "Altura da placa (m)", cam: "dimensoes.placa_altura" })}{C({ rot: "Altura de referência (m)", cam: "altura_referencia" })}
          <label className="field"><span>Equipe padrão</span><input className="input" value={p.equipe_desc || ''} onChange={(e) => set('equipe_desc', e.target.value)} /></label></div>
        <h3 className="orc-h3">Tributos e margens</h3>
        <div className="orc-campos">{C({ rot: "Alíquota de simulação", cam: "aliquota", pctual: true })}{C({ rot: "Margem mínima do material", cam: "margem_material_min", pctual: true, dica: "precisa ficar ACIMA deste valor" })}
          {C({ rot: "Meta de margem do material", cam: "margem_material_meta", pctual: true })}{C({ rot: "Margem mínima da instalação", cam: "margem_instalacao_min", pctual: true, vazio: true, dica: "em branco = não definida (desconto só com autorização)" })}</div>
        <h3 className="orc-h3">Reservas e despesas (perdas, desgaste, logística, equipamentos, indiretos…)</h3>
        <p className="note">Cadastre separadamente, sem repetir o que já está no custo fabril (concreto, aço e mão de obra produtiva) ou no FTE.</p>
        <div className="orc-lista">
          {(p.despesas || []).map((d, i) => (
            <div key={d.id || i} className="orc-desp">
              <input className="input" value={d.nome || ''} placeholder="Ex.: perdas e quebras" onChange={(e) => setP((x) => { const y = JSON.parse(JSON.stringify(x)); y.despesas[i].nome = e.target.value; return y; })} aria-label="Nome" />
              <select className="input" value={d.componente} onChange={(e) => setP((x) => { const y = JSON.parse(JSON.stringify(x)); y.despesas[i].componente = e.target.value; return y; })} aria-label="Componente">
                <option value="material">Material</option><option value="instalacao">Instalação</option></select>
              <select className="input" value={d.base} onChange={(e) => setP((x) => { const y = JSON.parse(JSON.stringify(x)); y.despesas[i].base = e.target.value; return y; })} aria-label="Base">
                <option value="pct_custo">% do custo do componente</option><option value="reais">R$ por orçamento</option><option value="reais_m">R$ por metro</option></select>
              <input className="input" defaultValue={String(d.valor ?? '').replace('.', ',')} inputMode="decimal" aria-label="Valor"
                onBlur={(e) => setP((x) => { const y = JSON.parse(JSON.stringify(x)); y.despesas[i].valor = num(e.target.value); return y; })} />
              <button type="button" className="x-btn" aria-label="Tirar" onClick={() => setP((x) => ({ ...x, despesas: x.despesas.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <button type="button" className="add-line" onClick={() => setP((x) => ({ ...x, despesas: [...(x.despesas || []), { id: Math.random().toString(36).slice(2), nome: '', componente: 'material', base: 'pct_custo', valor: 0 }] }))}>+ Reserva / despesa</button>
        </div>
        <label className="field"><span>Motivo da alteração</span><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: reajuste do custo do aço" /></label>
        {erro && <div className="err">{erro}</div>}
        {versoes.length > 0 && (
          <details className="orc-det"><summary>Versões anteriores ({versoes.length})</summary>
            <ul className="frases-lista">{versoes.map((v) => <li key={v.id}><span><b>v{v.versao}</b> · desde {new Date(v.vigente_desde).toLocaleString('pt-BR')} · {nomePerfil(v.autor_id)}{v.observacao ? ` · ${v.observacao}` : ''}</span></li>)}</ul>
          </details>
        )}
        <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pill ghost" onClick={onFechar}>Cancelar</button>
          <button type="button" className="pill lime" disabled={!mudou || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar nova versão'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
