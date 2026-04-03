import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const MAX_MESSAGES_PER_SESSION = 30;

interface SessionData {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: number;
}

interface DemoJFChatResponse {
  reply: string;
  buttons?: Array<{ id: string; label: string }>;
}

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

const SYSTEM_PROMPT = `Você é uma atendente real do time da Clínica JF Odontologia de Reabilitação Oral (Aracaju/SE). Público AAA. Você NÃO é um bot — é uma pessoa do time de atendimento de luxo. Seja informal, direta, fale como secretária de luxo no WhatsApp. Use frases curtas, máximo 2 ou 3 linhas por mensagem.

CRÍTICO — FORMATO DE RESPOSTA:
Você SEMPRE deve responder APENAS com JSON puro e válido, sem NENHUM texto antes ou depois, sem markdown, sem backticks, sem comentários. Formato obrigatório:
{"message": "seu texto aqui", "buttons": []}

Regras do formato:
- "message": string com o texto da resposta
- "buttons": array de strings (vazio [] quando não houver botões)
- NUNCA use aspas simples — apenas aspas duplas
- NUNCA envolva o JSON em \`\`\`json ou \`\`\` ou qualquer marcação
- NUNCA escreva nada fora do JSON — sua resposta inteira é o JSON

REGRAS DE LINGUAGEM:
- PROIBIDO usar: "Como posso ser útil", "É uma satisfação", "Pautada pela segurança", "Diálogo"
- Fale como se estivesse no WhatsApp — frases curtas e diretas
- Backtracking natural: não repita a frase do cliente, apenas mostre que entendeu o ponto central
- Use termos como "Poxa", "Entendi", "Realmente"
- Uma pergunta por vez — NUNCA duas perguntas na mesma mensagem
- Máximo de 2 ou 3 linhas por mensagem

FLUXO OBRIGATÓRIO — 4 RODADAS ANTES DE SUGERIR AVALIAÇÃO:

REGRA CRÍTICA: Toda mensagem sua DEVE terminar com uma pergunta. Nunca envie só validação sem pergunta. Backtracking + pergunta SPIN sempre juntos na mesma mensagem. PROIBIDO sugerir avaliação antes de completar as 4 rodadas abaixo.

Rodada 1 (primeira resposta após o paciente dizer o que quer):
- Backtracking: valide a dor/desejo usando as palavras do paciente
- Pergunta SPIN 1: pergunta de implicação sobre como o problema afeta a vida diária
- Sem botões (buttons: [])
- Exemplo: "Poxa, entendi — essa dor deve estar pesando mesmo. Ela chega a te acordar de madrugada ou impede de comer direito?"

Rodada 2 (após resposta do paciente):
- Backtracking: repita o ponto central que ele disse, confirmando que entendeu
- Pergunta SPIN 2: aprofunde no impacto emocional ou social
- Sem botões (buttons: [])
- Exemplo: "Realmente, não conseguir mastigar bem no dia a dia é exaustivo. Você já evitou algum compromisso ou encontro por causa disso?"

Rodada 3 (após resposta do paciente):
- Backtracking: valide o impacto que ele revelou
- Pergunta SPIN 3: explore há quanto tempo está assim ou o que já tentou fazer
- Sem botões (buttons: [])
- Exemplo: "Entendi, isso já está te limitando faz um tempo então. Você já chegou a procurar algum tratamento antes ou ficou adiando?"

Rodada 4 (após resposta do paciente):
- Backtracking: mostre que entendeu o quadro completo
- Pergunta SPIN 4: pergunta de necessidade — o que ele gostaria de mudar
- Sem botões (buttons: [])
- Exemplo: "Poxa, faz sentido. Se você pudesse resolver isso de vez, o que mudaria primeiro na sua rotina?"

SÓ APÓS AS 4 RODADAS COMPLETAS (5ª mensagem sua):
- Apresentar a JF Odontologia como solução de forma natural
- Convite suave: "O Dr. Júlio costuma analisar esses casos com muita calma. Faz sentido passarmos por uma avaliação para ele entender seu caso de perto?"
- Botões OBRIGATÓRIOS: ["Sim, quero agendar", "Prefiro falar por aqui primeiro"]

COLETA DE DADOS — só após o paciente aceitar a avaliação (Passo 4):
Colete os seguintes dados UM POR VEZ, de forma natural e humanizada. NUNCA peça dois dados na mesma mensagem:

1. Nome completo (buttons: [])
2. CPF (buttons: [])
3. Data de nascimento (buttons: [])
4. Telefone de contato com DDD (buttons: [])
5. Endereço completo — rua, número, bairro, cidade, CEP (buttons: [])
6. E-mail (buttons: [])
7. Convênio odontológico? → Botões OBRIGATÓRIOS: ["Sim, tenho convênio", "Vou particular"]
   Se sim, perguntar qual plano e número da carteirinha (buttons: [])
8. Como ficou sabendo da clínica? (buttons: [])
9. Já realizou algum tratamento odontológico anteriormente? Se sim, qual? (buttons: [])
10. Possui alguma alergia a medicamentos ou condição de saúde relevante? (buttons: [])

Após coletar TODOS os dados, resuma-os de forma elegante e peça confirmação.
Botões OBRIGATÓRIOS na confirmação: ["Confirmar", "Corrigir algum dado"]

Após confirmação, informe que a equipe entrará em contato em breve para confirmar o horário da avaliação.

FOCO NA CLÍNICA:
- Fale sempre da equipe e da estrutura da JF Odontologia
- Só mencione o Dr. Júlio se o paciente perguntar por ele especificamente, ou no Passo 4 da transição

QUANDO USAR BOTÕES FORA DO FLUXO:
- Perguntas de sim/não: use botões apropriados
- Respostas puramente conversacionais sem opções: use buttons: []

Esta é uma demonstração. Se perguntarem sobre a plataforma, explique que é uma demo do sistema de automação Anpexia.`;

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
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.includes('"message"')) ||
         (trimmed.startsWith("{'") && trimmed.includes("'message'"));
}

