import { useEffect, useState } from 'react';
import { faseNome, fmt, papelNome, supabase } from './lib.js';
import { Avatar } from './Avatar.jsx';

// Registro de atividades (só administradores): quem fez o quê e quando.
const TIPOS = [
  { id: 'todas', nome: 'Tudo', tabelas: null },
  { id: 'demandas', nome: 'Demandas', tabelas: ['demandas'] },
  { id: 'agenda', nome: 'Agenda, folgas e férias', tabelas: ['alocacoes', 'veiculo_alocacoes', 'ausencias'] },
  { id: 'equipes', nome: 'Funcionários e custos', tabelas: ['funcionarios', 'custos_funcionarios'] },
  { id: 'frotas', nome: 'Veículos', tabelas: ['veiculos'] },
  { id: 'custos', nome: 'Valores e custos das obras', tabelas: ['financeiro_demandas', 'custos_lancamentos'] },
  { id: 'usuarios', nome: 'Usuários', tabelas: ['perfis'] },
];

const CAMPOS = {
  nome: 'Nome', percentual: 'Andamento', fase: 'Fase', entrega: 'Entrega', inicio: 'Início', pagamento: 'Pagamento',
  descricao: 'Descrição', grupo: 'Cliente/grupo', empresa: 'Empresa', qtd_total: 'Quantidade', qtd_produzida: 'Em estoque',
  unidade: 'Unidade', arquivada: 'Arquivada', dia: 'Dia', demanda_id: 'Demanda', tipo: 'Tipo', ativo: 'Ativo',
  papel: 'Acesso', foto_url: 'Foto', cliente_grupo: 'Grupo do cliente', funcao: 'Função', placa: 'Placa',
  proxima_manutencao: 'Próxima manutenção', observacoes: 'Observações', email: 'E-mail',
  produto: 'Produto', especificacao: 'Especificação', custo_diario: 'Custo por dia', vigente_desde: 'Vale a partir de',
  valor_vendido: 'Valor vendido', imposto_pct: 'Imposto', valor: 'Valor',
};
const OCULTAR = new Set(['ordem']);
const EMPRESAS = { engenharia: 'Engenharia', impermeabilizacao: 'Impermeabilização', eko: 'Eko' };
const PAGTO = { a_faturar: 'A faturar', faturada: 'Faturada', paga: 'Paga' };

function verbo(a) {
  const t = a.tabela, x = a.acao;
  if (t === 'alocacoes') return { criou: 'colocou na agenda', apagou: 'tirou da agenda', alterou: 'mudou na agenda' }[x];
  if (t === 'veiculo_alocacoes') return { criou: 'colocou o veículo na agenda', apagou: 'tirou o veículo da agenda', alterou: 'mudou o veículo na agenda' }[x];
  if (t === 'ausencias') return { criou: 'marcou', apagou: 'desmarcou', alterou: 'alterou' }[x];
  if (t === 'financeiro_demandas') return { criou: 'definiu o valor da obra', apagou: 'apagou o valor da obra', alterou: 'alterou o valor da obra' }[x];
  if (t === 'custos_lancamentos') return { criou: 'lançou custo em', apagou: 'apagou o custo de', alterou: 'alterou o custo de' }[x];
  if (t === 'custos_funcionarios') return { criou: 'definiu o custo de', apagou: 'apagou o custo de', alterou: 'alterou o custo de' }[x];
  const nome = { demandas: 'a demanda', funcionarios: 'o funcionário', veiculos: 'o veículo', perfis: 'o usuário' }[t] || t;
  return `${x} ${nome}`;
}

function valor(campo, v, nomes) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'fase') return faseNome[v] || v;
  if (campo === 'papel') return papelNome[v] || v;
  if (campo === 'empresa') return EMPRESAS[v] || v;
  if (campo === 'pagamento') return PAGTO[v] || v;
  if (campo === 'tipo') return { ferias: 'Férias', folga: 'Folga', material: 'Material', combustivel: 'Combustível', despesa: 'Despesa extra' }[v] || v;
  if (campo === 'percentual') return v + '%';
  if (campo === 'imposto_pct') return v + '%';
  if (campo === 'valor_vendido' || campo === 'valor') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (campo === 'custo_diario') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (campo === 'demanda_id') return nomes.demandas[v] || 'demanda apagada';
  if (campo === 'foto_url') return 'nova foto';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt(v);
  return String(v);
}

