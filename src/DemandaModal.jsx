import { ClienteCampo } from './ClienteCampo.jsx';
import { useEffect, useState } from 'react';
import { CustosObra } from './CustosObra.jsx';
import { EMPRESAS, PAGAMENTOS, PRODUTOS_EKO, empresaPorId, fasesDe, resumoProducao, tempoRelativo } from './lib.js';

const PADRAO_CONCRETO = '20 kg · 30 MPa';

const VAZIA = {
  empresa: 'engenharia', grupo: '', nome: '', descricao: '', fase: 'orcamento', percentual: 0,
  inicio: '', entrega: '', pagamento: 'a_faturar', qtd_total: '', qtd_produzida: 0, unidade: '', arquivada: false,
  produto: '', especificacao: '',
};

export function DemandaModal({ inicial, grupos, clientes = [], criarCliente = null, onFechar, onSalvar, onExcluir, limitado = false, perfis = [], financeiro = null }) {
  const [aba, setAba] = useState('dados');
  const novo = !inicial?.id;
  const [d, setD] = useState(() => ({ ...VAZIA, ...inicial, inicio: inicial?.inicio || '', entrega: inicial?.entrega || '', qtd_total: inicial?.qtd_total ?? '' }));
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const set = (campo) => (v) => setD((x) => ({ ...x, [campo]: v }));
  const producao = d.empresa === 'eko';
  const fases = fasesDe(d.empresa);
  const mudarEmpresa = (empresa) => setD((x) => {
    const ok = fasesDe(empresa).some((f) => f.id === x.fase);
    return { ...x, empresa, fase: ok ? x.fase : x.fase === 'estoque' ? 'entrega' : 'orcamento' };
  });
  const mudarProduto = (produto) => setD((x) => {
    const p = PRODUTOS_EKO.find((i) => i.id === produto);
    return { ...x, produto, unidade: p?.unidade || x.unidade, especificacao: produto === 'Concreto ensacado' ? PADRAO_CONCRETO : (x.especificacao === PADRAO_CONCRETO ? '' : x.especificacao) };
  });
  const podeSalvar = producao ? !!d.produto : !!d.nome.trim();
  const total = Number(d.qtd_total) || 0;

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const salvar = async (extra = {}) => {
    if (!podeSalvar) return;
    setSalvando(true);
    const cliente = d.grupo.trim();
    const dados = {
      ...d, ...extra,
      nome: producao ? cliente || 'Estoque' : d.nome.trim(),
      grupo: producao ? cliente || 'Estoque' : cliente || (d.empresa === 'engenharia' ? 'Obras civis' : 'Obras'),
      produto: producao ? d.produto || null : null,
      especificacao: producao ? (d.produto === 'Concreto ensacado' ? PADRAO_CONCRETO : d.especificacao?.trim() || null) : null,
      inicio: d.inicio || null,
      entrega: d.entrega || null,
      percentual: Math.max(0, Math.min(100, Number(d.percentual) || 0)),
      qtd_total: producao && total > 0 ? total : null,
      qtd_produzida: producao ? Math.max(0, Number(d.qtd_produzida) || 0) : 0,
      unidade: producao ? d.unidade || null : null,
    };
    if (dados.qtd_total) dados.percentual = Math.min(100, Math.round((dados.qtd_produzida / dados.qtd_total) * 100));
    // pedido todo pronto: vai para a fase Estoque sozinho
    if (producao && dados.qtd_total && dados.qtd_produzida >= dados.qtd_total && dados.fase === 'execucao') dados.fase = 'estoque';
    // numa demanda existente, manda só o que mudou (não sobrescreve edição de outra pessoa)
    const ok = await onSalvar(novo ? dados : { id: inicial.id, ...soMudancas(dados, inicial) });
    setSalvando(false);
    if (ok !== false) onFechar();
  };

  const somar = (n) => set('qtd_produzida')(Math.max(0, (Number(d.qtd_produzida) || 0) + n));
  const autor = perfis.find((p) => p.id === inicial?.atualizado_por)?.nome;
  const L = limitado; // acesso de campo: só andamento, fase e produção

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={novo ? 'Nova demanda' : 'Editar demanda'}
        onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{novo ? (d.empresa === 'eko' ? 'Novo pedido · EQL Eko' : 'Nova demanda') : empresaPorId[d.empresa]?.nome}</span>
            <h2>{producao ? [d.produto || 'Novo pedido', d.grupo].filter(Boolean).join(' · ') : d.nome || 'Sem nome'}</h2>
            {!novo && inicial.atualizado_em && (
              <span className="modal-kicker" style={{ fontWeight: 500 }}>
                Atualizada {tempoRelativo(inicial.atualizado_em)}{autor ? ' por ' + autor : ''}
              </span>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>

        {financeiro && !novo && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={aba === 'dados'} className={aba === 'dados' ? 'on' : ''} onClick={() => setAba('dados')}>Dados da demanda</button>
            <button type="button" role="tab" aria-selected={aba === 'custos'} className={aba === 'custos' ? 'on' : ''} onClick={() => setAba('custos')}>Custos e resultado</button>
          </div>
        )}

        {aba === 'custos' && financeiro && !novo ? (
          <>
            <CustosObra demanda={inicial} dados={financeiro.dados} porDemanda={financeiro.porDemanda} />
            <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
              <span className="note" style={{ marginRight: 'auto', alignSelf: 'center' }}>Valores e lançamentos são salvos na hora.</span>
              <button type="button" className="pill ghost" onClick={onFechar}>Fechar</button>
            </div>
          </>
        ) : (<>

        {producao ? (
          <div className="grid2">
            <ClienteCampo className="span-tudo" valor={d.grupo} onChange={set('grupo')} clientes={clientes} criarCliente={criarCliente}
              disabled={L} vazio="Para estoque" autoFocus={false} />
            <label className="field"><span>Empresa</span>
              <select disabled={L} value={d.empresa} onChange={(e) => mudarEmpresa(e.target.value)}>
                {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <label className="field"><span>Produto</span>
              <select disabled={L} value={d.produto || ''} onChange={(e) => mudarProduto(e.target.value)} required>
                <option value="">Escolha…</option>
                {PRODUTOS_EKO.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
            </label>
            {d.produto === 'Concreto ensacado' ? (
              <div className="field"><span>Especificação</span>
                <div className="spec-fixa">20 kg · 30 MPa <small>padrão</small></div>
              </div>
            ) : (
              <label className="field"><span>Especificação</span>
                <input disabled={L} value={d.especificacao || ''} onChange={(e) => set('especificacao')(e.target.value)} placeholder="Ex.: 2,20 m, 25 kg" />
              </label>
            )}
            <label className="field" style={{ gridColumn: '1 / -1' }}><span>Observação {d.produto === 'Concreto ensacado' ? '(quando for diferente do padrão)' : ''}</span>
              <input disabled={L} value={d.descricao || ''} onChange={(e) => set('descricao')(e.target.value)}
                placeholder={d.produto === 'Concreto ensacado' ? 'Ex.: sacos de 30 kg, resistência 25 MPa' : 'Ex.: entregar na obra, retirar na fábrica'} />
            </label>
          </div>
        ) : (
          <div className="grid2">
            <label className="field"><span>Nome</span>
              <input autoFocus={novo} disabled={L} value={d.nome} onChange={(e) => set('nome')(e.target.value)} placeholder="Ex.: Obra Riviera, SPO765" required />
            </label>
            <label className="field"><span>Empresa</span>
              <select disabled={L} value={d.empresa} onChange={(e) => mudarEmpresa(e.target.value)}>
                {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <ClienteCampo className="span-tudo" valor={d.grupo} onChange={set('grupo')} clientes={clientes} criarCliente={criarCliente}
              disabled={L} vazio="Sem cliente" />
            <label className="field"><span>Descrição</span>
              <input disabled={L} value={d.descricao || ''} onChange={(e) => set('descricao')(e.target.value)} placeholder="Ex.: Obra, Telecom, 30 kg · 30 MPa" />
            </label>
          </div>
        )}

        <div className="field"><span>Fase</span>
          <div className={'seg' + (fases.length === 3 ? ' three' : '')}>
            {fases.map((f) => (
              <button type="button" key={f.id} className={d.fase === f.id ? 'on' : ''} aria-pressed={d.fase === f.id}
                onClick={() => set('fase')(f.id)}>{f.nome}</button>
            ))}
          </div>
        </div>

        {producao ? (
          <div className="prod-box">
            <div className="grid2">
              <label className="field"><span>Quantidade do pedido</span>
                <input type="number" min="0" inputMode="numeric" disabled={L} value={d.qtd_total} onChange={(e) => set('qtd_total')(e.target.value)} placeholder="1000" />
              </label>
              <label className="field"><span>Unidade</span>
                <input disabled={L} value={d.unidade || ''} onChange={(e) => set('unidade')(e.target.value)} placeholder="sacos, placas, mourões" />
              </label>
              <label className="field"><span>Pronto em estoque</span>
                <input type="number" min="0" inputMode="numeric" value={d.qtd_produzida} onChange={(e) => set('qtd_produzida')(e.target.value)} />
              </label>
              <label className="field"><span>Prazo</span>
                <input type="date" disabled={L} value={d.entrega} onChange={(e) => set('entrega')(e.target.value)} />
              </label>
            </div>
            <div className="quick" aria-label="Somar produção do dia ao estoque">
              <span className="prod-sum" style={{ alignSelf: 'center', marginRight: 4 }}>Produção do dia:</span>
              {[10, 50, 100, 250].map((n) => <button type="button" key={n} onClick={() => somar(n)}>+{n}</button>)}
            </div>
            {total > 0 && (() => {
              const pronto = Math.min(total, Number(d.qtd_produzida) || 0);
              const pct = Math.round((pronto / total) * 100);
              return (
                <>
                  <div className="stock-bar" aria-hidden="true"><span style={{ width: pct + '%' }} /></div>
                  <div className="stock-legend">
                    <span><i className="sq em" />Em estoque: <b>{pronto.toLocaleString('pt-BR')}</b> ({pct}%)</span>
                    <span><i className="sq falta" />A produzir: <b>{(total - pronto).toLocaleString('pt-BR')}</b> ({100 - pct}%)</span>
                  </div>
                  <div className="prod-sum">{resumoProducao({ ...d, qtd_total: total, qtd_produzida: pronto, entrega: d.entrega || null })}</div>
                </>
              );
            })()}
          </div>
        ) : (
          <>
            <div className="field"><span>Andamento</span>
              <div className="range-row">
                <input type="range" min="0" max="100" step="5" value={d.percentual} onChange={(e) => set('percentual')(Number(e.target.value))} aria-label="Percentual concluído" />
                <input className="input"
                  type="number" min="0" max="100" value={d.percentual} onChange={(e) => set('percentual')(e.target.value)} aria-label="Percentual em número" />
              </div>
            </div>
            <div className="grid2">
              <label className="field"><span>Início</span>
                <input type="date" disabled={L} value={d.inicio} onChange={(e) => set('inicio')(e.target.value)} />
              </label>
              <label className="field"><span>Entrega máxima</span>
                <input type="date" disabled={L} value={d.entrega} onChange={(e) => set('entrega')(e.target.value)} />
              </label>
            </div>
          </>
        )}

        <div className="field"><span>Pagamento</span>
          <div className="seg three">
            {PAGAMENTOS.map((p) => (
              <button type="button" key={p.id} className={d.pagamento === p.id ? 'on' : ''} aria-pressed={d.pagamento === p.id}
                disabled={L} onClick={() => set('pagamento')(p.id)}>{p.nome}</button>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <div className="row">
            {!novo && !L && !confirmar && <button type="button" className="pill ghost" onClick={() => setConfirmar(true)}>Excluir</button>}
            {!novo && confirmar && (
              <button type="button" className="pill danger" onClick={async () => { await onExcluir(d.id); onFechar(); }}>Confirmar exclusão</button>
            )}
            {!novo && !L && (
              <button type="button" className="pill ghost" disabled={salvando} onClick={() => salvar({ arquivada: !d.arquivada })}>
                {d.arquivada ? 'Reabrir' : 'Concluir e arquivar'}
              </button>
            )}
          </div>
          <div className="row">
            <button type="button" className="pill ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="pill lime" disabled={salvando || !podeSalvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        </>)}
      </form>
    </div>
  );
}

const CAMPOS = ['empresa', 'grupo', 'nome', 'descricao', 'fase', 'percentual', 'inicio', 'entrega', 'pagamento',
  'qtd_total', 'qtd_produzida', 'unidade', 'arquivada', 'produto', 'especificacao'];
function soMudancas(novo, antigo) {
  const vazio = (v) => v === '' || v === undefined || v === null;
  const igual = (a, b) => {
    if (vazio(a) && vazio(b)) return true;
    if (vazio(a) || vazio(b)) return false;
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
  };
  const out = {};
  CAMPOS.forEach((k) => { if (k in novo && !igual(novo[k], antigo?.[k])) out[k] = novo[k]; });
  return out;
}
