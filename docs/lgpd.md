# Conformidade LGPD — Anpexia

## Por que isso importa

A Anpexia armazena dados pessoais dos clientes das empresas (nome, telefone, CPF, dados de saúde em alguns casos). A Lei Geral de Proteção de Dados (LGPD) exige que esses dados sejam tratados com segurança e transparência.

**Risco de não conformidade**: multas de até 2% do faturamento, danos à reputação, perda de clientes.

## Medidas implementadas

### 1. Isolamento de dados (multi-tenant)

- Row-Level Security (RLS) no PostgreSQL
- Cada tenant só acessa seus próprios dados
- Impossível vazamento entre tenants

### 2. Criptografia

- **Em trânsito**: HTTPS obrigatório (TLS 1.2+)
- **Em repouso**: campos sensíveis criptografados no banco (CPF, dados de saúde)
- **Senhas**: hash com bcrypt (salt rounds: 12)

### 3. Controle de acesso

- Autenticação via JWT com expiração curta (15 min)
- Refresh tokens com rotação
- Permissões granulares (owner, manager, employee)
- Sessões podem ser revogadas

### 4. Audit log

- Registro de todas as ações relevantes (quem fez o quê, quando)
- Logs imutáveis
- Retenção mínima de 12 meses

### 5. Direitos do titular

A plataforma deve permitir que o cliente da empresa exerça seus direitos:

- **Acesso**: visualizar seus dados
- **Correção**: solicitar correção de dados incorretos
- **Exclusão**: solicitar remoção dos dados (direito ao esquecimento)
- **Portabilidade**: exportar dados em formato aberto

**Implementação**: funcionalidade no módulo de Clientes para exportar/excluir dados de um cliente específico.

### 6. Consentimento

- Mensagens automáticas via WhatsApp requerem opt-in do destinatário
- Registro do consentimento com data e hora
- Opção de opt-out em toda mensagem

### 7. Backup e recuperação

- Backup automático diário
- Retenção de backups por 30 dias
- Teste de recuperação mensal

### 8. Termos e políticas

Documentos necessários (criar antes do lançamento):

- [ ] Termos de uso da plataforma (para empresas clientes)
- [ ] Política de privacidade
- [ ] Contrato de processamento de dados (DPA)
- [ ] Política de cookies (landing page)

## Responsabilidades

| Papel | Responsável |
|-------|-------------|
| Controlador dos dados | A empresa cliente (tenant) |
| Operador dos dados | Anpexia (Angel) |
| Encarregado (DPO) | Angel (inicialmente) |

A Anpexia atua como **operadora** dos dados — processa dados em nome das empresas clientes, que são as **controladoras**.

## Checklist para cada novo tenant

- [ ] Empresa cliente assinou contrato/termos
- [ ] Política de privacidade está acessível
- [ ] Campos sensíveis estão criptografados
- [ ] RLS está ativo para o tenant
- [ ] Backup inclui os dados do novo tenant
