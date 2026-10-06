import { useCallback, useEffect, useState } from 'react';
import { configurado, supabase, iniciais } from './lib.js';
import { useData } from './useData.js';
import { Demandas } from './Demandas.jsx';
import { Equipe } from './Equipe.jsx';
import { Frotas } from './Frotas.jsx';

const ABAS = [
  { id: 'inicio', nome: 'Início', breve: 'Visão geral do grupo: faturamento, demandas críticas e indicadores das três empresas em uma tela.' },
  { id: 'demandas', nome: 'Demandas' },
  { id: 'equipes', nome: 'Equipes' },
  { id: 'frotas', nome: 'Frotas' },
  { id: 'financeiro', nome: 'Financeiro', breve: 'Contas a pagar e a receber das três empresas, com resultado por obra e por empresa.' },
  { id: 'rh', nome: 'RH & Ponto', breve: 'Cadastro de funcionários, ponto diário e documentos.' },
  { id: 'relatorios', nome: 'Relatórios de obra', breve: 'Formulários por etapa com fotos, no padrão exigido pela Help e pela Agplan.' },
  { id: 'aquisicao', nome: 'Aquisição', breve: 'Canais e funis de aquisição, investimento e retorno por canal.' },
  { id: 'config', nome: 'Configurações', breve: 'Usuários, acessos (CEO, gerente, financeiro, obra) e permissões.' },
];

export function App() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    if (!configurado) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configurado) return <SemConfig />;
  if (sessao === undefined) return <div className="login"><p className="empty">Carregando…</p></div>;
  if (!sessao) return <Login />;
  return <Painel email={sessao.user?.email} />;
}

function Painel({ email }) {
  const [aba, setAba] = useState(() => localStorageGet('eql-aba') || 'demandas');
  const [tv, setTv] = useState(false);
  const [toast, setToast] = useState(null);
  const avisar = useCallback((msg) => {
    setToast(msg);
    clearTimeout(window.__eqlToast);
    window.__eqlToast = setTimeout(() => setToast(null), 4000);
  }, []);
  const dados = useData(avisar);
  const atual = ABAS.find((a) => a.id === aba) || ABAS[1];

  useEffect(() => { localStorageSet('eql-aba', aba); }, [aba]);
  useEffect(() => {
    document.body.classList.toggle('tv', tv);
    const sair = () => !document.fullscreenElement && setTv(false);
    document.addEventListener('fullscreenchange', sair);
    return () => document.removeEventListener('fullscreenchange', sair);
  }, [tv]);

  return (
    <div className="page">
      <div className="shell">
        {!tv && (
          <nav className="sidebar" aria-label="Menu principal">
            <div className="brand">
              <div className="brand-mark">EQL</div>
              <div><div className="brand-name">EQL Group</div><div className="brand-sub">Gestão integrada</div></div>
            </div>
            <div className="nav">
              {ABAS.map((a) => (
                <button key={a.id} type="button" className={aba === a.id ? 'on' : ''} aria-current={aba === a.id ? 'page' : undefined}
                  onClick={() => setAba(a.id)}>
                  <span>{a.nome}</span>
                  {a.breve && <span className="soon">em breve</span>}
                </button>
              ))}
            </div>
            <div className="me">
              <div className="avatar">{iniciais(email)}</div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="me-email">{email}</span>
                <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => supabase.auth.signOut()}>Sair</button>
              </div>
            </div>
          </nav>
        )}
        <main className="main">
          {dados.carregando ? (
            <p className="empty">Carregando dados…</p>
          ) : aba === 'demandas' ? (
            <Demandas dados={dados} tv={tv} setTv={setTv} avisar={avisar} />
          ) : aba === 'equipes' ? (
            <Equipe dados={dados} />
          ) : aba === 'frotas' ? (
            <Frotas dados={dados} />
          ) : (
            <>
              <header className="head"><h1>{atual.nome}</h1></header>
              <section className="card placeholder">
                <span className="tag">Módulo previsto</span>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>{atual.nome}</h2>
                <p style={{ color: '#4B5260', fontSize: 15, lineHeight: 1.6 }}>{atual.breve}</p>
              </section>
            </>
          )}
        </main>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  };
  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">EQL</div>
          <div><div className="brand-name">EQL Group</div><div className="brand-sub">Gestão integrada</div></div>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Entrar</h1>
        {erro && <div className="err" role="alert">{erro}</div>}
        <label className="field"><span>E-mail</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 48 }} disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function SemConfig() {
  return (
    <div className="login">
      <div className="card">
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Falta ligar o banco de dados</h1>
        <p style={{ color: '#4B5260', lineHeight: 1.6 }}>
          Na Netlify, em <b>Site configuration → Environment variables</b>, crie <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> com os valores do
          Supabase (Project Settings → API) e faça um novo deploy.
        </p>
      </div>
    </div>
  );
}

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignora */ } }
