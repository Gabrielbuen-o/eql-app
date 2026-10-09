// Gravação dos orçamentos no Supabase (o servidor recalcula o total e valida a emissão)
import { supabase } from '../lib.js';

const msg = (error) => {
  const m = error?.message || String(error || '');
  if (/row-level security|permission denied/i.test(m)) return 'Seu acesso não permite mexer em orçamentos.';
  if (/does not exist|schema cache/i.test(m)) return 'Os orçamentos ainda não estão liberados no banco (rode o arquivo 14_orcamentos.sql no Supabase).';
  if (/fetch|network/i.test(m)) return 'Sem internet no momento.';
  return m;
};

export async function salvarOrcamento(linha, existe) {
  const { id, ...campos } = linha;
  const { error } = existe
    ? await supabase.from('orcamentos').update(campos).eq('id', id)
    : await supabase.from('orcamentos').insert({ id, ...campos });
  return error ? { ok: false, erro: msg(error) } : { ok: true };
}
export async function emitirRevisao(v) {
  const { error } = await supabase.from('orcamento_versoes').insert(v);
  return error ? { ok: false, erro: msg(error).replace(/^.*?Não dá para emitir/, 'Não dá para emitir') } : { ok: true };
}
export async function novaVersaoParametros(categoria, versao, parametros, observacao) {
  const { error } = await supabase.from('orcamento_parametros').insert({ categoria, versao, parametros, observacao });
  return error ? { ok: false, erro: msg(error) } : { ok: true };
}
export async function carregarHistorico(orcamentoId) {
  const [h, v] = await Promise.all([
    supabase.from('orcamento_historico').select('*').eq('orcamento_id', orcamentoId).order('quando', { ascending: false }),
    supabase.from('orcamento_versoes').select('*').eq('orcamento_id', orcamentoId).order('revisao', { ascending: false }),
  ]);
  return { historico: h.data || [], versoes: v.data || [], erro: h.error || v.error ? msg(h.error || v.error) : null };
}
