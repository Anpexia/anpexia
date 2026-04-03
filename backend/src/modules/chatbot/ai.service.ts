import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

interface GenerateResponseParams {
  userMessage: string;
  senderName: string;
  config: {
    businessName?: string | null;
    businessDescription?: string | null;
    businessHours?: string | null;
    businessAddress?: string | null;
    businessPhone?: string | null;
    servicesOffered?: string | null;
    priceInfo?: string | null;
    customInstructions?: string | null;
    greetingMessage?: string | null;
    fallbackMessage?: string | null;
    allowScheduling?: boolean;
    allowOrderStatus?: boolean;
    assistantName?: string | null;
    specialties?: string | null;
    acceptedInsurance?: string | null;
  };
  faqs: Array<{ question: string; answer: string; category?: string | null }>;
  conversationHistory: Array<{
    direction: string;
    body: string;
    senderName: string;
  }>;
  customer: {
    name: string;
    phone?: string | null;
  } | null;
}

interface AIResponse {
  text: string;
  handoffToHuman: boolean;
  startRegistration: boolean;
  metadata?: Record<string, unknown>;
}

function buildSystemPrompt(params: GenerateResponseParams): string {
  const { config, faqs } = params;

  const assistantName = config.assistantName || 'Assistente Virtual';
  const clinicName = config.businessName || 'nossa clínica';

  let prompt = `Você é um assistente virtual especializado em atendimento de clínicas médicas. Seu nome é ${assistantName} e você representa a ${clinicName}.

Seu objetivo é:
1. Atender pacientes com empatia, profissionalismo e agilidade
2. Responder dúvidas sobre a clínica, especialidades e procedimentos
3. Direcionar naturalmente para agendamento quando apropriado
4. Nunca substituir orientação médica — sempre recomendar consulta presencial para questões de saúde

Informações da clínica:
- Nome: ${clinicName}`;

  if (config.specialties) {
    prompt += `\n- Especialidades: ${config.specialties}`;
  }
  if (config.businessHours) {
    prompt += `\n- Horários: ${config.businessHours}`;
  }
  if (config.businessAddress) {
    prompt += `\n- Endereço: ${config.businessAddress}`;
  }
  if (config.businessPhone) {
    prompt += `\n- Telefone: ${config.businessPhone}`;
  }
  if (config.acceptedInsurance) {
    prompt += `\n- Convênios aceitos: ${config.acceptedInsurance}`;
  }
  if (config.servicesOffered) {
    prompt += `\n- Serviços: ${config.servicesOffered}`;
  }
  if (config.priceInfo) {
    prompt += `\n- Preços: ${config.priceInfo}`;
  }
  if (config.businessDescription) {
    prompt += `\n- Sobre: ${config.businessDescription}`;
  }

  prompt += `

Regras de comportamento:
- Sempre responda em português brasileiro
- Seja caloroso mas profissional
- Mensagens curtas e diretas — máximo 3 parágrafos
- Não use markdown, formatação especial ou emojis excessivos. Mensagens são para WhatsApp.
- Use no máximo 1-2 emojis por mensagem quando apropriado
- Quando o paciente tiver dúvida de saúde, acolha mas direcione para consulta
- Quando perceber oportunidade, sugira agendamento de forma natural
- Nunca invente informações — se não souber, diga que vai verificar
- Se o paciente estiver em emergência, indique imediatamente o SAMU (192) ou UPA mais próxima`;

  if (faqs.length > 0) {
    prompt += `\n\nPerguntas frequentes:`;
    for (const faq of faqs) {
      prompt += `\nP: ${faq.question}\nR: ${faq.answer}`;
    }
  }

  if (config.allowScheduling) {
    prompt += `\n\nO paciente pode agendar consultas pelo chat. Pergunte a especialidade desejada, data e horário de preferência.`;
  }

  if (config.customInstructions) {
    prompt += `\n\nInstruções adicionais do gestor:\n${config.customInstructions}`;
  }

  prompt += `\n\nTokens especiais (inclua no FINAL da sua resposta quando aplicável):

1. [HANDOFF_TO_HUMAN] — Use quando a pergunta não puder ser respondida com as informações acima. Isso transfere para um atendente humano. Responda APENAS com este token, sem texto adicional.

2. [START_REGISTRATION] — Use quando a pessoa demonstrar intenção clara de ser paciente. Exemplos:
   - Quer agendar consulta ou marcar horário
   - Pede informações sobre tratamento específico para si mesma
   - Diz que quer se cadastrar ou ser paciente
   - Pergunta sobre valores de consulta para agendar
   NÃO use este token para:
   - Perguntas genéricas sobre a clínica (horário, endereço, telefone)
   - Fornecedores, representantes comerciais
   - Enganos ou mensagens que não indicam interesse em ser paciente
   - Pessoas apenas tirando dúvidas sem intenção de agendar
   Quando usar [START_REGISTRATION], escreva sua resposta normalmente E adicione o token no final. Exemplo: "Claro, vou te ajudar a agendar! Primeiro preciso de alguns dados para seu cadastro. [START_REGISTRATION]"`;

  return prompt;
}

function buildMessages(params: GenerateResponseParams): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of params.conversationHistory) {
    if (msg.direction === 'INCOMING') {
      messages.push({ role: 'user', content: msg.body });
    } else {
      messages.push({ role: 'assistant', content: msg.body });
    }
  }

  messages.push({ role: 'user', content: params.userMessage });

  return messages;
}

export const aiService = {
  async generateResponse(params: GenerateResponseParams): Promise<AIResponse> {
    const systemPrompt = buildSystemPrompt(params);
    const messages = buildMessages(params);

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const text = response.content[0]?.type === 'text'
        ? response.content[0].text
        : params.config.fallbackMessage || 'Desculpe, não consegui processar sua mensagem.';

      if (text.includes('[HANDOFF_TO_HUMAN]')) {
        return {
          text: '',
          handoffToHuman: true,
          startRegistration: false,
          metadata: { reason: 'ai_requested_handoff' },
        };
      }

      const wantsRegistration = text.includes('[START_REGISTRATION]');
      const cleanText = text.replace(/\s*\[START_REGISTRATION\]\s*/g, '').trim();

      return { text: cleanText, handoffToHuman: false, startRegistration: wantsRegistration };
    } catch (error: any) {
      console.error('[AI] Erro ao chamar Claude API:', error.message);

      return {
        text: '',
        handoffToHuman: true,
        startRegistration: false,
        metadata: { reason: 'ai_error', error: error.message },
      };
    }
  },
};
