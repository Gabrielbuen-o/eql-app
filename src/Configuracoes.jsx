import { useRef, useState } from 'react';
import { Atividades } from './Atividades.jsx';
import { PAPEIS, PREFS_PADRAO, papelNome, reduzirImagem, supabase, tempoRelativo } from './lib.js';
import { Avatar } from './Avatar.jsx';

export function Configuracoes({ dados, eu, usuario, pode, salvarPrefs, avisar }) {
  const prefs = { ...PREFS_PADRAO, ...lerPrefs(), ...(eu?.preferencias || {}) };
  const semPerfis = dados.faltando.has('perfis');
  const set = (k, v) => salvarPrefs({ ...prefs, [k]: v });
  const [filtroLog, setFiltroLog] = useState(null);
  const verAtividades = (id) => {
    setFiltroLog(id);
    setTimeout(() => document.getElementById('registro-atividades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Configurações</h1>
          <p className="date">Sua conta, aparência do app{pode.verOperacao ? ' e usuários' : ''}</p>
        </div>
      </header>

      {semPerfis && (
        <section className="card note" role="alert">
          Para liberar fotos, acessos e “quem está online”, rode no Supabase o arquivo <b>04_acessos_e_perfis.sql</b>.
        </section>
      )}

      <div className="settings-grid">
        <section className="card stack" aria-label="Minha conta">
          <h2 className="card-title">Minha conta</h2>
          {eu ? <MinhaConta eu={eu} dados={dados} /> : <p className="note">{usuario.email}</p>}
          <button type="button" className="pill ghost" style={{ alignSelf: 'flex-start' }} onClick={() => supabase.auth.signOut()}>Sair da conta</button>
        </section>

        <section className="card stack" aria-label="Aparência e uso">
          <h2 className="card-title">Aparência e uso</h2>
          <Opcao rotulo="Tema" valor={prefs.tema} onMudar={(v) => set('tema', v)}
            opcoes={[['claro', 'Claro'], ['escuro', 'Escuro']]} />
          <Opcao rotulo="Tamanho do texto" valor={prefs.texto} onMudar={(v) => set('texto', v)}
            opcoes={[['p', 'Pequeno'], ['m', 'Normal'], ['g', 'Grande'], ['gg', 'Maior']]} />
          <Opcao rotulo="Espaçamento" valor={prefs.densidade} onMudar={(v) => set('densidade', v)}
            opcoes={[['confortavel', 'Confortável'], ['compacta', 'Compacto']]} />
          <label className="field"><span>Idioma</span>
            <select value={prefs.idioma} onChange={(e) => set('idioma', e.target.value)}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en" disabled>English (em breve)</option>
              <option value="es" disabled>Español (em breve)</option>
            </select>
          </label>
          <p className="preview-text">As preferências ficam salvas na sua conta e valem em qualquer aparelho.</p>
        </section>
      </div>

      {pode.verOperacao && !semPerfis && <Usuarios dados={dados} eu={eu} pode={pode} avisar={avisar} verAtividades={verAtividades} />}
      {pode.admin && !semPerfis && <Atividades dados={dados} filtroUsuario={filtroLog} setFiltroUsuario={setFiltroLog} />}
    </>
  );
}

function Opcao({ rotulo, valor, opcoes, onMudar }) {
  return (
    <div className="opt" role="group" aria-label={rotulo}>
      <span>{rotulo}</span>
      <div className={'seg' + (opcoes.length === 3 ? ' three' : opcoes.length === 2 ? ' two' : '')}>
        {opcoes.map(([id, nome]) => (
          <button key={id} type="button" className={valor === id ? 'on' : ''} aria-pressed={valor === id} onClick={() => onMudar(id)}>{nome}</button>
        ))}
      </div>
    </div>
  );
}

function MinhaConta({ eu, dados }) {
  const [nome, setNome] = useState(eu.nome || '');
  const mudou = nome.trim() && nome.trim() !== eu.nome;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <BotaoFoto perfil={eu} dados={dados} grande online />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{eu.nome}</span>
          <span className="note">{eu.email}</span>
          <span className="badge blue">{papelNome[eu.papel]}</span>
        </div>
      </div>
      <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (mudou) dados.atualizarPerfil(eu.id, { nome: nome.trim() }); }}>
        <label className="field"><span>Nome que aparece no app</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gabriel Bueno Severino" />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 44 }} disabled={!mudou}>Salvar</button>
      </form>
    </>
  );
}

function BotaoFoto({ perfil, dados, grande, online, podeTrocar = true }) {
  const input = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const escolher = async (e) => {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    setEnviando(true);
    try { await dados.enviarFoto(perfil.id, await reduzirImagem(arq)); } finally { setEnviando(false); }
  };
  if (!podeTrocar) return <Avatar perfil={perfil} online={online} grande={grande} />;
  return (
    <>
      <button type="button" className="photo-btn" aria-label={`Trocar foto de ${perfil.nome || perfil.email}`} onClick={() => input.current?.click()} disabled={enviando}>
        <Avatar perfil={perfil} online={online} grande={grande} />
        <span className="cam">{enviando ? '…' : 'Foto'}</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={escolher} />
    </>
  );
}

