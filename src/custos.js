import { useEffect, useState } from 'react';
import { hoje, supabase } from './lib.js';

export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const brlCentavos = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Custo por dia que vale hoje (ou o primeiro cadastrado, se todos forem futuros)
export function custoAtual(funcionarioId, custos, dia = hoje()) {
  const lista = custos.filter((c) => c.funcionario_id === funcionarioId).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  if (!lista.length) return null;
  const valendo = lista.filter((c) => c.vigente_desde <= dia);
  return valendo.length ? valendo[valendo.length - 1] : lista[0];
}

// Custo de mão de obra por demanda, calculado no banco (só administradores recebem valores).
// Retorna { [demanda_id]: { total, dias, semCusto, porFunc: [{ funcionario_id, dias, custo, semCusto }] } }
export function useCustos(dados, ativo) {
  const [custos, setCustos] = useState(null);
  const [disponivel, setDisponivel] = useState(true);

  useEffect(() => {
    if (!ativo) { setCustos(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('custo_demandas');
      if (!vivo) return;
      if (error) { setDisponivel(false); setCustos(null); return; }
      setDisponivel(true);
      const m = {};
      (data || []).forEach((r) => {
        const d = (m[r.demanda_id] ||= { total: 0, dias: 0, semCusto: 0, porFunc: [] });
        d.total += Number(r.custo) || 0;
        d.dias += r.dias;
        d.semCusto += r.dias_sem_custo;
        d.porFunc.push({ funcionario_id: r.funcionario_id, dias: r.dias, custo: Number(r.custo) || 0, semCusto: r.dias_sem_custo });
      });
      Object.values(m).forEach((d) => d.porFunc.sort((a, b) => b.custo - a.custo || b.dias - a.dias));
      setCustos(m);
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [ativo, dados.alocacoes, dados.custos_funcionarios]);

  return { porDemanda: custos, disponivel };
}
