# Módulos — Anpexia

## Filosofia

Cada módulo é independente e pode ser ativado/desativado por tenant. A configuração é feita pelo admin (Angel) durante a implantação. O cliente só vê e usa os módulos que foram ativados para ele.

---

## MVP — Módulos para lançamento

### 1. Dashboard

**Objetivo**: dar ao dono/gestor uma visão geral instantânea do negócio.

**Widgets do dashboard**:
- Vendas do dia / semana / mês (valor total e quantidade)
- Produtos com estoque baixo (alerta)
- Próximos agendamentos (hoje e amanhã)
- Mensagens enviadas (hoje/semana)
- Clientes novos (semana/mês)
- Gráfico de evolução de vendas (últimos 30 dias)

**Observações**:
- Os widgets se adaptam aos módulos ativos. Se o tenant não tem o módulo de agendamentos, esse widget não aparece.
- Dados em tempo real, atualizados a cada acesso.

### 2. Clientes / Contatos

**Objetivo**: centralizar todas as informações dos clientes da empresa.

**Campos**:
- Nome completo
- Telefone (com WhatsApp)
- E-mail
- Endereço (CEP, rua, número, bairro, cidade, estado)
- CPF/CNPJ (opcional, criptografado)
- Data de nascimento / aniversário
- Tags (ex: "VIP", "Novo", "Inadimplente", "Recorrente")
- Notas livres
- Data do primeiro contato
- Origem (como chegou: indicação, redes sociais, etc.)

**Funcionalidades**:
- Listagem com busca e filtros (por tag, por data, por nome)
- Histórico de interações (compras, serviços, mensagens enviadas)
- Importação em massa via CSV
- Exportação de dados
- Visualização de timeline por cliente

### 3. Estoque

**Objetivo**: controle completo de produtos e insumos.

**Campos do produto**:
- Nome
- SKU / código interno
- Categoria
- Quantidade atual
- Quantidade mínima (para alertas)
- Unidade de medida (un, kg, L, etc.)
- Preço de custo
- Preço de venda
- Margem (calculada automaticamente)
- Fornecedor
- Lote
- Data de validade
- Localização no estoque (opcional)
- Foto do produto (opcional)

**Funcionalidades**:
- Registro de movimentações (entrada/saída com motivo, data, responsável)
- Alerta automático de estoque baixo (quando atingir quantidade mínima)
- Alerta de produtos próximos do vencimento
- Relatório de giro de estoque
- Histórico completo de movimentações
- Importação/exportação CSV

### 4. Mensagens Automáticas (WhatsApp)

**Objetivo**: enviar mensagens automatizadas para os clientes da empresa via WhatsApp.

**Tipos de mensagem automática**:

| Tipo | Gatilho | Exemplo |
|------|---------|---------|
| Lembrete de agendamento | X horas antes do agendamento | "Olá Maria, lembrete: seu horário é amanhã às 14h." |
| Aviso de retorno | X dias sem visita | "Faz 30 dias desde sua última visita. Que tal agendar?" |
| Aniversário | Data de nascimento | "Feliz aniversário, João! Temos um presente para você." |
| Boas-vindas | Novo cadastro | "Bem-vindo(a) à [empresa]! Estamos felizes em te atender." |
| Alerta de estoque | Estoque atingiu mínimo | (para o dono) "Atenção: [produto] está com estoque baixo." |
| Confirmação | Após agendar | "Seu agendamento foi confirmado para [data] às [hora]." |
| Pós-serviço | X horas após atendimento | "Como foi sua experiência? Adoraríamos saber!" |

**Templates**:
- Vêm pré-configurados com textos profissionais
- Cliente pode editar o texto pelo painel
- Suporte a variáveis: `{nome}`, `{data}`, `{hora}`, `{empresa}`, `{produto}`

**Configurações por tenant**:
- Ativar/desativar cada tipo de mensagem
- Definir horários permitidos para envio (ex: 8h-20h)
- Definir intervalos (ex: lembrete 24h antes, retorno após 30 dias)
- Limite mensal de mensagens conforme plano

---

### 5. Chatbot com IA (WhatsApp)

**Objetivo**: atendimento automático inteligente 24h via WhatsApp usando inteligência artificial.

**Como funciona**:
1. Cliente da empresa manda mensagem no WhatsApp
2. A IA responde automaticamente com base nas informações configuradas para aquele negócio
3. Se não souber responder, encaminha para atendimento humano
4. Toda conversa fica salva e vinculada ao cadastro do cliente

**Funcionalidades**:
- Responder perguntas frequentes (horário, endereço, preços, serviços)
- Permitir agendamento direto pelo WhatsApp
- Consultar status de pedidos/serviços
- Encaminhar para atendente humano quando necessário
- Funcionar 24 horas por dia, 7 dias por semana
- Mensagem de boas-vindas configurável
- Mensagem de fallback configurável

**Configuração por tenant**:
- Nome e descrição da empresa
- Horário de funcionamento
- Endereço e telefone
- Serviços/produtos oferecidos
- Informações de preços
- FAQs personalizadas (perguntas e respostas específicas do negócio)
- Instruções extras para a IA (tom de voz, regras especiais)
- Ativar/desativar agendamento pelo chat
- Ativar/desativar consulta de pedidos
- Opção de responder apenas em horário comercial

**Histórico**:
- Todas as conversas são armazenadas
- Vinculadas ao cadastro do cliente (cria automaticamente se não existir)
- Visível no painel do cliente
- Estatísticas: total de mensagens, contatos únicos, handoffs para humano

**Conta como 1 automação** no plano do cliente.

---

## Módulos futuros (pós-MVP)

### Agendamentos
- Agenda visual (calendário)
- Agendamento por profissional/recurso
- Bloqueio de horários
- Integração com mensagens automáticas

### Financeiro
- Registro de vendas / receitas
- Controle de despesas
- Fluxo de caixa
- Relatórios financeiros
- Contas a receber / pagar

### Relatórios avançados
- Relatórios customizáveis
- Exportação PDF
- Gráficos comparativos
- Métricas por período

### Integrações externas (visão de futuro)
- Google Ads (métricas de campanhas)
- Facebook/Instagram Ads
- Gmail (envio de e-mails automatizados)
- Canva (criação de materiais)
- Marketplaces (Mercado Livre, Shopee)
- ERP / sistemas contábeis
