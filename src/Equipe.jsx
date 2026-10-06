import { useState } from 'react';
import { addDias, fmt, hoje, iniciais } from './lib.js';
import { brl, brlCentavos, custoAtual } from './custos.js';

export function Equipe({ dados, pode = {} }) {
  const admin = !!pode.admin;
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome, funcao }
  const dia = hoje();
  const demandaNome = Object.fromEntries(dados.demandas.map((d) => [d.id, d.nome]));

  const ativos = dados.funcionarios.filter((f) => f.ativo);
  const inativos = dados.funcionarios.filter((f) => !f.ativo);
  const ausHoje = (id) => dados.ausencias.find((a) => a.funcionario_id === id && a.dia === dia);
  const ondeHoje = (id) =>
    dados.alocacoes.filter((a) => a.funcionario_id === id && a.dia === dia).map((a) => demandaNome[a.demanda_id]).filter(Boolean);

  const adicionar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    await dados.adicionarFuncionario(nome.trim(), funcao.trim());
    setNome(''); setFuncao('');
  };
  const salvarEdicao = async () => {
    if (!editando.nome.trim()) return;
    await dados.atualizarFuncionario(editando.id, { nome: editando.nome.trim(), funcao: editando.funcao?.trim() || null });
    if (admin && editando.custo !== '') {
      const valor = lerValor(editando.custo);
      const atual = custoAtual(editando.id, dados.custos_funcionarios);
      if (valor != null && (!atual || Number(atual.custo_diario) !== valor || atual.vigente_desde !== editando.desde)) {
        await dados.definirCusto(editando.id, valor, editando.desde || dia);
      }
    }
    setEditando(null);
  };
  const abrirEdicao = (f) => {
    const c = admin ? custoAtual(f.id, dados.custos_funcionarios) : null;
    setEditando({ id: f.id, nome: f.nome, funcao: f.funcao, custo: c ? Number(c.custo_diario).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(c.custo_diario)) ? 0 : 2, maximumFractionDigits: 2 }) : '', desde: dia });
  };
  const custoHoje = (id) => custoAtual(id, dados.custos_funcionarios);
  const historico = (id) => dados.custos_funcionarios.filter((c) => c.funcionario_id === id)
    .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  const somaDia = ativos.reduce((t, f) => t + (Number(custoHoje(f.id)?.custo_diario) || 0), 0);
  const semCusto = ativos.filter((f) => !custoHoje(f.id)).length;

  return (
    <>
      <header className="head">
        <div>
          <h1>Equipes</h1>
          <p className="date">
            {ativos.length} funcionários ativos
            {admin && dados.custos_funcionarios && ` · custo da equipe ${brl(somaDia)} por dia${semCusto ? ` (${semCusto} sem custo cadastrado)` : ''}`}
          </p>
        </div>
      </header>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Adicionar funcionário</h2>
        <form className="add-form" onSubmit={adicionar}>
          <label className="field"><span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Natan" />
          </label>
          <label className="field"><span>Função (opcional)</span>
            <input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: pedreiro, impermeabilizador" />
          </label>
          <button type="submit" className="pill lime" style={{ minHeight: 44 }} disabled={!nome.trim()}>Adicionar</button>
        </form>
      </section>

      <Ausencias dados={dados} ativos={ativos} />

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Funcionários</h2>
        <div className="people">
          {ativos.map((f) => {
            const onde = ondeHoje(f.id);
            return (
              <div key={f.id} className="person">
                <div className="avatar">{iniciais(f.nome)}</div>
                <div className="info">
                  <span className="nm">{f.nome}</span>
                  {admin && <span className="sub" style={{ fontWeight: 700, color: custoHoje(f.id) ? 'var(--brand-text)' : 'var(--late-ink)' }}>
                    {custoHoje(f.id) ? `${brlCentavos(custoHoje(f.id).custo_diario)} por dia` : 'Custo não cadastrado'}
                  </span>}
                  <span className="sub">{[f.funcao, ausHoje(f.id) ? (ausHoje(f.id).tipo === 'ferias' ? 'De férias hoje' : 'De folga hoje') : onde.length ? 'Hoje: ' + onde.join(', ') : 'Livre hoje'].filter(Boolean).join(' · ')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button type="button" className="mini" onClick={() => abrirEdicao(f)}>{admin ? 'Editar / custo' : 'Editar'}</button>
                  <button type="button" className="mini" onClick={() => dados.atualizarFuncionario(f.id, { ativo: false })}>Remover</button>
                </div>
              </div>
            );
          })}
        </div>
        {!ativos.length && <p className="empty">Nenhum funcionário cadastrado.</p>}
      </section>

      {editando && (
        <FuncionarioModal editando={editando} setEditando={setEditando} admin={admin} historico={historico(editando.id)}
          onSalvar={salvarEdicao} onFechar={() => setEditando(null)} />
      )}

      {inativos.length > 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Removidos</h2>
          <p className="empty" style={{ padding: 0 }}>O histórico de alocações deles continua guardado.</p>
          <div className="people">
            {inativos.map((f) => (
              <div key={f.id} className="person">
                <div className="avatar" style={{ background: 'var(--chip)' }}>{iniciais(f.nome)}</div>
                <div className="info"><span className="nm">{f.nome}</span></div>
                <button type="button" className="mini" onClick={() => dados.atualizarFuncionario(f.id, { ativo: true })}>Reativar</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// Marcar folga/férias por período e ver as próximas
function Ausencias({ dados, ativos }) {
  const dia = hoje();
  const [func, setFunc] = useState('');
  const [tipo, setTipo] = useState('ferias');
  const [de, setDe] = useState(dia);
  const [ate, setAte] = useState(dia);
  const [salvando, setSalvando] = useState(false);
  const nome = Object.fromEntries(dados.funcionarios.map((f) => [f.id, f.nome]));

  const marcar = async (e) => {
    e.preventDefault();
    if (!func || !de || !ate || ate < de) return;
    const dias = [];
    for (let c = de; c <= ate && dias.length < 120; c = addDias(c, 1)) dias.push(c);
    setSalvando(true);
    await dados.marcarPeriodo(func, de, ate, tipo, dias);
    setSalvando(false);
  };

  // agrupa dias seguidos do mesmo funcionário e tipo em períodos
  const periodos = [];
  [...dados.ausencias]
    .filter((a) => a.dia >= dia)
    .sort((a, b) => (a.funcionario_id + a.dia).localeCompare(b.funcionario_id + b.dia))
    .forEach((a) => {
      const p = periodos[periodos.length - 1];
      if (p && p.func === a.funcionario_id && p.tipo === a.tipo && addDias(p.ate, 1) === a.dia) { p.ate = a.dia; p.ids.push(a.id); }
      else periodos.push({ func: a.funcionario_id, tipo: a.tipo, de: a.dia, ate: a.dia, ids: [a.id] });
    });
  periodos.sort((a, b) => a.de.localeCompare(b.de));

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>Folgas e férias</h2>
      <form className="add-form" onSubmit={marcar}>
        <label className="field"><span>Funcionário</span>
          <select value={func} onChange={(e) => setFunc(e.target.value)} required>
            <option value="">Escolha…</option>
            {ativos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '0 1 150px' }}><span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="ferias">Férias</option>
            <option value="folga">Folga</option>
          </select>
        </label>
        <label className="field" style={{ flex: '0 1 170px' }}><span>De</span>
          <input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }} required />
        </label>
        <label className="field" style={{ flex: '0 1 170px' }}><span>Até</span>
          <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} required />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 44 }} disabled={!func || salvando}>{salvando ? 'Salvando…' : 'Marcar'}</button>
      </form>
      {periodos.length ? (
        <div className="people">
          {periodos.map((p) => (
            <div key={p.ids[0]} className="person">
              <div className="avatar" style={{ background: p.tipo === 'ferias' ? 'var(--yellow)' : 'var(--chip)' }}>{iniciais(nome[p.func])}</div>
              <div className="info">
                <span className="nm">{nome[p.func] || '?'}</span>
                <span className="sub">{p.tipo === 'ferias' ? 'Férias' : 'Folga'} · {p.de === p.ate ? fmt(p.de) : fmt(p.de) + ' a ' + fmt(p.ate)}</span>
              </div>
              <button type="button" className="mini" onClick={() => p.ids.forEach((id) => dados.removerAusencia(id))}>Cancelar</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty" style={{ padding: 0 }}>Nenhuma folga ou férias marcada daqui pra frente. Também dá para arrastar na agenda, na faixa “Fora da obra”.</p>
      )}
    </section>
  );
}

// aceita "250", "250,50", "1.250,00" e "250.50"
function lerValor(s) {
  if (s === '' || s == null) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function FuncionarioModal({ editando, setEditando, admin, historico, onSalvar, onFechar }) {
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setEditando({ ...editando, [k]: e.target.value });
  const valor = lerValor(editando.custo);
  const salvar = async (e) => {
    e.preventDefault();
    if (!editando.nome.trim()) return;
    setSalvando(true);
    await onSalvar();
    setSalvando(false);
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()} onKeyDown={(e) => e.key === 'Escape' && onFechar()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={`Editar ${editando.nome}`} onSubmit={salvar} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar lg">{iniciais(editando.nome)}</div>
            <div>
              <span className="modal-kicker">Funcionário</span>
              <h2>{editando.nome || 'Sem nome'}</h2>
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>

        <div className="grid2">
          <label className="field"><span>Nome</span>
            <input value={editando.nome} onChange={set('nome')} required />
          </label>
          <label className="field"><span>Função</span>
            <input value={editando.funcao || ''} onChange={set('funcao')} placeholder="Ex.: pedreiro, encarregado" />
          </label>
        </div>

        {admin && (
          <div className="custo-box">
            <span className="modal-kicker">Quanto custa por dia</span>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input autoFocus inputMode="decimal" aria-label="Custo por dia em reais" placeholder="0,00"
                value={editando.custo} onChange={set('custo')} />
              <span className="per" aria-hidden="true">/ dia</span>
            </div>
            <div className="grid2" style={{ alignItems: 'end' }}>
              <label className="field"><span>Vale a partir de</span>
                <input type="date" value={editando.desde} onChange={set('desde')} />
              </label>
              <p className="note" style={{ paddingBottom: 6 }}>
                {valor != null ? <>≈ <b>{brl(valor * 22)}</b> por mês (22 dias)</> : 'Inclua salário, encargos e alimentação.'}
              </p>
            </div>
            {historico.length > 0 && (
              <div className="hist">
                <span className="modal-kicker">Histórico de valores</span>
                <ul>
                  {[...historico].reverse().map((c) => (
                    <li key={c.id}><span>desde {fmt(c.vigente_desde)}</span><b>{brlCentavos(c.custo_diario)}</b></li>
                  ))}
                </ul>
              </div>
            )}
            <p className="note">Um valor novo vale a partir da data escolhida. Os dias anteriores continuam com o valor antigo no custo das obras.</p>
          </div>
        )}

        <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pill ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="pill lime" disabled={salvando || !editando.nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
