import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import prisma from '../../config/database';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const DEMO_TENANT_ID = 'cmn6uok25000dll0pnhjlcert';
const MAX_MESSAGES_PER_SESSION = 20;

interface SessionData {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: number;
}

interface DemoChatResponse {
  reply: string;
  buttons?: Array<{ id: string; label: string }>;
}

// In-memory session store with 1-hour TTL
const sessions = new Map<string, SessionData>();

// Clean up expired sessions every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

let cachedConfig: any = null;
let cachedFaqs: any[] = [];
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getClinicConfig() {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL) {
    return { config: cachedConfig, faqs: cachedFaqs };
  }

  const config = await prisma.chatbotConfig.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });

  const faqs = await prisma.chatbotFaq.findMany({
    where: { tenantId: DEMO_TENANT_ID, isActive: true },
    select: { question: true, answer: true, category: true },
  });

  cachedConfig = config;
  cachedFaqs = faqs;
  cacheTime = now;

  return { config, faqs };
}

function buildSystemPrompt(config: any, faqs: any[]): string {
  const assistantName = config?.assistantName || 'Ana';
  const clinicName = config?.businessName || 'Clínica Saúde Total';

  let prompt = `Você é ${assistantName}, assistente virtual da ${clinicName}. Esta é uma demonstração do chatbot Anpexia.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Você DEVE responder SEMPRE em formato JSON válido, sem nenhum texto fora do JSON. O formato é:
{"message": "texto da sua resposta aqui", "buttons": ["opção 1", "opção 2"]}

- O campo "message" contém o texto da resposta.
- O campo "buttons" é um array de strings. Use array vazio [] quando não houver botões.
- NUNCA responda fora do formato JSON. NUNCA adicione texto antes ou depois do JSON.
- NUNCA use markdown code blocks (\`\`\`). Responda APENAS com o JSON puro.

Seu objetivo é:
1. Atender com empatia, profissionalismo e agilidade
2. Responder dúvidas sobre a clínica, especialidades e procedimentos
3. Mostrar as capacidades do chatbot Anpexia como ferramenta de automação
4. Nunca substituir orientação médica — sempre recomendar consulta presencial
5. Conduzir agendamentos de consulta de forma guiada, passo a passo, inteiramente pelo chat

Informações da clínica:
- Nome: ${clinicName}`;

  if (config?.specialties) prompt += `\n- Especialidades: ${config.specialties}`;
  if (config?.businessHours) prompt += `\n- Horários: ${config.businessHours}`;
  if (config?.businessAddress) prompt += `\n- Endereço: ${config.businessAddress}`;
  if (config?.businessPhone) prompt += `\n- Telefone: ${config.businessPhone}`;
  if (config?.acceptedInsurance) prompt += `\n- Convênios aceitos: ${config.acceptedInsurance}`;
  if (config?.servicesOffered) prompt += `\n- Serviços: ${config.servicesOffered}`;
  if (config?.priceInfo) prompt += `\n- Preços: ${config.priceInfo}`;
  if (config?.businessDescription) prompt += `\n- Sobre: ${config.businessDescription}`;

  prompt += `

FLUXO DE AGENDAMENTO — siga este fluxo passo a passo quando o paciente quiser agendar:

Passo 1 — Especialidade: Pergunte qual especialidade deseja.
Botões obrigatórios: ["Clínica Geral", "Cardiologia", "Ortopedia", "Pediatria", "Dermatologia"]

Passo 2 — Convênio: Pergunte se possui convênio médico.
Botões obrigatórios: ["Sim, tenho convênio", "Não, vou particular"]

Passo 3 — Nome completo: Peça o nome completo do paciente.
Sem botões (buttons: []) — o paciente digita livremente.

Passo 4 — Telefone: Peça o telefone para contato.
Sem botões (buttons: []) — o paciente digita livremente.

Passo 5 — Turno preferido: Pergunte o turno de preferência.
Botões obrigatórios: ["Manhã", "Tarde"]

Passo 6 — Confirmação: Resuma TODOS os dados coletados e peça confirmação. SEMPRE inclua botões neste passo, sem exceção.
Botões OBRIGATÓRIOS (inclua EXATAMENTE estes): ["Sim, confirmar", "Corrigir informação"]

Passo 7 — Conclusão: Confirme o agendamento com mensagem de sucesso. Diga que a clínica entrará em contato para confirmar data e horário exatos. Ofereça próximos passos.
Botões obrigatórios: ["Agendar outra consulta", "Falar com atendente"]

IMPORTANTE sobre o fluxo de agendamento:
- Siga RIGOROSAMENTE a ordem dos passos, um de cada vez
- NÃO pule passos — colete cada informação individualmente
- NÃO sugira ligar para a clínica — o agendamento é feito inteiramente pelo chat
- Se o paciente responder "Corrigir informação", pergunte qual dado quer corrigir e refaça apenas esse passo
- Se o paciente já forneceu algum dado espontaneamente, confirme e pule para o próximo passo

QUANDO USAR BOTÕES FORA DO AGENDAMENTO:
- Na mensagem de boas-vindas ou quando oferecer opções: ["Agendar consulta", "Informações sobre a clínica", "Falar com atendente"]
- Quando perguntar se o paciente quer agendar: ["Sim, quero agendar", "Não, obrigado"]
- Em outras perguntas de sim/não: use botões apropriados
- Em respostas puramente informativas sem opções: use buttons: []

Regras de comportamento:
- Sempre responda em português brasileiro
- Seja caloroso mas profissional
- Mensagens curtas e diretas — máximo 3 parágrafos
- Use no máximo 1-2 emojis por mensagem quando apropriado
- Quando o paciente tiver dúvida de saúde, acolha mas direcione para consulta
- Quando perceber oportunidade, sugira agendamento de forma natural
- Nunca invente informações — se não souber, diga que vai verificar
- Se o paciente estiver em emergência, indique imediatamente o SAMU (192) ou UPA mais próxima
- Esta é uma DEMO — se perguntarem sobre o Anpexia ou a plataforma, explique brevemente que é um sistema de automação empresarial
- NUNCA sugira ligar para a clínica para agendar. Todo agendamento é feito pelo chat.`;

  if (faqs.length > 0) {
    prompt += `\n\nPerguntas frequentes:`;
    for (const faq of faqs) {
      prompt += `\nP: ${faq.question}\nR: ${faq.answer}`;
    }
  }

  if (config?.customInstructions) {
    prompt += `\n\nInstruções adicionais:\n${config.customInstructions}`;
  }

  return prompt;
}

