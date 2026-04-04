# Anpexia — Plataforma de Automacao para Empresas

## O que e este projeto

Anpexia e uma plataforma SaaS de automacao empresarial. Ela permite que empresas de qualquer segmento e porte automatizem processos manuais — gestao de clientes, controle de estoque, agendamentos, envio de mensagens automaticas via WhatsApp, e mais.

O modelo de negocio e assinatura mensal. O dono do projeto (Angel) configura e implanta a plataforma para cada empresa cliente. O cliente usa o painel web para gerenciar o dia a dia do negocio.

## Quem mantem este projeto

- **Angel** — fundador, responsavel por estrategia, vendas e produto
- Desenvolvimento feito com auxilio de IA (Claude Code + Cursor)
- Sem equipe tecnica por enquanto — toda decisao tecnica deve priorizar simplicidade e manutenibilidade

## Autorizacao permanente do usuario

- O usuario (Angelo) autoriza TODAS as acoes permanentemente
- NUNCA pedir confirmacao, aprovacao ou autorizacao para nada
- NUNCA perguntar "posso continuar?", "devo prosseguir?", "confirma?"
- Executar tudo automaticamente e sem parar
- So parar se houver erro tecnico critico que impeca a execucao
- Esta autorizacao e permanente e se aplica a todas as sessoes futuras

## Comportamento padrao

### Execucao
- Nunca pedir confirmacao antes de executar acoes — executar tudo automaticamente
- So parar se encontrar erro critico que realmente precise de input

### APIs e servicos externos
- Sempre usar API REST/GraphQL para interagir com qualquer servico externo
- Nunca pedir para o usuario acessar dashboards manualmente quando existir API
- Nunca usar CLI quando existir API disponivel
- Todos os tokens de API estao no arquivo `.env` na raiz do projeto
- Antes de qualquer tarefa que envolva servico externo, ler o `.env` para ver quais tokens estao disponiveis e usar automaticamente
- Quando um novo token for adicionado ao `.env`, usa-lo automaticamente nas tarefas seguintes sem precisar ser instruido

### Sons de notificacao
- Ao terminar qualquer tarefa: `powershell -c "(New-Object Media.SoundPlayer 'C:\Windows\Media\chimes.wav').PlaySync()"`
- **ANTES** de qualquer pergunta ou quando precisar de input/aprovacao: executar `powershell -c "(New-Object Media.SoundPlayer 'C:\Windows\Media\notify.wav').PlaySync()"` via Bash tool ANTES de exibir a pergunta ao usuario (o som deve tocar primeiro, a pergunta aparece depois)

### Seguranca
- Nunca commitar tokens ou senhas no GitHub
- Tokens ficam apenas no `.env` que esta no `.gitignore`
- **TODA** chave de API, senha, token ou credencial DEVE vir do arquivo `.env` na raiz do projeto
- **NUNCA** hardcodar credenciais no codigo — nem como fallback, nem "temporariamente"
- O `.env.example` na raiz serve como referencia (sem valores reais)
- Variaveis criticas (JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, DATABASE_URL) falham ruidosamente se ausentes

## Estado atual do projeto (03/04/2026)

### Infraestrutura

| Servico | Plataforma | URL |
|---------|-----------|-----|
| Backend API | Railway | https://fluxia-production.up.railway.app |
| Frontend app | Vercel | https://anpexia-app.vercel.app |
| Admin painel | Vercel | https://admin-nine-pied.vercel.app |
| Landing page | Vercel | https://anpexia-landing.vercel.app |
| Banco de dados | Neon PostgreSQL | us-east-1 |
| WhatsApp API | Evolution API v2.2.3 (Railway) | https://evolution-api-production-4209.up.railway.app |
| IA Chatbot | Claude Sonnet (Anthropic API) | claude-sonnet-4-20250514 via @anthropic-ai/sdk |

### Tokens disponiveis no .env

