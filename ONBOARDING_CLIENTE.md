# Onboarding de Novo Cliente — Anpexia
## ⚠️ LEIA ANTES DE CADASTRAR QUALQUER CLIENTE NOVO

Este arquivo existe para garantir que cada cliente tenha seus serviços completamente isolados.
Nunca compartilhe recursos entre clientes diferentes.

---

## 📋 CONTAS E SERVIÇOS QUE DEVEM SER CRIADOS SEPARADAMENTE PARA CADA CLIENTE

### ✅ OBRIGATÓRIAS (todo cliente novo)

1. **Tenant no sistema**
   - Criar via painel admin da Anpexia
   - Email e senha únicos para o OWNER

2. **Número de WhatsApp exclusivo**
   - Chip separado do pessoal e de outros clientes
   - Nunca compartilhar número entre clientes
   - Escanear QR code para conectar instância

3. **Instância Evolution API**
   - Criar instância separada no Railway para cada cliente
   - Nome da instância: nome do tenant (sem espaços)
   - Nunca usar a mesma instância para dois clientes

4. **Conta Resend (email)**
   - Criar conta gratuita em resend.com para cada cliente
   - Plano gratuito: 3.000 emails/mês (suficiente para clínica pequena)
   - Pegar a API key (começa com re_) e configurar no tenant
   - NUNCA usar a mesma conta Resend para dois clientes

5. **Schema/banco de dados**
   - Cada cliente já é isolado por tenantId no Neon
   - Verificar que nenhuma query vaza dados entre tenants

### 🔄 QUANDO USAR DOMÍNIO PRÓPRIO DO CLIENTE

6. **Domínio personalizado**
   - Ex: sistema.clinicaxyz.com.br
   - Configurar DNS apontando para Vercel
   - Criar projeto separado na Vercel para o app do cliente

### 📈 QUANDO O CLIENTE ESCALAR (alto volume)

7. **Serviço Railway dedicado**
   - Hoje o backend é compartilhado entre todos os clientes
   - Clientes com alto volume precisam de serviço próprio no Railway
   - Avaliar quando ultrapassar 500 agendamentos/mês

8. **API Oficial do WhatsApp (Meta)**
   - Substituir Evolution API pela API oficial da Meta
   - Cliente precisa ter conta Meta Business verificada
   - Número de telefone dedicado aprovado pela Meta
   - Cobrança por conversa (~$0,02-0,08)
   - Necessário aprovar templates de mensagem na Meta

---

## 🚀 PASSO A PASSO PARA CADASTRAR CLIENTE NOVO

1. Coletar todos os dados do checklist de onboarding
2. Criar tenant no painel admin
3. Criar conta Resend para o cliente → pegar API key
4. Configurar API key do Resend no tenant do cliente
5. Criar instância Evolution API para o cliente no Railway
6. Conectar WhatsApp (escanear QR code com o chip do cliente)
7. Configurar webhook apontando para o backend
8. Configurar chatbot (nome, horário, especialidades, convênios)
9. Testar fluxo completo (mensagem → bot → cadastro → agendamento)
10. Treinar equipe do cliente no sistema
11. Entregar login e senha para o OWNER

---

## 💰 CUSTO ESTIMADO POR CLIENTE

| Serviço | Custo |
|---|---|
| Resend | $0 (até 3.000 emails/mês) |
| Evolution API (Railway) | ~$5-10/mês por instância |
| Banco de dados (Neon) | $0 (compartilhado por tenantId) |
| Anthropic (Claude) | ~$0,50-2/mês dependendo do volume |
| **Total estimado** | **~$5-12/mês por cliente** |

---

## ⚠️ AVISOS IMPORTANTES

- NUNCA compartilhar instância Evolution API entre clientes
- NUNCA compartilhar conta Resend entre clientes
- SEMPRE testar o fluxo completo antes de entregar ao cliente
- SEMPRE fazer backup das configurações do tenant antes de alterações
- Guardar todas as API keys e tokens em local seguro
