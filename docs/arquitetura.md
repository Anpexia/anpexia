# Arquitetura — Anpexia

## Visão geral

Anpexia é uma aplicação SaaS multi-tenant composta por 4 partes:

1. **Backend (API)** — Node.js + Express + TypeScript
2. **Frontend (Painel do cliente)** — React + TypeScript + Tailwind CSS
3. **Admin (Painel do Angel)** — React separado, acesso restrito
4. **Landing Page** — Site público para captação de clientes

## Diagrama simplificado

```
[Landing Page] → [Formulário/WhatsApp] → Angel faz implantação

[Cliente acessa] → [Frontend React]
                        ↓
                   [API Express]
                        ↓
              [PostgreSQL com RLS]
                        ↓
            [Evolution API (WhatsApp)]

[Angel acessa] → [Admin React] → [API Express]
```

## Multi-tenancy

- **Estratégia**: banco de dados compartilhado com coluna `tenant_id` em todas as tabelas
- **Isolamento**: Row-Level Security (RLS) do PostgreSQL + middleware no backend
- **Fluxo**: toda requisição autenticada carrega o `tenant_id` no JWT → middleware injeta automaticamente nos queries

### Por que RLS?

- Dupla camada de segurança (aplicação + banco)
- Impossível um tenant acessar dados de outro, mesmo em caso de bug no código
- Essencial para LGPD quando há dados sensíveis

## Autenticação e autorização

### Fluxo

1. Login com e-mail + senha
2. Backend gera JWT (access token, 15min) + refresh token (7 dias)
3. Frontend armazena access token em memória e refresh token em httpOnly cookie
4. Middleware valida JWT em toda requisição protegida

### Níveis de permissão (por tenant)

| Nível | Pode fazer |
|-------|-----------|
| **owner** | Tudo. Gerencia usuários, vê financeiro, configura módulos |
| **manager** | Opera o sistema, cria/edita registros, vê relatórios |
| **employee** | Acesso limitado, só registra operações do dia a dia |

### Super Admin (Angel)

- Acesso separado via painel admin
- Pode ver e gerenciar todos os tenants
- Pode ativar/desativar módulos, verificar pagamentos, ver métricas de uso

## Módulos

Cada módulo segue a mesma estrutura:

```
modules/
  └── [nome-do-modulo]/
      ├── controller.ts    # Rotas e handlers
      ├── service.ts       # Lógica de negócio
      ├── repository.ts    # Acesso ao banco (via Prisma)
      ├── validators.ts    # Validação de entrada (Zod)
      └── types.ts         # Tipos específicos do módulo
```

Módulos são registrados dinamicamente. O middleware verifica se o módulo está ativo para o tenant antes de permitir acesso.

## Banco de dados

- **PostgreSQL 15+** (suporte completo a RLS e JSON)
- **ORM**: Prisma (type-safe, migrations automáticas, bom para quem não é DBA)
- **Backup**: automático diário via provedor de hosting

## API

- RESTful, versionada (`/api/v1/`)
- Respostas padronizadas:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "total": 50 }
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Campo obrigatório: nome"
  }
}
```

## Hospedagem recomendada (início)

| Serviço | Para quê | Custo estimado |
|---------|----------|---------------|
| **Railway** | Backend + PostgreSQL | ~R$50-80/mês |
| **Vercel** | Frontend + Landing + Admin | Grátis (plano hobby) |
| **Evolution API** | WhatsApp (self-hosted no Railway) | Incluso no Railway |
| **Total estimado** | | **~R$80-120/mês** |

Isso cabe no orçamento de R$200/mês e deixa margem para crescer.

## Escalabilidade

A arquitetura permite escalar gradualmente:

1. **5-10 clientes**: Railway básico (suficiente)
2. **10-50 clientes**: upgrade do plano Railway
3. **50-200 clientes**: migrar para AWS/GCP com containers
4. **200+ clientes**: arquitetura distribuída, filas, cache

Não precisa se preocupar com isso agora — a base está preparada.