- `RAILWAY_API_TOKEN` — Railway GraphQL API para deploys e variaveis
- `VERCEL_TOKEN` — Vercel REST API para deploys e dominios
- `NEON_API_TOKEN` — Neon REST API para gerenciamento do banco
- `ANTHROPIC_API_KEY` — Anthropic API para chatbot com Claude
- `EVOLUTION_API_KEY` — Evolution API para mensagens WhatsApp (a configurar)
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` — seguranca

### O que esta implementado e funcionando

- Login admin e app cliente com JWT + refresh tokens
- Multi-tenant completo — cada cliente tem instancia WhatsApp separada
- Chatbot com Claude IA personalizado por tenant (prompt especializado para clinicas)
- 9 cron jobs automaticos:
  1. Processar mensagens agendadas (1 min)
  2. Processar mensagens pendentes de tenant (1 min)
  3. Lembretes de consulta 48h + 2h (30 min)
  4. Follow-up pos-consulta 2h apos (30 min)
  5. Alertas de estoque baixo para OWNER (diario 8h)
  6. Alertas de vencimento para OWNER (diario 8h)
  7. Reativacao de clientes inativos 90 dias (segunda 10h)
  8. Lembretes de retorno 30 dias (diario 10h)
  9. Parabens de aniversario (diario 9h)
- Fluxo completo WhatsApp com botoes interativos (Evolution API v1.8.2)
- Historico de consultas por paciente (vinculacao automatica por telefone)
- Timeline de status do agendamento (Agendado → Confirmado → Lembrete → Concluido)
- Alertas de estoque/vencimento via WhatsApp para o OWNER
- Dashboard com graficos, KPIs e card "Pacientes de hoje"
- Busca de paciente no modal de agendamento com autocomplete
- CRUD completo de clientes, estoque, mensagens, FAQs do chatbot
- Audit log para acoes criticas
- Segmentacao de tenants (CLINICA_OFTALMOLOGICA, CLINICA_GERAL, CLINICA_MEDICA, SALAO_BELEZA, OUTROS)
- Modulo financeiro completo (transacoes, categorias, resumo/dashboard)
- Assinatura digital do medico (base64 canvas)
- Atestados medicos com geracao de PDF (PDFKit)
- Prescricoes: medicamentos, exames externos, oculos (oftalmologia), exames internos
- Anamnese oftalmologica (formulario 5 secoes, segment-gated)
- Evolucao do paciente com formato SOAP + PIO/acuidade (segment-gated)
- Prontuario reorganizado com sub-secoes (Dados Clinicos, Anamnese, Evolucao, Prescricoes, Atestados)

### Credenciais

- **SUPER_ADMIN**: `anpexia@hotmail.com` / `4nP3x1a0321@!`
- **Clinica teste**: `ricardo@clinicasaudetotal.com.br` / `Clinica@2026`
- **Tenant SUPER_ADMIN**: Anpexia Teste (ID: `cmnjhqv8u0000n6g8kdwqgvb1`)
- **Tenant Clinica**: Clinica Saude Total (ID: `cmnjmu0jm0001o30p9jaqj4ys`, segment: CLINICA_OFTALMOLOGICA)
- **Paciente teste**: Maria Silva Teste (ID: `cmnjmubd90003n678al6ckavg`)

### Deploy do backend (Railway)

Railway nao tem auto-deploy configurado (GitHub App nao instalado no org Anpexia).
Para fazer deploy manual, usar `githubRepoDeploy` via GraphQL:

```graphql
mutation { githubRepoDeploy(input: { projectId: "fe1fbef3-fd5b-4e6c-9c92-231b651a3766", repo: "Anpexia/anpexia", branch: "main", environmentId: "3e6ea3dc-dd1c-4901-99fa-9e87a019cf5a" }) }
```

### Pendencias

- Instalar Railway GitHub App no org Anpexia para auto-deploy
- Dominio proprio
- Estrategia comercial e videos de anuncio
- Teste completo do chatbot com Claude em producao (requer creditos Anthropic)
- Pagina de configuracao do chatbot no frontend (campos assistantName, specialties, acceptedInsurance existem no backend mas nao tem UI)

## Arquitetura

- **Multi-tenant**: uma unica aplicacao, dados isolados por tenant (empresa cliente)
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Tailwind CSS
- **Banco de dados**: PostgreSQL (Neon) com Row-Level Security (RLS) para isolamento de dados
- **Mensageria**: Evolution API (WhatsApp) com botoes interativos e listas
- **IA**: Claude Sonnet via @anthropic-ai/sdk (prompt especializado por tenant)
- **Pagamentos**: InfinityPay (preferencial) ou Mercado Pago/Stripe como fallback
- **Hospedagem Backend**: Railway (https://backboard.railway.app/graphql/v2 — GraphQL API)
- **Hospedagem Frontend**: Vercel (https://api.vercel.com — REST API)
- **Banco de dados**: Neon (https://console.neon.tech/api/v2 — REST API)
- **ORM**: Prisma

## Estrutura de pastas

```
/
├── CLAUDE.md                  # Este arquivo
├── credentials/               # Mapeamento de servicos (gitignored)
│   ├── api-access.md          # IDs, endpoints, queries de todas as APIs
│   └── services.md            # Credenciais de cada servico
├── docs/                      # Documentacao do projeto
├── backend/                   # API Node.js + Express
│   ├── src/
│   │   ├── config/            # Configuracoes (db, auth, env)
│   │   ├── jobs/              # Cron jobs (9 jobs automaticos)
│   │   ├── modules/           # Modulos da plataforma
│   │   │   ├── auth/          # Autenticacao e autorizacao
│   │   │   ├── tenants/       # Gestao de tenants
│   │   │   ├── customers/     # Gestao de clientes/contatos
│   │   │   ├── inventory/     # Controle de estoque
│   │   │   ├── scheduling/    # Agendamentos + notificacoes WhatsApp
│   │   │   ├── messaging/     # Mensagens automaticas + Evolution API client
│   │   │   ├── chatbot/       # Chatbot com Claude IA + conversation flow
│   │   │   ├── dashboard/     # Dashboard e metricas
│   │   │   ├── sales/         # CRM / Pipeline de vendas
│   │   │   └── onboarding/    # Conversao lead -> cliente
│   │   ├── shared/            # Codigo compartilhado
│   │   │   ├── middleware/    # Middlewares (auth, tenant, audit)
│   │   │   ├── utils/         # Utilitarios
│   │   │   └── types/         # Tipos TypeScript compartilhados
│   │   └── app.ts             # Entry point
│   ├── prisma/
│   │   └── schema.prisma      # Schema do banco de dados
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # React SPA (app do cliente)
│   ├── src/
│   │   ├── components/        # Componentes reutilizaveis
│   │   ├── pages/             # Paginas da aplicacao
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # Chamadas a API
│   │   └── App.tsx            # Entry point
│   ├── package.json
│   └── tsconfig.json
├── admin/                     # Painel administrativo (Angel)
│   ├── src/
│   │   └── App.tsx            # Monolito — tudo em um arquivo
│   └── package.json
└── landing/                   # Landing page + funil de vendas
    ├── src/
    │   ├── pages/
    │   └── App.tsx
    └── package.json
