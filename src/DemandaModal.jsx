import { useEffect, useState } from 'react';
import { EMPRESAS, FASES, PAGAMENTOS, empresaPorId, resumoProducao } from './lib.js';

const VAZIA = {
  empresa: 'engenharia', grupo: '', nome: '', descricao: '', fase: 'orcamento', percentual: 0,
  inicio: '', entrega: '', pagamento: 'a_faturar', qtd_total: '', qtd_produzida: 0, unidade: '', arquivada: false,
};

export function DemandaModal({ inicial, grupos, onFechar, onSalvar, onExcluir }) {
  const novo = !inicial?.id;
  const [d, setD] = useState(() => ({ ...VAZIA, ...inicial, inicio: inicial?.inicio || '', entrega: inicial?.entrega || '', qtd_total: inicial?.qtd_total ?? '' }));
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const set = (campo) => (v) => setD((x) => ({ ...x, [campo]: v }));
  const producao = d.empresa === 'eko';
  const total = Number(d.qtd_total) || 0;

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const salvar = async (extra = {}) => {
    if (!d.nome.trim()) return;
    setSalvando(true);
    const dados = {
      ...d, ...extra,
      nome: d.nome.trim(),
      grupo: d.grupo.trim() || (producao ? 'Produção' : d.empresa === 'engenharia' ? 'Obras civis' : 'Obras'),
      inicio: d.inicio || null,
      entrega: d.entrega || null,
      percentual: Math.max(0, Math.min(100, Number(d.percentual) || 0)),
      qtd_total: producao && total > 0 ? total : null,
      qtd_produzida: producao ? Math.max(0, Number(d.qtd_produzida) || 0) : 0,
      unidade: producao ? d.unidade || null : null,
    };
    if (dados.qtd_total) dados.percentual = Math.min(100, Math.round((dados.qtd_produzida / dados.qtd_total) * 100));
    const ok = await onSalvar(dados);
    setSalvando(false);
    if (ok !== false) onFechar();
  };

  const somar = (n) => set('qtd_produzida')(Math.max(0, (Number(d.qtd_produzida) || 0) + n));
  const empresaGrupos = grupos[d.empresa] || [];

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={novo ? 'Nova demanda' : 'Editar demanda'}
        onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="modal-head">
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5F6672' }}>{novo ? 'Nova demanda' : empresaPorId[d.empresa]?.nome}</span>
            <h2>{d.nome || 'Sem nome'}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>

        <div className="grid2">
          <label className="field"><span>Nome</span>
            <input autoFocus={novo} value={d.nome} onChange={(e) => set('nome')(e.target.value)} placeholder="Ex.: Obra Riviera, SPO765" required />
          </label>
          <label className="field"><span>Empresa</span>
            <select value={d.empresa} onChange={(e) => set('empresa')(e.target.value)}>
              {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="field"><span>Cliente / grupo</span>
            <input list="grupos-lista" value={d.grupo} onChange={(e) => set('grupo')(e.target.value)} placeholder="Ex.: Obras civis, Help, Agplan" />
            <datalist id="grupos-lista">{empresaGrupos.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="field"><span>Descrição</span>
            <input value={d.descricao || ''} onChange={(e) => set('descricao')(e.target.value)} placeholder="Ex.: Obra, Telecom, 30 kg · 30 MPa" />
          </label>
        </div>

        <div className="field"><span>Fase</span>
          <div className="seg">
            {FASES.map((f) => (
              <button type="button" key={f.id} className={d.fase === f.id ? 'on' : ''} aria-pressed={d.fase === f.id}
                onClick={() => set('fase')(f.id)}>{f.nome}</button>
            ))}
          </div>
        </div>

        {producao ? (
          <div className="prod-box">
            <div className="grid2">
              <label className="field"><span>Produzir (quantidade)</span>
                <input type="number" min="0" inputMode="numeric" value={d.qtd_total} onChange={(e) => set('qtd_total')(e.target.value)} placeholder="1000" />
              </label>
              <label className="field"><span>Unidade</span>
                <input value={d.unidade || ''} onChange={(e) => set('unidade')(e.target.value)} placeholder="sacos, placas, mourões" />
              </label>
              <label className="field"><span>Já produzido</span>
                <input type="number" min="0" inputMode="numeric" value={d.qtd_produzida} onChange={(e) => set('qtd_produzida')(e.target.value)} />
              </label>
              <label className="field"><span>Produzir até</span>
                <input type="date" value={d.entrega} onChange={(e) => set('entrega')(e.target.value)} />
              </label>
            </div>
            <div className="quick" aria-label="Somar produção do dia">
              {[10, 50, 100, 250].map((n) => <button type="button" key={n} onClick={() => somar(n)}>+{n}</button>)}
            </div>
            {total > 0 && (
              <div className="prod-sum">{resumoProducao({ ...d, qtd_total: total, qtd_produzida: Number(d.qtd_produzida) || 0, entrega: d.entrega || null })}</div>
            )}
          </div>
        ) : (
          <>
            <div className="field"><span>Andamento</span>
              <div className="range-row">
                <input type="range" min="0" max="100" step="5" value={d.percentual} onChange={(e) => set('percentual')(Number(e.target.value))} aria-label="Percentual concluído" />
                <input className="field" style={{ border: '1.5px solid #E3E6EA', borderRadius: 12, minHeight: 44, padding: '0 10px' }}
                  type="number" min="0" max="100" value={d.percentual} onChange={(e) => set('percentual')(e.target.value)} aria-label="Percentual em número" />
              </div>
            </div>
            <div className="grid2">
              <label className="field"><span>Início</span>
                <input type="date" value={d.inicio} onChange={(e) => set('inicio')(e.target.value)} />
              </label>
              <label className="field"><span>Entrega máxima</span>
                <input type="date" value={d.entrega} onChange={(e) => set('entrega')(e.target.value)} />
              </label>
            </div>
          </>
        )}

        <div className="field"><span>Pagamento</span>
          <div className="seg three">
            {PAGAMENTOS.map((p) => (
              <button type="button" key={p.id} className={d.pagamento === p.id ? 'on' : ''} aria-pressed={d.pagamento === p.id}
                onClick={() => set('pagamento')(p.id)}>{p.nome}</button>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <div className="row">
            {!novo && !confirmar && <button type="button" className="pill ghost" onClick={() => setConfirmar(true)}>Excluir</button>}
            {!novo && confirmar && (
              <button type="button" className="pill danger" onClick={async () => { await onExcluir(d.id); onFechar(); }}>Confirmar exclusão</button>
            )}
            {!novo && (
              <button type="button" className="pill ghost" disabled={salvando} onClick={() => salvar({ arquivada: !d.arquivada })}>
                {d.arquivada ? 'Reabrir' : 'Concluir e arquivar'}
              </button>
            )}
          </div>
          <div className="row">
            <button type="button" className="pill ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="pill lime" disabled={salvando || !d.nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
