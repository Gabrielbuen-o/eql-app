# EQL Group — App de gestão

Sistema central da EQL Group (EQL Engenharia, EQL Impermeabilização, EQL Eko).
Primeiro módulo: **Demandas** (painel das obras/produção + agenda das equipes) e **Equipes** (funcionários).

## Como as peças se encaixam

| Peça | Onde | O que guarda |
|---|---|---|
| Código | GitHub (`Gabrielbuen-o/eql-app`) | telas e lógica |
| Hospedagem | Netlify | o app no ar, no seu domínio |
| Banco de dados e logins | Supabase | demandas, funcionários, agenda, usuários |

Atualizar o código **nunca apaga dados**: os dados ficam só no Supabase.

## Colocar no ar (uma vez só)

### 1. Supabase — criar o banco
1. Em supabase.com → **New project**. Nome: `eql`. Anote a senha do banco. Região: **South America (São Paulo)**.
2. Quando o projeto terminar de criar: menu **SQL Editor** → **New query**.
3. Cole todo o conteúdo de `supabase/01_estrutura.sql` → **Run**.
4. Nova query, cole `supabase/02_dados_iniciais.sql` → **Run**. (Rode este só uma vez, senão as demandas duplicam.)

### 2. Supabase — criar os logins
1. Menu **Authentication → Users → Add user → Create new user**.
2. Coloque e-mail e senha de cada pessoa (você, Lucas, Rodolfo, financeiro) e marque **Auto Confirm User**.
3. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up** (assim só entra quem você cadastrar).

### 3. Pegar as chaves
**Project Settings → API** (ou **Data API / API Keys**). Copie:
- **Project URL** (ex.: `https://abcd1234.supabase.co`)
- **anon public** key (uma chave longa que começa com `eyJ…`, ou a *publishable key* `sb_publishable_…`)

### 4. Netlify — publicar
1. **Add new project → Import an existing project → GitHub** → escolha `eql-app`.
2. Ele já lê o `netlify.toml` (build `npm run build`, pasta `dist`). Antes de publicar, em **Environment variables** adicione:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = a anon/publishable key
3. **Deploy**. Em ~1 minuto o app está no ar. Para usar seu domínio: **Domain management → Add a domain**.

Se o app abrir com a mensagem “Falta ligar o banco de dados”, as variáveis do passo 4 não foram salvas: confira e clique em **Deploys → Trigger deploy**.

## Como atualizar depois
- **Dados** (obras, prazos, %, funcionários, agenda): pelo próprio app.
- **Funcionalidades**: pedir ao Claude → ele envia o código para o GitHub → a Netlify publica sozinha.
- Quando uma mudança precisar de campo novo no banco, vem um arquivo numerado em `supabase/` para rodar uma vez no SQL Editor. Ele só acrescenta, não apaga nada.
  - `03_folgas_e_frotas.sql`: folgas/férias, veículos e agenda dos veículos
  - `04_acessos_e_perfis.sql`: acessos (administrador, gerente, campo, cliente), fotos, último acesso e preferências
  - `05_registro_de_atividades.sql`: registro de tudo que cada usuário cria, altera ou apaga (só administradores veem)
  - `06_fabrica_eko.sql`: demandas da fábrica com produto, especificação, cliente e fases Orçamento → Execução → Estoque
  - `07_custos_mao_de_obra.sql`: custo por dia de cada funcionário (com histórico) e custo de mão de obra por obra, calculado pela agenda (só administradores)

## Acessos
| Tipo | Pode |
|---|---|
| Administrador | tudo, inclusive mudar o acesso dos outros (aba Configurações) |
| Gerente | demandas, agenda, equipes e frotas |
| Campo | vê a operação e atualiza andamento/fase/produção das demandas |
| Cliente | vê só as demandas do grupo dele (ex.: Help) |

Novo login: Supabase → Authentication → Users → Add user. Ele entra como **Campo**; o administrador muda o tipo em Configurações.

## Estrutura
```
src/            telas (React)
  App.jsx         login, menu e abas
  Demandas.jsx    painel de demandas
  DemandaModal.jsx  editar/criar demanda
  Agenda.jsx      calendário de arrastar funcionários
  Equipe.jsx      cadastro de funcionários
  useData.js      leitura/gravação no Supabase + tempo real
  lib.js          datas, empresas, fases, regras
public/         index.html e styles.css
supabase/       scripts SQL do banco
```
