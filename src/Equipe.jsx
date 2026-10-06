import { useState } from 'react';
import { hoje, iniciais } from './lib.js';

export function Equipe({ dados }) {
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome, funcao }
  const dia = hoje();
  const demandaNome = Object.fromEntries(dados.demandas.map((d) => [d.id, d.nome]));

  const ativos = dados.funcionarios.filter((f) => f.ativo);
  const inativos = dados.funcionarios.filter((f) => !f.ativo);
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
                      <span className="sub">{[f.funcao, onde.length ? 'Hoje: ' + onde.join(', ') : 'Livre hoje'].filter(Boolean).join(' · ')}</span>
                    </>
                  )}
                </div>
                {ed ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" className="mini" style={{ background: '#D7F26A' }} onClick={salvarEdicao}>Salvar</button>
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
                <div className="avatar" style={{ background: '#E3E6EA' }}>{iniciais(f.nome)}</div>
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