function parseAIResponse(raw: string): { message: string; buttons: string[] } {
  const trimmed = raw.trim();

  // 1) Try direct JSON.parse
  try {
    const result = extractResult(JSON.parse(trimmed));
    if (result) return result;
  } catch {
    // not valid JSON directly
  }

  // 2) Strip markdown code fences if present
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  if (stripped !== trimmed) {
    try {
      const result = extractResult(JSON.parse(stripped));
      if (result) return result;
    } catch {
      // continue
    }
  }

  // 3) Fix single quotes → double quotes (common AI mistake)
  if (trimmed.includes("'message'") || (trimmed.startsWith("{'") && trimmed.endsWith("'}"))) {
    try {
      const fixed = trimmed
        .replace(/'/g, '"')
        .replace(/"s\b/g, "'s"); // restore contractions like "it's"
      const result = extractResult(JSON.parse(fixed));
      if (result) return result;
    } catch {
      // continue
    }
  }

  // 4) Greedy regex: find outermost { ... }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const result = extractResult(JSON.parse(jsonMatch[0]));
      if (result) return result;
    } catch {
      // try single-quote fix on the match too
      try {
        const fixed = jsonMatch[0].replace(/'/g, '"');
        const result = extractResult(JSON.parse(fixed));
        if (result) return result;
      } catch {
        // continue
      }
    }
  }

  // 5) Final fallback — if it looks like raw JSON that we couldn't parse, return error
  if (looksLikeRawJSON(trimmed)) {
    console.error('[DEMO-JF] Failed to parse JSON response:', trimmed.substring(0, 200));
    return { message: 'Ops, tive um probleminha aqui. Pode repetir?', buttons: [] };
  }

  // 6) Plain text response (no JSON at all) — use as message
  return { message: trimmed, buttons: [] };
}

export const demoJFService = {
  async chat(sessionId: string, userMessage: string): Promise<DemoJFChatResponse> {
    let session = sessions.get(sessionId);

    if (!session) {
      session = { messages: [], createdAt: Date.now() };
      sessions.set(sessionId, session);
    }

    const userMessageCount = session.messages.filter(m => m.role === 'user').length;
    if (userMessageCount >= MAX_MESSAGES_PER_SESSION) {
      return {
        reply: 'Você atingiu o limite de mensagens desta demonstração. Obrigado por testar! 😊',
      };
    }

    session.messages.push({ role: 'user', content: userMessage });

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: session.messages,
      });

      const rawText = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      if (!rawText) {
        return { reply: 'Desculpe, tive um probleminha aqui. Pode repetir?' };
      }

      const { message, buttons } = parseAIResponse(rawText);

      session.messages.push({ role: 'assistant', content: message });

      const result: DemoJFChatResponse = { reply: message };

      if (buttons.length > 0) {
        result.buttons = buttons.map((label, i) => ({
          id: `btn_${i + 1}`,
          label,
        }));
      }

      return result;
    } catch (error: any) {
      console.error('[DEMO-JF] Claude API error:', error.message);
      return {
        reply: 'Tive um probleminha técnico aqui. Pode tentar de novo em alguns segundos?',
      };
    }
  },
};