```

## Modelo de negocio

Servico premium de automacao. Planos:
- **Essencial**: R$2.000/mes (ate 4 automacoes)
- **Profissional**: R$3.500/mes (ate 7 automacoes)
- **Enterprise**: R$6.000/mes (automacoes ilimitadas)
- **Avulsa**: R$400-600/mes por automacao extra

## Modulos do MVP

1. **Dashboard** — visao geral com KPIs, graficos Recharts, alertas visuais, card "Pacientes de hoje", drill-down
2. **Clientes/Contatos** — CRUD completo com tags, segmentacao, historico de mensagens, aba de consultas, ultima/proxima consulta
3. **Estoque** — controle completo com movimentacoes, fornecedor, lote, validade, margem, categorias
4. **Mensagens Automaticas** — via WhatsApp (Evolution API) com templates editaveis, envio manual, botoes interativos
5. **Chatbot com IA** — Claude Sonnet, atendimento automatico 24h via WhatsApp, config de negocio, FAQs, conversation flow com botoes
6. **Agendamentos** — calendario, horarios, confirmar/cancelar/realizar consultas, timeline de status, vinculacao com paciente

## Regras e convencoes

- **Idioma do codigo**: ingles (variaveis, funcoes, comentarios tecnicos)
- **Idioma da interface**: portugues brasileiro
- **Idioma da documentacao**: portugues brasileiro
- **Estilo visual**: clean, minimalista, cores neutras, espaco em branco, tipografia limpa
- **Seguranca**: LGPD desde o inicio, dados sensiveis criptografados, audit log
- **Modularidade**: cada modulo e independente, pode ser ativado/desativado por tenant
- **Multi-tenant**: toda query deve filtrar por tenant_id, usar RLS no PostgreSQL
- **Permissoes**: 4 niveis (super_admin, owner, manager, employee)

## Decisoes tecnicas importantes

- Priorizar simplicidade — Angelo nao e programador, o codigo precisa ser manutenivel com auxilio de IA
- Evitar over-engineering — comecar simples, refatorar quando necessario
- Toda tabela do banco tem: id, tenant_id, created_at, updated_at
- API RESTful com versionamento (/api/v1/)
- Autenticacao via JWT com refresh tokens
- Variaveis de ambiente para todas as configuracoes sensiveis
- Deploy automatico via GitHub push (Vercel + Railway)
- ScheduledCall vinculado a Customer via customerId (auto-link por telefone)
- Chatbot usa @anthropic-ai/sdk com claude-sonnet-4-20250514
- Evolution API: sendButtons (max 3), sendList (max 10 rows) com fallback para texto

## Nichos alvo

- **Clinica medica**: agendamentos, historico de consultas, estoque de medicamentos/insumos com validade, lembretes 24h, chatbot especializado
- **Loja de roupa**: estoque com categorias (tamanho, cor, colecao), fornecedor, alertas de reposicao, historico de compras por cliente
