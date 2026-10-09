import { useState } from 'react';

// Grupos internos: não são clientes (obra sem cliente cai neles)
const INTERNOS = ['obras civis', 'obras', 'produção', 'producao', 'estoque', 'outros'];
export const grupoInterno = (g) => !g || INTERNOS.includes(String(g).trim().toLowerCase());
const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Lista de clientes ativos. Antes do arquivo 16 rodar no banco, usa os nomes que já aparecem nas obras.
export function listaClientes(dados) {
  if (!dados.faltando?.has('clientes') && (dados.clientes || []).length) {
    return dados.clientes.filter((c) => c.ativo !== false).map((c) => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  return [...new Set((dados.demandas || []).map((d) => d.grupo).filter((g) => g && !grupoInterno(g)).map((g) => g.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Escolher o cliente: botões com os clientes cadastrados + "Outro" para escrever.
// Nome novo → pergunta se quer criar o cliente (ou usar só desta vez; repetido em 2 obras, o banco cria sozinho).
export function ClienteCampo({ rotulo = 'Cliente', valor, onChange, clientes, criarCliente, disabled, vazio, autoFocus, className = '' }) {
  const naLista = clientes.find((c) => igual(c, valor));
  const [outro, setOutro] = useState(() => !!valor && !naLista && !grupoInterno(valor));
  const [soDestaVez, setSoDestaVez] = useState(() => new Set());
  const [criando, setCriando] = useState(false);
  const texto = (valor || '').trim();
  const novo = outro && texto && !naLista;
  const perguntar = novo && criarCliente && !soDestaVez.has(texto.toLowerCase());
  const vazioOn = !outro && (!valor || grupoInterno(valor));

  const escolher = (nome) => { setOutro(false); onChange(nome); };
  const criar = async () => {
    setCriando(true);
    const nome = await criarCliente(texto);
    setCriando(false);
    if (nome) escolher(nome);
  };
  // escreveu igual a um cliente que já existe ("help") → usa o nome oficial ("Help")
  const conferir = () => { if (outro && naLista) escolher(naLista); };

  return (
    <div className={'field cli-campo ' + className}>
      <span>{rotulo}</span>
      <div className="cli-chips" role="radiogroup" aria-label={rotulo}>
        {vazio && (
          <button type="button" role="radio" aria-checked={vazioOn} className={'cli-chip vazio' + (vazioOn ? ' on' : '')} disabled={disabled} onClick={() => escolher('')}>{vazio}</button>
        )}
        {clientes.map((c) => {
          const on = !outro && igual(c, valor);
          return <button key={c} type="button" role="radio" aria-checked={on} className={'cli-chip' + (on ? ' on' : '')} disabled={disabled} onClick={() => escolher(c)}>{c}</button>;
        })}
        <button type="button" role="radio" aria-checked={outro} className={'cli-chip outro' + (outro ? ' on' : '')} disabled={disabled}
          onClick={() => { setOutro(true); if (naLista || grupoInterno(valor)) onChange(''); }}>Outro…</button>
      </div>
      {outro && (
        <input className="input" autoFocus={autoFocus !== false} disabled={disabled} value={valor || ''} placeholder="Nome do cliente"
          onChange={(e) => onChange(e.target.value)} onBlur={conferir} aria-label="Nome do novo cliente" />
      )}
      {outro && naLista && texto && <small className="cli-dica">Já existe: vai usar “{naLista}”.</small>}
      {perguntar && (
        <div className="cli-novo" role="status">
          <span>“{texto}” ainda não está na lista de clientes. Criar o cliente?</span>
          <div className="cli-novo-acoes">
            <button type="button" className="pill lime" disabled={criando || disabled} onClick={criar}>{criando ? 'Criando…' : `Criar cliente “${texto}”`}</button>
            <button type="button" className="pill ghost" disabled={disabled} onClick={() => setSoDestaVez((s) => new Set(s).add(texto.toLowerCase()))}>Só desta vez</button>
          </div>
          <small>Se o mesmo nome for usado em 2 obras, ele entra na lista sozinho.</small>
        </div>
      )}
    </div>
  );
}