function Usuarios({ dados, eu, pode, avisar, verAtividades }) {
  const lista = [...dados.perfis].sort((a, b) =>
    (dados.online.has(b.id) - dados.online.has(a.id)) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const qtdOnline = lista.filter((p) => dados.online.has(p.id)).length;
  return (
    <section className="card stack" aria-label="Usuários">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="card-title">Usuários</h2>
        <span className="badge green">{qtdOnline} online agora</span>
      </div>
      <div className="users">
        {lista.map((p) => (
          <LinhaUsuario key={p.id} p={p} dados={dados} online={dados.online.has(p.id)} admin={pode.admin} eu={eu} avisar={avisar} verAtividades={verAtividades} />
        ))}
      </div>
      {pode.admin && (
        <div className="note" style={{ background: 'var(--soft)', borderRadius: 16, padding: 14 }}>
          <b>Para adicionar alguém:</b> no Supabase, vá em Authentication → Users → Add user → Create new user (e-mail, senha e
          “Auto Confirm User”). A pessoa aparece aqui como <b>Campo</b>; depois é só trocar o tipo de acesso nesta lista.
          <br />
          {PAPEIS.map((r) => <span key={r.id} style={{ display: 'block', marginTop: 4 }}><b>{r.nome}:</b> {r.desc}</span>)}
        </div>
      )}
    </section>
  );
}

function LinhaUsuario({ p, dados, online, admin, eu, avisar, verAtividades }) {
  const [nome, setNome] = useState(p.nome || '');
  const [grupo, setGrupo] = useState(p.cliente_grupo || '');
  const souEu = p.id === eu?.id;
  const salvarNome = () => { if (nome.trim() && nome.trim() !== p.nome) dados.atualizarPerfil(p.id, { nome: nome.trim() }); };
  const mudarPapel = async (papel) => {
    if (souEu && papel !== 'admin' && !window.confirm('Você vai perder o acesso de administrador. Continuar?')) return;
    const ok = await dados.atualizarPerfil(p.id, { papel, cliente_grupo: papel === 'cliente' ? grupo || null : null });
    if (ok) avisar(`${p.nome || p.email} agora é ${papelNome[papel]}.`);
  };
  const grupos = [...new Set(dados.demandas.map((d) => d.grupo).filter(Boolean))].sort();

  return (
    <div className="user-row">
      <BotaoFoto perfil={p} dados={dados} online={online} podeTrocar={admin || souEu} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {admin ? (
          <input className="input" aria-label={`Nome de ${p.email}`} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        ) : (
          <span className="nm">{p.nome}{souEu ? ' (você)' : ''}</span>
        )}
        <span className="sub">{p.email}{admin && souEu ? ' · você' : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {admin ? (
          <select className="input" aria-label={`Tipo de acesso de ${p.nome || p.email}`} value={p.papel} onChange={(e) => mudarPapel(e.target.value)}>
            {PAPEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        ) : (
          <span className="badge blue">{papelNome[p.papel]}</span>
        )}
        {admin && p.papel === 'cliente' && (
          <>
            <input className="input" list="grupos-clientes" placeholder="Grupo que ele vê (ex.: Help)" aria-label="Grupo do cliente"
              value={grupo} onChange={(e) => setGrupo(e.target.value)}
              onBlur={() => grupo !== (p.cliente_grupo || '') && dados.atualizarPerfil(p.id, { cliente_grupo: grupo || null })} />
            <datalist id="grupos-clientes">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
          </>
        )}
        {admin && p.papel === 'campo' && (
          // login individual de campo: liga ao funcionário (login compartilhado: deixe "pergunta no celular")
          <select className="input" aria-label={`Funcionário de ${p.nome || p.email}`} value={p.funcionario_id || ''}
            onChange={(e) => dados.atualizarPerfil(p.id, { funcionario_id: e.target.value || null })}>
            <option value="">Funcionário: perguntar</option>
            {dados.funcionarios.filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.id}>Funcionário: {f.nome}</option>)}
          </select>
        )}
      </div>
      <div className="times">
        <span style={{ color: online ? 'var(--green-dot)' : undefined, fontWeight: online ? 700 : 500 }}>
          {online ? 'Online agora' : 'Último acesso ' + tempoRelativo(p.ultimo_acesso)}
        </span>
        <span>Última modificação {tempoRelativo(p.ultima_modificacao)}</span>
        {admin && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--brand-text)' }} onClick={() => verAtividades(p.id)}>Ver atividades</button>}
      </div>
    </div>
  );
}

function lerPrefs() {
  try { return JSON.parse(localStorage.getItem('eql-prefs') || '{}') || {}; } catch { return {}; }
}
