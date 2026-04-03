# Integrações — Anpexia

## Integrações do MVP

### 1. Evolution API (WhatsApp)

**O que é**: API open-source para integração com WhatsApp. Permite enviar e receber mensagens programaticamente.

**Por que escolhemos**: mais acessível e flexível que a API oficial do WhatsApp Business (Meta). Pode ser self-hosted, reduzindo custos.

**Como funciona**:
1. Evolution API roda como serviço separado (self-hosted no Railway)
2. Cada tenant conecta seu número de WhatsApp via QR Code
3. Backend da Anpexia se comunica com a Evolution API para enviar mensagens
4. Webhooks recebem confirmações de entrega e respostas

**Endpoints principais**:
- `POST /message/sendText` — enviar mensagem de texto
- `POST /instance/create` — criar instância para novo tenant
- `GET /instance/connect` — gerar QR Code para conectar
- `GET /instance/connectionState` — verificar status da conexão

**Configuração por tenant**:
- Cada tenant tem sua própria instância na Evolution API
- O número de WhatsApp é do cliente (não da Anpexia)
- Angel configura na implantação, cliente escaneia QR Code

### 2. Gateway de pagamento

**Opção preferencial**: InfinityPay
- Angel já possui conta com taxas reduzidas
- Verificar disponibilidade de API para cobranças recorrentes
- Se não houver API adequada, usar como fallback apenas para cobranças manuais

**Opção alternativa**: Mercado Pago
- API robusta para assinaturas recorrentes
- Ampla aceitação no Brasil (Pix, cartão, boleto)
- SDK oficial para Node.js
- Taxas: ~4.99% por transação

**Opção alternativa 2**: Stripe
- API excelente, documentação impecável
- Suporte a assinaturas recorrentes nativo
- Taxas: ~3.99% + R$0.39 por transação

**Decisão**: começar verificando a API da InfinityPay. Se não for viável para recorrência, implementar Mercado Pago (mais popular no Brasil).

---

## Integrações futuras (roadmap)

### Google Ads API
- Importar métricas de campanhas para o dashboard
- Visualizar ROI de anúncios dentro da Anpexia
- Alertas automáticos de performance

### Facebook/Instagram Ads API
- Mesmo conceito do Google Ads
- Métricas unificadas de marketing digital

### Gmail API
- Envio de e-mails automatizados (complemento ao WhatsApp)
- Templates de e-mail para campanhas
- Notificações por e-mail

### Canva API
- Criação rápida de materiais (posts, banners, flyers)
- Templates pré-prontos por segmento
- Integração com redes sociais

### APIs de marketplace
- Mercado Livre, Shopee, etc.
- Sincronização de estoque
- Gestão de pedidos centralizada

### APIs contábeis
- Integração com sistemas de contabilidade
- Exportação de dados financeiros
- Facilitação de obrigações fiscais

## Arquitetura de integrações

Todas as integrações seguem o mesmo padrão:

```
backend/src/modules/integrations/
  ├── evolution/        # WhatsApp
  ├── payments/         # Gateway de pagamento
  ├── google-ads/       # (futuro)
  ├── facebook-ads/     # (futuro)
  ├── gmail/            # (futuro)
  └── base/
      ├── integration.interface.ts   # Interface base
      └── integration.registry.ts    # Registro de integrações
```

Cada integração implementa uma interface comum, facilitando adicionar novas no futuro.
