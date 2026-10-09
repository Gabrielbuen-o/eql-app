import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hoje } from '../lib.js';
import { useBloqueioSaida } from '../rota.js';
import {
  ESCOPOS, NOME, PARAMETROS_INICIAIS, STATUS, brl, calcular, entradaInicial, fmtM, fmtN, pct, resumo, statusNome,
} from './muros.js';
import { abrirPdf, propostaComercial, textoProposta } from './proposta.js';
import { carregarHistorico, emitirRevisao, salvarOrcamento } from './api.js';
import { Apresentacao } from './Apresentacao.jsx';

const novoId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
export const numeroOrc = (o) => (o?.numero ? `ORC-${String(o.data || o.criado_em || '').slice(0, 4) || new Date().getFullYear()}-${String(o.numero).padStart(4, '0')}` : 'Novo');
const clone = (x) => JSON.parse(JSON.stringify(x));
// junta o que foi salvo com os campos padrão (orçamentos antigos ganham campos novos sem quebrar)
const completar = (e, padrao) => {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return e ?? padrao;
  const out = { ...padrao, ...e };
  Object.keys(padrao || {}).forEach((k) => {
    if (padrao[k] && typeof padrao[k] === 'object' && !Array.isArray(padrao[k])) out[k] = completar(e[k], padrao[k]);
  });
  return out;
};