function extractResult(parsed: any): { message: string; buttons: string[] } | null {
  if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
    return {
      message: parsed.message.trim(),
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons.filter((b: any) => typeof b === 'string') : [],
    };
  }
  return null;
}

function looksLikeRawJSON(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('{') && t.includes('"message"')) ||
         (t.startsWith("{'") && t.includes("'message'"));
}

function parseAIResponse(raw: string): { message: string; buttons: string[] } {
  const trimmed = raw.trim();

  // 1) Direct JSON.parse
  try {
    const result = extractResult(JSON.parse(trimmed));
    if (result) return result;
  } catch { /* continue */ }

  // 2) Strip markdown code fences
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  if (stripped !== trimmed) {
    try {
      const result = extractResult(JSON.parse(stripped));
      if (result) return result;
    } catch { /* continue */ }
  }

  // 3) Fix single quotes
  if (trimmed.includes("'message'")) {
    try {
      const fixed = trimmed.replace(/'/g, '"');
      const result = extractResult(JSON.parse(fixed));
      if (result) return result;
    } catch { /* continue */ }
  }

  // 4) Greedy regex: outermost { ... }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const result = extractResult(JSON.parse(jsonMatch[0]));
      if (result) return result;
    } catch {
      try {
        const fixed = jsonMatch[0].replace(/'/g, '"');
        const result = extractResult(JSON.parse(fixed));
        if (result) return result;
      } catch { /* continue */ }
    }
  }

  // 5) If it looks like broken JSON, return error message
  if (looksLikeRawJSON(trimmed)) {
    console.error('[DEMO] Failed to parse JSON response:', trimmed.substring(0, 200));
    return { message: 'Desculpe, tive um probleminha. Pode repetir?', buttons: [] };
  }

  // 6) Plain text fallback
  const cleanText = trimmed
    .replace(/\s*\[HANDOFF_TO_HUMAN\]\s*/g, '')
    .replace(/\s*\[START_REGISTRATION\]\s*/g, '')
    .trim();

  return { message: cleanText, buttons: [] };
}

export const demoService = {
  async chat(sessionId: string, userMessage: string): Promise<DemoChatResponse> {
    let session = sessions.get(sessionId);

    if (!session) {
      session = { messages: [], createdAt: Date.now() };
      sessions.set(sessionId, session);
    }

    // Check message limit
    const userMessageCount = session.messages.filter(m => m.role === 'user').length;
    if (userMessageCount >= MAX_MESSAGES_PER_SESSION) {
      return {
        reply: 'Você atingiu o limite de mensagens desta demonstração. Obrigado por testar o Anpexia! 😊 Para saber mais, entre em contato conosco.',
      };
    }

    const { config, faqs } = await getClinicConfig();
    const systemPrompt = buildSystemPrompt(config, faqs);

    session.messages.push({ role: 'user', content: userMessage });

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: session.messages,
      });

      const rawText = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      if (!rawText) {
        return { reply: 'Desculpe, não consegui processar sua mensagem. Pode tentar novamente?' };
      }

      const { message, buttons } = parseAIResponse(rawText);

      // Store the human-readable message in conversation history (not JSON)
      session.messages.push({ role: 'assistant', content: message });

      const result: DemoChatResponse = { reply: message };

      if (buttons.length > 0) {
        result.buttons = buttons.map((label, i) => ({
          id: `btn_${i + 1}`,
          label,
        }));
      }

      return result;
    } catch (error: any) {
      console.error('[DEMO] Claude API error:', error.message);
      return {
        reply: 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns segundos.',
      };
    }
  },
};
