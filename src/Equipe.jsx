import { useState } from 'react';
import { addDias, fmt, hoje, iniciais } from './lib.js';

export function Equipe({ dados }) {
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
    setEditando(null);
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Equipes</h1>
          <p className="date">{ativos.length} funcionários ativos</p>
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
            const ed = editando?.id === f.id;
            return (
              <div key={f.id} className="person">
                <div className="avatar">{iniciais(f.nome)}</div>
                <div className="info">
                  {ed ? (
                    <>
                      <input aria-label="Nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                      <input aria-label="Função" placeholder="Função" value={editando.funcao || ''} onChange={(e) => setEditando({ ...editando, funcao: e.target.value })} />
                    </>
                  ) : (
                    <>
                      <span className="nm">{f.nome}</span>
                      <span className="sub">{[f.funcao, ausHoje(f.id) ? (ausHoje(f.id).tipo === 'ferias' ? 'De férias hoje' : 'De folga hoje') : onde.length ? 'Hoje: ' + onde.join(', ') : 'Livre hoje'].filter(Boolean).join(' · ')}</span>
                    </>
                  )}
                </div>
                {ed ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" className="mini lime" onClick={salvarEdicao}>Salvar</button>
                    <button type="button" className="mini" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" className="mini" onClick={() => setEditando({ id: f.id, nome: f.nome, funcao: f.funcao })}>Editar</button>
                    <button type="button" className="mini" onClick={() => dados.atualizarFuncionario(f.id, { ativo: false })}>Remover</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!ativos.length && <p className="empty">Nenhum funcionário cadastrado.</p>}
      </section>

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