export function Atividades({ dados, filtroUsuario, setFiltroUsuario }) {
  const [tipo, setTipo] = useState('todas');
  const [limite, setLimite] = useState(100);
  const [lista, setLista] = useState([]);
  const [estado, setEstado] = useState('carregando'); // carregando | ok | falta | erro
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    let q = supabase.from('atividades').select('*').order('quando', { ascending: false }).limit(limite);
    if (filtroUsuario) q = q.eq('usuario_id', filtroUsuario);
    const tabelas = TIPOS.find((t) => t.id === tipo)?.tabelas;
    if (tabelas) q = q.in('tabela', tabelas);
    q.then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setEstado(/does not exist|schema cache|Could not find/i.test(error.message) ? 'falta' : 'erro'); return; }
      setLista(data || []); setEstado('ok');
    });
    return () => { vivo = false; };
  }, [filtroUsuario, tipo, limite, versao]);

  // novas atividades aparecem sozinhas
  useEffect(() => {
    const ch = supabase.channel('eql-atividades')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atividades' }, () => setVersao((v) => v + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const perfil = Object.fromEntries(dados.perfis.map((p) => [p.id, p]));
  const nomes = { demandas: Object.fromEntries(dados.demandas.map((d) => [d.id, d.nome])) };

  // agrupa por dia
  const dias = [];
  lista.forEach((a) => {
    const d = new Date(a.quando);
    const chave = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const ult = dias[dias.length - 1];
    if (ult && ult.chave === chave) ult.itens.push(a); else dias.push({ chave, itens: [a] });
  });

  return (
    <section id="registro-atividades" className="card stack" aria-label="Registro de atividades">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="card-title">Registro de atividades</h2>
          <p className="note">Tudo que foi criado, alterado ou apagado no app, por quem e quando. Só administradores veem.</p>
        </div>
        <div className="row">
          <select className="input" aria-label="Filtrar por usuário" value={filtroUsuario || ''} onChange={(e) => { setFiltroUsuario(e.target.value || null); setLimite(100); }}>
            <option value="">Todos os usuários</option>
            {dados.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome || p.email}</option>)}
          </select>
          <select className="input" aria-label="Filtrar por tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setLimite(100); }}>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      </div>

      {estado === 'falta' && <p className="note">Para ativar o registro, rode no Supabase o arquivo <b>05_registro_de_atividades.sql</b>.</p>}
      {estado === 'erro' && <p className="note">Não foi possível carregar o registro agora.</p>}
      {estado === 'ok' && !lista.length && <p className="empty">Nenhuma atividade registrada {filtroUsuario ? 'para este usuário ' : ''}ainda.</p>}

      {dias.map((g) => (
        <div key={g.chave} className="log-day">
          <span className="group-name" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>{g.chave}</span>
          {g.itens.map((a) => {
            const p = perfil[a.usuario_id];
            const mud = Object.entries(a.mudancas || {}).filter(([k]) => !OCULTAR.has(k));
            return (
              <div key={a.id} className="log-item">
                <Avatar perfil={p} nome="?" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="log-text">
                    <b>{p?.nome || p?.email || 'Usuário removido'}</b> {verbo(a)} <b>{a.rotulo || ''}</b>
                  </div>
                  {mud.length > 0 && (
                    <ul className="log-changes">
                      {mud.map(([k, [antes, depois]]) => (
                        <li key={k}><span>{CAMPOS[k] || k}:</span> {valor(k, antes, nomes)} → <b>{valor(k, depois, nomes)}</b></li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="log-time">{new Date(a.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            );
          })}
        </div>
      ))}

      {estado === 'ok' && lista.length >= limite && (
        <button type="button" className="pill ghost" style={{ alignSelf: 'center' }} onClick={() => setLimite((l) => l + 100)}>Carregar mais</button>
      )}
    </section>
  );
}