export function OrcamentoMuros({ dados, eu, orcamento, novoId: idDado, parametrosVigentes, onVoltar, onAbrir, onSalvo, avisar }) {
  const padrao = useMemo(() => entradaInicial({ responsavel_id: eu?.id || null, hojeIso: hoje() }), [eu?.id]);
  const [id] = useState(() => orcamento?.id || idDado || novoId());
  const [existe, setExiste] = useState(!!orcamento);
  const [entrada, setEntrada] = useState(() => completar(orcamento?.entrada, padrao));
  const [params, setParams] = useState(() => orcamento?.parametros && Object.keys(orcamento.parametros).length ? orcamento.parametros : (parametrosVigentes?.parametros || PARAMETROS_INICIAIS));
  const [paramsVersao, setParamsVersao] = useState(orcamento?.parametros_versao ?? parametrosVigentes?.versao ?? null);
  const [status, setStatus] = useState(orcamento?.status || 'rascunho');
  const [revisao, setRevisao] = useState(orcamento?.revisao ?? 0);
  const [emitida, setEmitida] = useState(orcamento?.revisao_emitida ?? null);
  const [sujo, setSujo] = useState(!orcamento);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [verGestao, setVerGestao] = useState(true);
  const [apresentar, setApresentar] = useState(false);
  const [whats, setWhats] = useState(null);
  const [hist, setHist] = useState(null);
  const travado = emitida != null && emitida === revisao;

  // se o orçamento for atualizado por outra pessoa enquanto está aberto e não há alterações locais, acompanha
  const row = dados.orcamentos?.find((o) => o.id === id);
  useEffect(() => {
    if (!row || sujo) return;
    setStatus(row.status); setRevisao(row.revisao ?? 0); setEmitida(row.revisao_emitida ?? null);
  }, [row?.status, row?.revisao, row?.revisao_emitida]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = useMemo(() => calcular(entrada, params), [entrada, params]);
  const respNome = dados.perfis.find((p) => p.id === entrada.responsavel_id)?.nome || '';
  const pc = useMemo(() => propostaComercial(r, entrada, params, { numero: numeroOrc(row || orcamento), revisao, responsavel: respNome }), [r, entrada, params, row, orcamento, revisao, respNome]);

  const mudar = (fn) => { if (travado) return; setEntrada((e) => { const x = clone(e); fn(x); return x; }); setSujo(true); };
  const set = (caminho, v) => mudar((x) => { const ks = caminho.split('.'); let o = x; ks.slice(0, -1).forEach((k) => { o = o[k] ||= {}; }); o[ks.at(-1)] = v; });

  const linha = (extra = {}) => ({
    id, categoria: 'muros', status, cliente: entrada.cliente || null, projeto: entrada.projeto || null,
    responsavel_id: entrada.responsavel_id || null, data: entrada.data || hoje(), validade: entrada.validade || null,
    entrada, parametros: params, parametros_versao: paramsVersao, resumo: resumo(r), revisao, ...extra,
  });
  const salvar = async (extra) => {
    setSalvando(true); setErro('');
    const res = await salvarOrcamento(linha(extra), existe);
    setSalvando(false);
    if (!res.ok) { setErro(res.erro); return false; }
    const primeira = !existe;
    setExiste(true); setSujo(false);
    dados.recarregarTabela?.('orcamentos');
    if (primeira) onSalvo?.(id);
    return true;
  };
  const mudarStatus = async (s) => {
    setStatus(s);
    if (existe) {
      const res = await salvarOrcamento({ id, status: s }, true);
      if (!res.ok) setErro(res.erro); else { dados.recarregarTabela?.('orcamentos'); avisar(`Status: ${statusNome[s]}.`); }
    } else setSujo(true);
  };
  const revisar = async () => {
    const nova = revisao + 1;
    const ok = await (async () => { setSalvando(true); const res = await salvarOrcamento({ id, revisao: nova }, true); setSalvando(false); if (!res.ok) setErro(res.erro); return res.ok; })();
    if (ok) { setRevisao(nova); avisar(`Revisão ${nova} aberta. A revisão ${revisao} emitida continua guardada como estava.`); dados.recarregarTabela?.('orcamentos'); }
  };
  const duplicar = async () => {
    const nid = novoId();
    const e = clone(entrada);
    e.projeto = e.projeto ? `${e.projeto} (cópia)` : '(cópia)';
    e.comercial.autorizacao_instalacao = null; e.data = hoje();
    const res = await salvarOrcamento({
      id: nid, categoria: 'muros', status: 'rascunho', cliente: e.cliente || null, projeto: e.projeto, responsavel_id: eu?.id || e.responsavel_id,
      data: e.data, validade: e.validade, entrada: e, parametros: params, parametros_versao: paramsVersao, resumo: resumo(calcular(e, params)), revisao: 0, duplicado_de: id,
    }, false);
    if (!res.ok) { setErro(res.erro); return; }
    await dados.recarregarTabela?.('orcamentos');
    avisar('Orçamento duplicado.');
    onAbrir?.(nid);
  };
  const usarTabelaVigente = () => {
    if (travado || !parametrosVigentes) return;
    setParams(parametrosVigentes.parametros); setParamsVersao(parametrosVigentes.versao); setSujo(true);
    avisar(`Tabela atualizada para a versão ${parametrosVigentes.versao}. Confira os valores e salve.`);
  };
  const emitir = async () => {
    if (!r.final) return;
    if (!(await salvar())) return;
    const res = await emitirRevisao({ orcamento_id: id, revisao, parametros: params, entrada, resumo: resumo(r), total: r.comercial.total });
    if (!res.ok) { setErro(res.erro); return; }
    setEmitida(revisao); if (status === 'rascunho') setStatus('enviado');
    dados.recarregarTabela?.('orcamentos');
    avisar(`Proposta ${numeroOrc(row || orcamento)}${revisao ? ` rev. ${revisao}` : ''} emitida. Abrindo o PDF…`);
    abrirPdf({ ...pc, final: true });
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoProposta(pc)); avisar(pc.final ? 'Proposta copiada.' : 'Prévia copiada (com os itens em aberto marcados).'); }
    catch { setWhats({ texto: textoProposta(pc), soCopiar: true }); }
  };
  const resolver = (pend, acao) => mudar((x) => {
    x.comercial.resolvidas ||= {};
    if (acao === 'adicional') {
      x.comercial.adicionais.push({ id: novoId(), descricao: pend.exclusao || 'Adicional', quantidade: 1, unidade: 'vb', preco: 0, custo: 0, componente: pend.componente || 'instalacao', cobrado: true });
    }
    x.comercial.resolvidas[pend.id] = { acao, exclusao: pend.exclusao, por: eu?.nome || '', em: new Date().toISOString() };
  });
  const desfazerResolucao = (pid) => mudar((x) => { delete x.comercial.resolvidas[pid]; });

  // avisa antes de sair com alterações não salvas
  // e também no botão voltar do celular/navegador e nos itens do menu
  const perguntarSaida = useCallback(() => window.confirm('Sair sem salvar as alterações?'), []);
  useBloqueioSaida(sujo, perguntarSaida);
  useEffect(() => {
    if (!sujo) return undefined;
    const f = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [sujo]);
  const voltar = () => onVoltar();

  const g = entrada.geometria, pr = entrada.prazo, cd = entrada.condicoes, cm = entrada.comercial;
  const clientes = useMemo(() => [...new Set([...(dados.orcamentos || []).map((o) => o.cliente), ...dados.demandas.map((d) => d.grupo)].filter(Boolean))].sort(), [dados.orcamentos, dados.demandas]);
  const novaTabela = parametrosVigentes && paramsVersao != null && parametrosVigentes.versao > paramsVersao;
  const resolvidas = Object.entries(cm.resolvidas || {});

  return (
    <div className="orc">
      <div className="orc-topo">
        <button type="button" className="pill ghost" onClick={voltar}>‹ Orçamentos</button>
        <div className="orc-titulo">
          <span className="modal-kicker">{NOME}</span>
          <h1>{numeroOrc(row || orcamento)}{revisao ? <small> · rev. {revisao}</small> : null}</h1>
        </div>
        <select className="input orc-status" value={status} onChange={(e) => mudarStatus(e.target.value)} aria-label="Status">
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <span className={'orc-selo ' + (travado ? 'emitida' : r.final ? 'pronta' : 'previa')}>
          {travado ? `Rev. ${revisao} emitida` : r.final ? 'Pronta para emitir' : 'Prévia'}
        </span>
        <div className="orc-acoes">
          {!travado && <button type="button" className={'pill' + (sujo ? ' lime' : '')} onClick={() => salvar()} disabled={salvando}>{salvando ? 'Salvando…' : sujo ? 'Salvar rascunho' : 'Salvo ✓'}</button>}
          {travado && <button type="button" className="pill lime" onClick={revisar}>Revisar</button>}
          {existe && <button type="button" className="pill" onClick={duplicar}>Duplicar</button>}
          <button type="button" className="pill" onClick={() => setApresentar(true)} disabled={!r.ok}>Apresentar ao cliente</button>
          <button type="button" className="pill" onClick={copiar} disabled={!r.ok}>Copiar proposta</button>
          <button type="button" className="pill" onClick={() => setWhats({ texto: textoProposta(pc, { whatsapp: true }) })} disabled={!r.ok}>WhatsApp</button>
          <button type="button" className="pill" onClick={() => abrirPdf(pc)} disabled={!r.ok}>PDF{r.final ? '' : ' (prévia)'}</button>
          {!travado && <button type="button" className="pill dark" onClick={emitir} disabled={!r.final || salvando} title={r.final ? 'Grava esta revisão e gera o PDF final' : 'Resolva as pendências e bloqueios para emitir'}>Emitir proposta final</button>}
          {existe && <button type="button" className="link-btn" onClick={async () => setHist(await carregarHistorico(id))}>Histórico</button>}
        </div>
      </div>
      {erro && <div className="err" role="alert">{erro}</div>}
      {travado && <div className="orc-travado">Esta revisão já foi emitida e está guardada como estava. Para mudar algo, clique em <b>Revisar</b> (cria a revisão {revisao + 1}).</div>}
      {novaTabela && !travado && (
        <div className="orc-tabela-nova">Existe uma tabela mais nova (versão {parametrosVigentes.versao}). Este orçamento usa a versão {paramsVersao}.
          <button type="button" className="link-btn" onClick={usarTabelaVigente}>Usar a tabela vigente</button></div>
      )}

      <div className="orc-corpo">
        <fieldset className="orc-form" disabled={travado}>
          {/* ---------- Identificação ---------- */}
          <section className="card stack">
            <h2 className="card-title">Identificação</h2>
            <div className="orc-campos">
              <label className="field c2"><span>Cliente</span><input list="orc-clientes" value={entrada.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nome do cliente" />
                <datalist id="orc-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="field"><span>Contato</span><input value={entrada.contato} onChange={(e) => set('contato', e.target.value)} placeholder="Nome" /></label>
              <label className="field"><span>WhatsApp / telefone</span><input value={entrada.telefone} onChange={(e) => set('telefone', e.target.value)} inputMode="tel" placeholder="(11) 9…" /></label>
              <label className="field c2"><span>Projeto</span><input value={entrada.projeto} onChange={(e) => set('projeto', e.target.value)} placeholder="Ex.: Muro de divisa — Galpão Norte" /></label>
              <label className="field c2"><span>Local da obra</span><input value={entrada.local} onChange={(e) => set('local', e.target.value)} placeholder="Endereço ou cidade" /></label>
              <label className="field"><span>Responsável</span>
                <select value={entrada.responsavel_id || ''} onChange={(e) => set('responsavel_id', e.target.value || null)}>
                  <option value="">—</option>{dados.perfis.filter((p) => p.papel === 'admin' || p.papel === 'gerente').map((p) => <option key={p.id} value={p.id}>{p.nome || p.email}</option>)}
                </select></label>
              <label className="field"><span>Data</span><input type="date" value={entrada.data} onChange={(e) => set('data', e.target.value)} /></label>
              <label className="field"><span>Validade da proposta</span><input type="date" value={entrada.validade} onChange={(e) => set('validade', e.target.value)} /></label>
              <label className="field"><span>Condições de pagamento</span><input value={entrada.pagamento} onChange={(e) => set('pagamento', e.target.value)} placeholder="Ex.: 50% na aprovação, 50% na entrega" /></label>
            </div>
          </section>

          {/* ---------- Geometria ---------- */}
          <section className="card stack">
            <h2 className="card-title">Geometria</h2>
            <div className="seg two orc-seg-curto">
              <button type="button" className={g.modo !== 'trechos' ? 'on' : ''} onClick={() => set('geometria.modo', 'unico')}>Trecho reto único</button>
              <button type="button" className={g.modo === 'trechos' ? 'on' : ''} onClick={() => mudar((x) => {
                x.geometria.modo = 'trechos';
                if (!x.geometria.trechos?.length || (x.geometria.trechos.length === 1 && !x.geometria.trechos[0].comprimento)) x.geometria.trechos = [{ id: novoId(), nome: 'Trecho 1', comprimento: x.geometria.comprimento }];
              })}>Vários trechos</button>
            </div>
            <div className="orc-campos">
              {g.modo !== 'trechos' ? (
                <Num rotulo="Comprimento líquido (m)" valor={g.comprimento} onChange={(v) => set('geometria.comprimento', v)} grande />
              ) : null}
              <div className="field c2"><span>Altura</span>
                <div className="orc-alturas">
                  {[1.5, 2, 2.5, 3].map((h) => <button key={h} type="button" className={'pill' + (Math.abs(g.altura - h) < 1e-9 ? ' on' : '')} onClick={() => set('geometria.altura', h)}>{fmtN(h)} m</button>)}
                  <Num valor={g.altura} onChange={(v) => set('geometria.altura', v)} curto aria="Outra altura (m)" />
                </div>
              </div>
              <Num rotulo="Cantos" valor={g.cantos} onChange={(v) => set('geometria.cantos', Math.max(0, Math.floor(v)))} inteiro />
            </div>
            {g.modo === 'trechos' && (
              <div className="orc-lista">
                {(g.trechos || []).map((t, i) => (
                  <div key={t.id || i} className="orc-item">
                    <input className="input" value={t.nome || ''} onChange={(e) => mudar((x) => { x.geometria.trechos[i].nome = e.target.value; })} aria-label="Nome do trecho" />
                    <Num valor={t.comprimento} onChange={(v) => mudar((x) => { x.geometria.trechos[i].comprimento = v; })} sufixo="m" aria="Comprimento do trecho" />
                    <span className="note">{r.qt.trechos[i] ? `${r.qt.trechos[i].vaos} vãos · ${r.qt.trechos[i].placas} placas · ${r.qt.trechos[i].mouroes} mourões` : ''}</span>
                    <button type="button" className="x-btn" aria-label="Tirar trecho" onClick={() => mudar((x) => { x.geometria.trechos.splice(i, 1); })}>×</button>
                  </div>
                ))}
                <button type="button" className="add-line" onClick={() => mudar((x) => { x.geometria.trechos.push({ id: novoId(), nome: `Trecho ${x.geometria.trechos.length + 1}`, comprimento: 0 }); })}>+ Trecho</button>
              </div>
            )}
            <div className="orc-lista">
              <span className="field-rot">Portões e interrupções {g.modo !== 'trechos' ? '(descontados do comprimento)' : '(informativo: os trechos já devem estar sem eles)'}</span>
              {(g.aberturas || []).map((a, i) => (
                <div key={a.id || i} className="orc-item">
                  <input className="input" value={a.descricao || ''} placeholder="Ex.: portão de veículos" onChange={(e) => mudar((x) => { x.geometria.aberturas[i].descricao = e.target.value; })} aria-label="Descrição" />
                  <Num valor={a.largura} onChange={(v) => mudar((x) => { x.geometria.aberturas[i].largura = v; })} sufixo="m" aria="Largura" />
                  <span />
                  <button type="button" className="x-btn" aria-label="Tirar" onClick={() => mudar((x) => { x.geometria.aberturas.splice(i, 1); })}>×</button>
                </div>
              ))}
              <button type="button" className="add-line" onClick={() => mudar((x) => { x.geometria.aberturas.push({ id: novoId(), descricao: '', largura: 0 }); })}>+ Portão / interrupção</button>
            </div>
          </section>

          {/* ---------- Escopo e fornecimento ---------- */}
          <section className="card stack">
            <h2 className="card-title">Escopo e fornecimento</h2>
            <div className="orc-escopos">
              {ESCOPOS.map((s) => (
                <button key={s.id} type="button" className={'orc-escopo' + (entrada.escopo === s.id ? ' on' : '')} onClick={() => set('escopo', s.id)}>
                  <b>{s.nome}</b>{s.completa && <small>exige composição adicional validada</small>}
                </button>
              ))}
            </div>
            <div className="orc-campos">
              <Sim rotulo="Placas fornecidas pela EQL" valor={entrada.fornece_placas} onChange={(v) => set('fornece_placas', v)} desab={entrada.escopo === 'mao_de_obra'} />
              <Sim rotulo="Mourões fornecidos pela EQL" valor={entrada.fornece_mouroes} onChange={(v) => set('fornece_mouroes', v)} desab={entrada.escopo === 'mao_de_obra'} />
              <label className="field"><span>Quem implanta os mourões</span>
                <select value={entrada.implantacao_mouroes} onChange={(e) => set('implantacao_mouroes', e.target.value)}>
                  <option value="terceiros">Terceiros / cliente</option><option value="eql">EQL</option>
                </select></label>
              <Sim rotulo="Mourões instalados antes da montagem" valor={entrada.mouroes_antes} onChange={(v) => set('mouroes_antes', v)} />
            </div>
          </section>

          {/* ---------- Prazo e equipes ---------- */}
          <section className="card stack">
            <h2 className="card-title">Prazo e equipes {!r.prazo.aplica && <small className="note"> · não se aplica a somente material</small>}</h2>
            <div className="orc-campos">
              <Num rotulo="Dias úteis desejados" valor={pr.dias_desejados} onChange={(v) => set('prazo.dias_desejados', v > 0 ? Math.floor(v) : '')} inteiro vazio />
              <div className="field"><span>Equipes</span>
                <div className="seg two"><button type="button" className={pr.modo !== 'manual' ? 'on' : ''} onClick={() => set('prazo.modo', 'auto')}>Automático</button>
                  <button type="button" className={pr.modo === 'manual' ? 'on' : ''} onClick={() => set('prazo.modo', 'manual')}>Manual</button></div></div>
              {pr.modo === 'manual'
                ? <Num rotulo="Equipes selecionadas" valor={pr.equipes_manual} onChange={(v) => set('prazo.equipes_manual', Math.max(1, Math.floor(v) || 1))} inteiro />
                : <div className="field"><span>Sugeridas</span><b className="orc-valor">{r.prazo.aplica ? `${r.prazo.sugeridas} → usando ${r.prazo.equipes}` : '—'}</b></div>}
              <Num rotulo="Equipes disponíveis" valor={pr.equipes_disponiveis} onChange={(v) => set('prazo.equipes_disponiveis', Math.max(1, Math.floor(v) || 1))} inteiro />
              <Num rotulo="Frentes simultâneas" valor={pr.frentes} onChange={(v) => set('prazo.frentes', Math.max(1, Math.floor(v) || 1))} inteiro />
              <label className="field"><span>Fabricação das peças</span><input value={pr.fabricacao} onChange={(e) => set('prazo.fabricacao', e.target.value)} placeholder="Ex.: 10 dias úteis após aprovação" /></label>
              <label className="field c2"><span>Entrega das peças</span><input value={pr.entrega} onChange={(e) => set('prazo.entrega', e.target.value)} placeholder="Ex.: em 2 cargas, a combinar" /></label>
            </div>
            <details className="orc-det">
              <summary>Desmobilização parcial (dias-equipe reais)</summary>
              <div className="orc-campos">
                <Num rotulo="Total de dias-equipe" valor={pr.dias_equipe_reais} onChange={(v) => set('prazo.dias_equipe_reais', v > 0 ? Math.floor(v) : '')} inteiro vazio />
                <label className="field c3"><span>Motivo do ajuste</span><input value={pr.motivo_ajuste} onChange={(e) => set('prazo.motivo_ajuste', e.target.value)} placeholder="Ex.: 2ª equipe sai no 2º dia" /></label>
              </div>
            </details>
          </section>

          {/* ---------- Condições ---------- */}
          <section className="card stack">
            <h2 className="card-title">Condições da obra</h2>
            <div className="orc-campos">
              <Opc rotulo="Terreno" valor={cd.terreno} onChange={(v) => set('condicoes.terreno', v)} ops={[['plano', 'Plano'], ['irregular', 'Irregular']]} />
              <Opc rotulo="Acesso" valor={cd.acesso} onChange={(v) => set('condicoes.acesso', v)} ops={[['livre', 'Livre'], ['restrito', 'Restrito']]} />
              <Num rotulo="Distância (km)" valor={cd.distancia_km} onChange={(v) => set('condicoes.distancia_km', v || '')} vazio />
              <Opc rotulo="Equipamentos (munck etc.)" valor={cd.equipamentos} onChange={(v) => set('condicoes.equipamentos', v)} ops={[['nao', 'Não precisa'], ['sim', 'Precisa']]} />
              <Opc rotulo="Frete" valor={cd.frete} onChange={(v) => set('condicoes.frete', v)} ops={[['cliente', 'Por conta do cliente'], ['definir', 'A definir']]} />
              <Opc rotulo="Fundações" valor={cd.fundacoes} onChange={(v) => set('condicoes.fundacoes', v)} ops={[['terceiros', 'Cliente'], ['definir', 'A definir']]} />
              <Opc rotulo="Peças" valor={cd.pecas} onChange={(v) => set('condicoes.pecas', v)} ops={[['estoque', 'Disponíveis'], ['fabricar', 'A fabricar']]} />
              <Opc rotulo="Frente de trabalho" valor={cd.frente} onChange={(v) => set('condicoes.frente', v)} ops={[['liberada', 'Liberada'], ['confirmar', 'A confirmar']]} />
            </div>
          </section>

          {/* ---------- Comercial ---------- */}
          <section className="card stack">
            <h2 className="card-title">Comercial</h2>
            <p className="note">Tabela aplicada: <b>{params.nome_tabela || 'Tabela'}{paramsVersao ? ` (versão ${paramsVersao})` : ''}</b> · placa {brl(params.precos?.placa)} · mourão {brl(params.precos?.mourao)} · montagem {brl(params.precos?.montagem_m)}/m</p>
            <div className="orc-campos">
              <Num rotulo="Desconto no material (%)" valor={cm.desconto_material_pct} onChange={(v) => set('comercial.desconto_material_pct', Math.max(0, Math.min(100, v)))}
                dica={r.gestao.limites.descontoMaxMaterial != null && r.comercial.material.tabela ? `máx. ${pct(Math.max(0, r.gestao.limites.descontoMaxMaterial - 0.0001))} (margem > ${pct(r.gestao.limites.margemMinMaterial)})` : ''} />
              <Num rotulo="Desconto na instalação (%)" valor={cm.desconto_instalacao_pct} onChange={(v) => set('comercial.desconto_instalacao_pct', Math.max(0, Math.min(100, v)))}
                dica={params.margem_instalacao_min == null ? 'precisa de autorização' : ''} />
              <Num rotulo="Desconto global (%)" valor={cm.desconto_global_pct} onChange={(v) => set('comercial.desconto_global_pct', Math.max(0, Math.min(100, v)))} dica="rateado entre material e instalação" />
              {(r.comercial.instalacao.desconto > 0 && params.margem_instalacao_min == null) && (
                <div className="field"><span>Autorização do desconto na instalação</span>
                  {cm.autorizacao_instalacao
                    ? <span className="orc-autorizado">Autorizado por {cm.autorizacao_instalacao.por} <button type="button" className="link-btn" onClick={() => set('comercial.autorizacao_instalacao', null)}>retirar</button></span>
                    : <button type="button" className="pill" onClick={() => set('comercial.autorizacao_instalacao', { por: eu?.nome || 'administrador', em: new Date().toISOString() })}>Autorizar desconto</button>}
                </div>
              )}
            </div>
            <div className="orc-lista">
              <span className="field-rot">Adicionais e itens especiais</span>
              {(cm.adicionais || []).length > 0 && (
                <div className="orc-ad-cab"><span>Descrição</span><span>Qtd.</span><span>Un.</span><span>Preço un.</span><span>Custo un.</span><span>Componente</span><span>Cobrado</span><span /></div>
              )}
              {(cm.adicionais || []).map((a, i) => (
                <div key={a.id || i} className="orc-ad">
                  <input className="input" value={a.descricao} onChange={(e) => mudar((x) => { x.comercial.adicionais[i].descricao = e.target.value; })} aria-label="Descrição" />
                  <Num valor={a.quantidade} onChange={(v) => mudar((x) => { x.comercial.adicionais[i].quantidade = v; })} aria="Quantidade" />
                  <input className="input" value={a.unidade || ''} onChange={(e) => mudar((x) => { x.comercial.adicionais[i].unidade = e.target.value; })} aria-label="Unidade" />
                  <Num valor={a.preco} onChange={(v) => mudar((x) => { x.comercial.adicionais[i].preco = v; })} aria="Preço unitário" />
                  <Num valor={a.custo} onChange={(v) => mudar((x) => { x.comercial.adicionais[i].custo = v; })} aria="Custo unitário" />
                  <select className="input" value={a.componente || 'outro'} onChange={(e) => mudar((x) => { x.comercial.adicionais[i].componente = e.target.value; })} aria-label="Componente">
                    <option value="material">Material</option><option value="instalacao">Instalação</option><option value="outro">Outro</option>
                  </select>
                  <input type="checkbox" checked={a.cobrado !== false} onChange={(e) => mudar((x) => { x.comercial.adicionais[i].cobrado = e.target.checked; })} aria-label="Cobrado do cliente" />
                  <button type="button" className="x-btn" aria-label="Tirar" onClick={() => mudar((x) => { x.comercial.adicionais.splice(i, 1); })}>×</button>
                </div>
              ))}
              <button type="button" className="add-line" onClick={() => mudar((x) => { x.comercial.adicionais.push({ id: novoId(), descricao: '', quantidade: 1, unidade: 'vb', preco: 0, custo: 0, componente: 'outro', cobrado: true }); })}>+ Adicional</button>
            </div>
            <div className="orc-campos">
              <label className="field c2"><span>Observações (vão na proposta)</span><textarea rows={3} value={cm.observacoes} onChange={(e) => set('comercial.observacoes', e.target.value)} /></label>
              <label className="field c2"><span>Outras exclusões (uma por linha)</span><textarea rows={3} value={cm.exclusoes_extra} onChange={(e) => set('comercial.exclusoes_extra', e.target.value)} /></label>
            </div>
            {r.exclusoes.length > 0 && <p className="note">Não incluso na proposta: {r.exclusoes.join(' · ')}</p>}
          </section>
        </fieldset>

        {/* ---------- Resumo (fica ao lado, sempre atualizado) ---------- */}
        <aside className="orc-resumo">
          <section className="card stack orc-total">
            <span className="modal-kicker">{r.final ? 'Total comercial' : 'Total dos itens definidos (prévia)'}</span>
            <b className="orc-total-v">{r.ok ? brl(r.comercial.total) : '—'}</b>
            {r.ok && <span className="note">{brl(r.comercial.porM)}/m · {brl(r.comercial.porM2)}/m² sobre a medida solicitada</span>}
            {r.ok && (
              <table className="orc-tab">
                <tbody>
                  {r.escopo.material && <tr><td>Material</td><td>{brl(r.comercial.material.tabela)}</td></tr>}
                  {r.escopo.montagem && <tr><td>Montagem das placas{r.comercial.tarifaProvisoria ? ' *' : ''}</td><td>{brl(r.comercial.instalacao.tabela)}</td></tr>}
                  {r.comercial.adicionais > 0 && <tr><td>Adicionais</td><td>{brl(r.comercial.adicionais)}</td></tr>}
                  {r.comercial.desconto > 0 && <tr><td>Desconto</td><td>− {brl(r.comercial.desconto)}</td></tr>}
                </tbody>
              </table>
            )}
          </section>

          {r.ok && (
            <section className="card stack">
              <h2 className="card-title">Quantitativos e prazo</h2>
              <div className="orc-qts">
                <Q rot="Extensão" v={fmtM(r.qt.L)} /><Q rot="Área" v={`${fmtN(r.qt.area)} m²`} />
                <Q rot="Vãos" v={r.qt.vaos} sub={`${fmtM(r.qt.modular)} modulares`} /><Q rot="Placas/vão" v={r.ppv} />
                <Q rot="Placas" v={r.qt.placas} sub={r.qt.placasFornecidas !== r.qt.placas ? `${r.qt.placasFornecidas} fornecidas` : 'fornecidas'} />
                <Q rot="Mourões" v={r.qt.mouroes} sub={r.qt.mouroesFornecidos !== r.qt.mouroes ? `${r.qt.mouroesFornecidos} fornecidos` : 'fornecidos'} />
                {r.prazo.aplica && <><Q rot="Equipes" v={r.prazo.equipes} /><Q rot="Montagem" v={`${r.prazo.dias} dia${r.prazo.dias > 1 ? 's' : ''}`} sub={r.prazo.atende ? '' : 'acima do desejado'} ruim={!r.prazo.atende} /></>}
              </div>
            </section>
          )}

          {(r.erros.length + r.bloqueios.length + r.pendencias.length + r.avisos.length) > 0 && (
            <section className="card stack orc-alertas">
              {r.erros.map((x) => <p key={x} className="orc-al erro">{x}</p>)}
              {r.bloqueios.map((b) => <p key={b.id} className="orc-al bloq">{b.texto}</p>)}
              {r.pendencias.map((p) => (
                <div key={p.id} className="orc-al pend">
                  <span>{p.texto}</span>
                  {!travado && (p.tipo === 'exclusao' ? (
                    <span className="orc-al-acoes">
                      <button type="button" className="link-btn" onClick={() => resolver(p, 'excluir')}>Excluir da proposta</button>
                      <button type="button" className="link-btn" onClick={() => resolver(p, 'adicional')}>Cobrar como adicional</button>
                    </span>
                  ) : <span className="orc-al-acoes"><button type="button" className="link-btn" onClick={() => window.confirm('Confirma que isto foi validado tecnicamente? Fica registrado com o seu nome.') && resolver(p, 'validado')}>Marcar como validado</button></span>)}
                </div>
              ))}
              {r.avisos.map((x) => <p key={x} className="orc-al aviso">{x}</p>)}
            </section>
          )}
          {resolvidas.length > 0 && (
            <details className="card orc-resolvidas"><summary>{resolvidas.length} item(ns) resolvido(s)</summary>
              {resolvidas.map(([k, v]) => <p key={k} className="note">{k}: {v.acao === 'excluir' ? `excluído (${v.exclusao})` : v.acao === 'adicional' ? 'cobrado como adicional' : 'validado'}{v.por ? ` por ${v.por}` : ''}
                {!travado && <button type="button" className="link-btn" onClick={() => desfazerResolucao(k)}> desfazer</button>}</p>)}
            </details>
          )}

          {r.ok && (
            <section className="card stack orc-gestao">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="card-title">Painel de gestão</h2>
                <button type="button" className="link-btn" onClick={() => setVerGestao(!verGestao)}>{verGestao ? 'Ocultar' : 'Mostrar'}</button>
              </div>
              {verGestao && <Gestao r={r} params={params} />}
            </section>
          )}
        </aside>
      </div>

      {apresentar && <Apresentacao pc={pc} travado={travado} entrada={entrada} mudar={set} onFechar={() => setApresentar(false)} />}
      {whats && <Whats texto={whats.texto} soCopiar={whats.soCopiar} telefone={entrada.telefone} onFechar={() => setWhats(null)} avisar={avisar} />}
      {hist && <Historico hist={hist} dados={dados} params={params} entrada={entrada} onFechar={() => setHist(null)} numero={numeroOrc(row || orcamento)} />}
    </div>
  );
}

function Gestao({ r, params }) {
  const g = r.gestao;
  const temOutros = !!(g.outros.receita || g.outros.custos || g.outros.reservas);
  const cols = temOutros ? [g.material, g.instalacao, g.outros, g.total] : [g.material, g.instalacao, g.total];
  const col = (k) => cols.map((c) => c[k]);
  const linhas = [
    ['Receita', col('receita').map(brl)],
    [`Impostos (${pct(params.aliquota)})`, col('impostos').map((v) => '− ' + brl(v))],
    ['Custos conhecidos', col('custos').map((v) => '− ' + brl(v))],
    ['Resultado após custos conhecidos', col('resultado').map(brl), 'forte'],
    ['Margem', col('margem').map(pct)],
    ['Reservas e despesas cadastradas', col('reservas').map((v) => '− ' + brl(v || 0))],
    ['Resultado após reservas', col('resultadoApos').map(brl), 'forte'],
    ['Margem após reservas', col('margemApos').map(pct), 'forte'],
  ];
  return (
    <>
      <table className="orc-gtab">
        <thead><tr><th /><th>Material</th><th>Instalação</th>{temOutros && <th>Outros</th>}<th>Total</th></tr></thead>
        <tbody>{linhas.map(([rot, vals, cls]) => <tr key={rot} className={cls || ''}><td>{rot}</td>{vals.map((v, i) => <td key={i} className={typeof v === 'string' && v.startsWith('-R') ? 'bad' : ''}>{v}</td>)}</tr>)}</tbody>
      </table>
      <ul className="orc-gnotas">
        {r.prazo.aplica && <li>FTE: {r.prazo.diasEquipe} dia(s)-equipe × {brl(params.fte_dia)} = <b>{brl(r.prazo.fte)}</b>{r.prazo.ajusteManual ? ' (ajuste manual)' : ''}</li>}
        <li>Custo fabril (placas e mourões): <b>{brl(g.custosConhecidosMaterial)}</b></li>
        {g.limites.descontoMaxMaterial != null && r.comercial.material.tabela > 0 && (
          <li>Material: preço no limite de {pct(g.limites.margemMinMaterial)} = {brl(g.limites.precoLimiteMaterial)} · desconto máximo {pct(g.limites.descontoMaxMaterial)} · meta {pct(g.limites.metaMaterial)}</li>
        )}
        <li>Instalação: {params.margem_instalacao_min == null ? 'piso de margem ainda não definido (desconto só com autorização)' : `piso ${pct(params.margem_instalacao_min)}`}</li>
        <li className="note">Resultado estimado — não é lucro líquido: podem faltar despesas não cadastradas.</li>
      </ul>
    </>
  );
}

// ---------- campos ----------
function Num({ rotulo, valor, onChange, sufixo, inteiro, vazio, curto, grande, dica, aria }) {
  const fmt = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));
  const [txt, setTxt] = useState(fmt(valor));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTxt(fmt(valor)); }, [valor]);
  const muda = (t) => {
    setTxt(t);
    const limpo = t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (limpo === '' && vazio) { onChange(''); return; }
    const x = Number(limpo);
    if (Number.isFinite(x)) onChange(inteiro ? Math.floor(x) : x);
  };
  const input = (
    <span className={'orc-num' + (curto ? ' curto' : '') + (grande ? ' grande' : '')}>
      <input className="input" value={txt} inputMode={inteiro ? 'numeric' : 'decimal'} aria-label={aria || rotulo}
        onFocus={() => { foco.current = true; }} onBlur={() => { foco.current = false; setTxt(fmt(valor)); }} onChange={(e) => muda(e.target.value)} />
      {sufixo && <i>{sufixo}</i>}
    </span>
  );
  if (!rotulo) return input;
  return <label className="field"><span>{rotulo}</span>{input}{dica && <small className="orc-dica">{dica}</small>}</label>;
}
function Sim({ rotulo, valor, onChange, desab }) {
  return (
    <div className="field"><span>{rotulo}</span>
      <div className="seg two"><button type="button" disabled={desab} className={valor ? 'on' : ''} onClick={() => onChange(true)}>Sim</button>
        <button type="button" disabled={desab} className={!valor ? 'on' : ''} onClick={() => onChange(false)}>Não</button></div></div>
  );
}
function Opc({ rotulo, valor, onChange, ops }) {
  return (
    <div className="field"><span>{rotulo}</span>
      <div className="seg two">{ops.map(([v, t]) => <button key={v} type="button" className={valor === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}</div></div>
  );
}
const Q = ({ rot, v, sub, ruim }) => <div className={'orc-q' + (ruim ? ' ruim' : '')}><span>{rot}</span><b>{v}</b>{sub && <small>{sub}</small>}</div>;

// ---------- WhatsApp: prepara o texto; quem envia é a pessoa ----------
function Whats({ texto, telefone, onFechar, avisar, soCopiar }) {
  const [t, setT] = useState(texto);
  const fone = String(telefone || '').replace(/\D/g, '');
  const link = `https://wa.me/${fone ? (fone.length <= 11 ? '55' + fone : fone) : ''}?text=${encodeURIComponent(t)}`;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Texto da proposta" style={{ maxWidth: 640 }}>
        <div className="modal-head"><div><span className="modal-kicker">{soCopiar ? 'Copiar proposta' : 'WhatsApp'}</span><h2>Revise o texto antes de enviar</h2></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button></div>
        <textarea className="input orc-whats" value={t} onChange={(e) => setT(e.target.value)} rows={16} />
        <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pill" onClick={async () => { try { await navigator.clipboard.writeText(t); avisar('Texto copiado.'); } catch { avisar('Selecione o texto e copie.'); } }}>Copiar texto</button>
          {!soCopiar && <a className="pill lime" href={link} target="_blank" rel="noreferrer">Abrir no WhatsApp{fone ? '' : ' (escolher contato)'}</a>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Histórico e revisões emitidas ----------
const ROT_CAMPO = { criado: 'Criado', status: 'Status', total: 'Total', revisao: 'Revisão', tabela: 'Versão da tabela', geometria: 'Geometria', escopo: 'Escopo', fornece_placas: 'Fornece placas', fornece_mouroes: 'Fornece mourões', prazo: 'Prazo e equipes', desconto_material_pct: 'Desconto material (%)', desconto_instalacao_pct: 'Desconto instalação (%)', desconto_global_pct: 'Desconto global (%)', adicionais: 'Adicionais', autorizacao_instalacao: 'Autorização do desconto' };
function resumir(campo, v) {
  if (v == null) return '—';
  if (campo === 'total') return brl(v);
  if (campo === 'status') return statusNome[v] || v;
  if (campo === 'geometria') return `${v.modo === 'trechos' ? (v.trechos || []).map((t) => fmtN(t.comprimento)).join(' + ') + ' m' : fmtM(v.comprimento)} × ${fmtM(v.altura)}`;
  if (campo === 'adicionais') return `${(v || []).length} item(ns)`;
  if (campo === 'prazo') return `${v.modo === 'manual' ? `${v.equipes_manual} equipe(s)` : 'automático'}${v.dias_desejados ? ` · ${v.dias_desejados} dias desejados` : ''}`;
  if (campo === 'criado') return v.total != null ? brl(v.total) : '';
  if (typeof v === 'object') return v.por ? `por ${v.por}` : JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}
function Historico({ hist, dados, onFechar, numero }) {
  const nome = (id) => dados.perfis.find((p) => p.id === id)?.nome || '—';
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Histórico" style={{ maxWidth: 760 }}>
        <div className="modal-head"><div><span className="modal-kicker">{numero}</span><h2>Histórico e revisões</h2></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button></div>
        {hist.erro && <div className="err">{hist.erro}</div>}
        <h3 className="orc-h3">Revisões emitidas</h3>
        {hist.versoes.length ? (
          <ul className="frases-lista">
            {hist.versoes.map((v) => {
              const r = calcular(v.entrada, v.parametros);
              const pc = propostaComercial(r, v.entrada, v.parametros, { numero, revisao: v.revisao });
              return (
                <li key={v.id}><span><b>Rev. {v.revisao}</b> · {brl(v.total)} · emitida {new Date(v.emitida_em).toLocaleString('pt-BR')} por {nome(v.emitida_por)}</span>
                  <button type="button" className="link-btn" onClick={() => abrirPdf({ ...pc, final: true })}>PDF desta revisão</button></li>
              );
            })}
          </ul>
        ) : <p className="note">Nenhuma revisão emitida ainda.</p>}
        <h3 className="orc-h3">Alterações</h3>
        <div className="epi-tabela-wrap">
          <table className="epi-tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Antes</th><th>Depois</th></tr></thead>
            <tbody>
              {hist.historico.map((h) => (
                <tr key={h.id}><td>{new Date(h.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>{nome(h.autor_id)}</td>
                  <td>{ROT_CAMPO[h.campo] || h.campo}</td><td>{resumir(h.campo, h.antes)}</td><td>{resumir(h.campo, h.depois)}</td></tr>
              ))}
              {!hist.historico.length && <tr><td colSpan={5} className="empty">Sem alterações registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
