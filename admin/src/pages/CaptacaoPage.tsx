import { useState } from 'react';
import { Target, MessageSquare, ShieldCheck, Megaphone, FileText, BookOpen, Copy, Check } from 'lucide-react';

const TABS = [
  { key: 'proposta', label: 'Proposta de Valor', icon: Target },
  { key: 'sdr', label: 'Script SDR', icon: MessageSquare },
  { key: 'closer', label: 'Script Closer', icon: BookOpen },
  { key: 'objecoes', label: 'Objeções', icon: ShieldCheck },
  { key: 'canais', label: 'Canais de Captação', icon: Megaphone },
  { key: 'materiais', label: 'Materiais de Apoio', icon: FileText },
] as const;

type TabKey = typeof TABS[number]['key'];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#1E3A5F] transition-colors"
    >
      {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
    </button>
  );
}

function ScriptBlock({ title, content, tag }: { title: string; content: string; tag?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-slate-800">{title}</h4>
          {tag && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tag}</span>}
        </div>
        <CopyButton text={content} />
      </div>
      <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{content}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200">{title}</h3>
      {children}
    </div>
  );
}

function FeatureCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h4 className="font-semibold text-[#1E3A5F] mb-3">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObjectionCard({ objection, response }: { objection: string; response: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded mt-0.5 flex-shrink-0">OBJEÇÃO</span>
        <p className="text-sm font-medium text-slate-800 italic">"{objection}"</p>
      </div>
      <div className="flex items-start gap-3">
        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded mt-0.5 flex-shrink-0">RESPOSTA</span>
        <p className="text-sm text-slate-700 leading-relaxed">{response}</p>
      </div>
      <div className="mt-2 flex justify-end">
        <CopyButton text={`Objeção: "${objection}"\n\nResposta: ${response}`} />
      </div>
    </div>
  );
}

export default function CaptacaoPage() {
  const [tab, setTab] = useState<TabKey>('proposta');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Captação Comercial</h2>
        <p className="text-gray-600 mt-1">Material de vendas, scripts e estratégias para captação de clínicas</p>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? 'text-[#1E3A5F] border-[#1E3A5F]' : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== PROPOSTA DE VALOR ===== */}
      {tab === 'proposta' && (
        <div>
          <Section title="O que é a Anpexia">
            <div className="bg-gradient-to-r from-[#1E3A5F] to-[#2A5A8F] rounded-xl p-6 text-white mb-6">
              <h4 className="text-xl font-bold mb-2">A plataforma que automatiza sua clínica de ponta a ponta</h4>
              <p className="text-blue-100 leading-relaxed">
                A Anpexia é uma plataforma completa de gestão para clínicas médicas, estéticas e odontológicas. Agenda, prontuário com ditado por voz, financeiro, estoque inteligente com baixa automática, WhatsApp automatizado com IA — tudo em um único sistema. Seu paciente marca consulta pelo WhatsApp 24h por dia, recebe lembretes automáticos, o profissional dita a evolução sem digitar, e o convênio nunca fica sem cobrar.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <h4 className="font-semibold text-slate-800 mb-3">Pitch de Elevador (30 segundos)</h4>
              <p className="text-sm text-slate-700 italic leading-relaxed">
                "A Anpexia é um sistema completo pra clínica médica. O paciente marca consulta direto pelo WhatsApp, 24 horas por dia, sem precisar ligar. O sistema confirma automaticamente, manda lembrete 48h e 2h antes, e reduz faltas em até 40%. Além disso, tem prontuário digital, controle financeiro com repasse automático por médico, estoque com alerta de validade, e tudo integrado. Uma assinatura mensal, sem contrato de fidelidade. Posso mostrar uma demonstração rápida?"
              </p>
              <div className="mt-2 flex justify-end">
                <CopyButton text="A Anpexia é um sistema completo pra clínica médica. O paciente marca consulta direto pelo WhatsApp, 24 horas por dia, sem precisar ligar. O sistema confirma automaticamente, manda lembrete 48h e 2h antes, e reduz faltas em até 40%. Além disso, tem prontuário digital, controle financeiro com repasse automático por médico, estoque com alerta de validade, e tudo integrado. Uma assinatura mensal, sem contrato de fidelidade. Posso mostrar uma demonstração rápida?" />
              </div>
            </div>
          </Section>

          <Section title="Funcionalidades que vendem">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FeatureCard title="WhatsApp Automatizado com IA" items={[
                'Chatbot com inteligência artificial (Claude) atende 24h',
                'Paciente marca, confirma e remarca pelo WhatsApp',
                'Lembretes automáticos 48h e 2h antes da consulta',
                'Mensagens de aniversário, reativação e follow-up',
                'Botões interativos — paciente só clica, sem digitar',
                'Redução de faltas (no-show) em até 40%',
              ]} />
              <FeatureCard title="Agenda Inteligente" items={[
                'Horários por médico com dias da semana configuráveis',
                'Paciente escolhe especialidade, médico, dia e horário',
                'Convênio ou particular — fluxo separado',
                'Status visual: Agendado → Confirmado → Lembrete → Realizado',
                'Vinculação automática de paciente por telefone',
                'Histórico completo de consultas por paciente',
              ]} />
              <FeatureCard title="Prontuário Digital Completo" items={[
                'Dados clínicos, alergias, tipo sanguíneo, medicamentos',
                'Anamnese personalizada por especialidade',
                'Evolução clínica em formato SOAP',
                'Transcrição por voz — profissional dita e o sistema escreve',
                'Prescrições: medicamentos, exames, encaminhamentos',
                'Atestados com geração de PDF',
                'Assinatura digital do profissional',
              ]} />
              <FeatureCard title="Financeiro + Repasse Automático" items={[
                'Controle de receitas e despesas por categoria',
                'Repasse automático por médico (% por tipo de procedimento)',
                'Ao marcar consulta como realizada → lançamento automático',
                'Dashboard financeiro com gráficos e KPIs',
                'Separação convênio vs. particular',
                'Relatório de repasse por período',
              ]} />
              <FeatureCard title="Estoque Inteligente" items={[
                'Cadastro com lote, validade, fornecedor e margem',
                'Alerta de estoque baixo via WhatsApp pro dono',
                'Pedido de reposição automático quando estoque atinge mínimo',
                'Alerta de produtos próximos do vencimento',
                'Categorias personalizáveis',
                'Movimentações de entrada e saída com histórico',
                'Baixa automática ao realizar consulta (via template de materiais)',
              ]} />
              <FeatureCard title="Convênios + TUSS" items={[
                'Cadastro ilimitado de convênios aceitos',
                'Tabela TUSS com busca por código ou nome',
                'Materiais e medicamentos por procedimento TUSS',
                'Controle de procedimentos realizados — nunca esqueça de cobrar o convênio',
                'Exportação XML para cobrança (agiliza faturamento)',
                'Procedimentos particulares com tipo e valor',
                'Separação total entre convênio e particular',
              ]} />
              <FeatureCard title="Equipe e Permissões" items={[
                'Cargos: Admin, Gerente, Médico, Recepcionista, Financeiro, Estoque',
                'Cada cargo vê apenas o que precisa',
                'Autenticação em dois fatores (2FA)',
                'Audit log de todas as ações críticas',
                'Conformidade LGPD desde o início',
                'Multi-dispositivo com controle de sessões',
              ]} />
              <FeatureCard title="Mensagens Automatizadas" items={[
                'Confirmação de consulta automática',
                'Lembrete 48h e 2h antes',
                'Follow-up pós-consulta (2h depois)',
                'Lembrete de retorno (30 dias)',
                'Parabéns de aniversário',
                'Reativação de pacientes inativos (90 dias)',
              ]} />
              <FeatureCard title="Consulta + Estoque Integrados" items={[
                'Template de materiais por tipo de procedimento',
                'Ao realizar consulta, baixa automática do estoque',
                'Médico não precisa se preocupar com controle manual',
                'Histórico de materiais utilizados por consulta',
                'Redução de desperdício e controle de custo por atendimento',
                'Reposição automática quando estoque atinge mínimo',
              ]} />
              <FeatureCard title="Ditado por Voz" items={[
                'Médico dita a evolução pelo microfone durante a consulta',
                'Transcrição automática em tempo real no prontuário',
                'Elimina digitação — foco 100% no paciente',
                'Funciona para evolução SOAP, anamnese e anotações',
                'Economia de 5-10 minutos por atendimento',
                'Compatível com qualquer dispositivo com microfone',
              ]} />
            </div>
          </Section>

          <Section title="Diferenciais competitivos">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">24h</div>
                <p className="text-sm text-slate-600">Atendimento via WhatsApp com IA sem parar</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">-40%</div>
                <p className="text-sm text-slate-600">Redução de faltas com lembretes automáticos</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">100%</div>
                <p className="text-sm text-slate-600">Controle financeiro com repasse automático</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">0 min</div>
                <p className="text-sm text-slate-600">Digitando prontuário — médico dita por voz</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">Auto</div>
                <p className="text-sm text-slate-600">Baixa de estoque ao realizar consulta</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-[#1E3A5F] mb-1">R$ 0</div>
                <p className="text-sm text-slate-600">De procedimento esquecido — TUSS organizado</p>
              </div>
            </div>
          </Section>

          <Section title="Modelo comercial">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">Precificação</h4>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex items-start gap-2"><span className="font-bold text-[#1E3A5F]">Base:</span> R$ 1.200/mês (até 10 usuários)</li>
                    <li className="flex items-start gap-2"><span className="font-bold text-[#1E3A5F]">Adicional:</span> R$ 120/mês por usuário extra</li>
                    <li className="flex items-start gap-2"><span className="font-bold text-[#1E3A5F]">Exemplo:</span> 15 usuários = R$ 1.800/mês</li>
                    <li className="flex items-start gap-2"><span className="font-bold text-[#1E3A5F]">Implantação:</span> Inclusa (sem taxa de setup)</li>
                    <li className="flex items-start gap-2"><span className="font-bold text-[#1E3A5F]">Contrato:</span> Mensal, sem fidelidade</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">O que está incluso</h4>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li>✓ Todos os módulos (agenda, prontuário, financeiro, estoque, WhatsApp)</li>
                    <li>✓ Chatbot com IA 24h</li>
                    <li>✓ Ditado por voz no prontuário</li>
                    <li>✓ Baixa automática de estoque por consulta</li>
                    <li>✓ Organização TUSS com controle de faturamento</li>
                    <li>✓ Implantação e migração de dados</li>
                    <li>✓ Treinamento da equipe</li>
                    <li>✓ Suporte via WhatsApp</li>
                    <li>✓ Atualizações contínuas sem custo extra</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ===== SCRIPT SDR ===== */}
      {tab === 'sdr' && (
        <div>
          <Section title="Abordagem Inicial — Ligação/WhatsApp">
            <ScriptBlock
              title="Abertura (Fria — Clínica que não te conhece)"
              tag="Ligação"
              content={`Bom dia/boa tarde, [Nome]! Tudo bem?

Meu nome é [Seu Nome], sou da Anpexia. A gente trabalha com automação pra clínicas — agendamento pelo WhatsApp, lembretes automáticos, prontuário com ditado por voz, financeiro, estoque inteligente, tudo integrado.

Estou entrando em contato porque a gente ajuda clínicas como a de vocês a reduzir faltas de pacientes e automatizar a recepção. Vocês ainda agendam por telefone hoje?

[Se sim]: Entendo. Esse é exatamente o problema que a gente resolve. Com a Anpexia, o paciente marca pelo WhatsApp 24h, recebe lembrete automático, e a recepcionista não precisa ficar ligando pra confirmar. Além disso, o profissional dita a evolução pelo microfone sem precisar digitar, e o estoque dá baixa automática quando a consulta é realizada. Posso te mostrar em 15 minutos como funciona?

[Se já tem sistema]: Legal! E vocês estão satisfeitos? O sistema de vocês tem WhatsApp com IA integrado? Ditado por voz no prontuário? Baixa automática de estoque por consulta? Controle de TUSS pra não esquecer de cobrar convênio? Porque o nosso diferencial é exatamente isso — automação de ponta a ponta.`}
            />

            <ScriptBlock
              title="Abertura (Morna — Indicação/Conhecido)"
              tag="WhatsApp"
              content={`Fala, [Nome]! Tudo bem? Aqui é o [Seu Nome].

O [Quem indicou] me passou seu contato. Ele comentou que você tem uma clínica e eu queria te mostrar o que a gente faz na Anpexia.

A gente criou um sistema que automatiza a clínica de ponta a ponta — o paciente marca consulta pelo WhatsApp 24h, recebe lembrete automático, e a recepcionista não precisa ficar no telefone.

O profissional dita a evolução pelo microfone sem digitar, o estoque dá baixa automática quando a consulta é realizada, tem pedido de reposição automático, financeiro com repasse por profissional, e organização de TUSS pra não esquecer de cobrar convênio. Tudo num lugar só.

Posso te mandar um vídeo curto ou a gente marca 15 min pra eu te mostrar ao vivo?`}
            />

            <ScriptBlock
              title="Abordagem presencial (Rua / Congresso)"
              tag="Presencial"
              content={`Oi, tudo bem? Meu nome é [Seu Nome], sou da Anpexia. A gente trabalha com sistema de gestão pra clínicas médicas.

Você é médico / administra uma clínica?

[Se sim]: Legal! Deixa eu te fazer uma pergunta rápida: como vocês fazem o agendamento dos pacientes hoje? É por telefone ou já tem algum sistema?

[Ouvir a resposta e entrar com o pitch]:

A gente automatizou esse processo inteiro. O paciente manda um "oi" pro WhatsApp da clínica e uma assistente virtual com inteligência artificial cuida de tudo — marca a consulta, confirma, manda lembrete. Além disso, o profissional dita no microfone sem precisar digitar, o estoque dá baixa sozinho quando a consulta é realizada, e o sistema organiza os procedimentos TUSS pra não esquecer de cobrar convênio. Tudo integrado num sistema só.

Posso pegar seu contato pra te mandar um material? São 15 minutos de demonstração e você decide se faz sentido.`}
            />
          </Section>

          <Section title="Qualificação (BANT)">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-sm text-slate-600 mb-4">Use essas perguntas para qualificar o lead antes de passar pro closer:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-semibold text-[#1E3A5F] mb-2">Budget (Orçamento)</h5>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>"Vocês já investem em algum sistema hoje? Quanto pagam?"</li>
                    <li>"O investimento mensal de R$ 1.200 está dentro da realidade de vocês?"</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-[#1E3A5F] mb-2">Authority (Decisor)</h5>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>"Quem decide sobre a contratação de sistemas na clínica?"</li>
                    <li>"Você é o proprietário ou precisa alinhar com alguém?"</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-[#1E3A5F] mb-2">Need (Necessidade)</h5>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>"Quantos pacientes faltam por semana em média?"</li>
                    <li>"A recepção consegue atender todas as ligações?"</li>
                    <li>"Como vocês fazem o controle financeiro/repasse dos médicos?"</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-[#1E3A5F] mb-2">Timeline (Urgência)</h5>
                  <ul className="text-sm text-slate-700 space-y-1">
                    <li>"Vocês estão buscando uma solução agora ou só pesquisando?"</li>
                    <li>"Tem algum prazo pra tomar essa decisão?"</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Mensagens de Follow-up">
            <ScriptBlock
              title="Follow-up 1 — 24h depois do contato"
              tag="WhatsApp"
              content={`Oi, [Nome]! Aqui é o [Seu Nome] da Anpexia.

Conversei com você ontem sobre o sistema de gestão pra clínica. Queria saber se conseguiu dar uma olhada no material que mandei?

Se preferir, posso te mostrar ao vivo em 15 minutos — sem compromisso. Qual o melhor horário pra você essa semana?`}
            />
            <ScriptBlock
              title="Follow-up 2 — 3 dias sem resposta"
              tag="WhatsApp"
              content={`[Nome], tudo bem? Aqui é o [Seu Nome] da Anpexia.

Sei que a rotina de clínica é corrida, então vou ser direto: a gente ajuda clínicas a reduzir faltas em até 40% e automatizar o agendamento pelo WhatsApp.

Se não faz sentido agora, sem problemas. Mas se quiser ver uma demo rápida de 15 min, é só me falar. Abraço!`}
            />
            <ScriptBlock
              title="Follow-up 3 — Última tentativa"
              tag="WhatsApp"
              content={`Oi, [Nome]! Última mensagem, prometo rs

Só queria deixar registrado: a Anpexia automatiza agendamento por WhatsApp, manda lembretes, tem prontuário digital e financeiro integrado. Tudo por R$ 1.200/mês sem fidelidade.

Se um dia fizer sentido, meu contato está aqui. Sucesso na clínica! 🤝`}
            />
          </Section>
        </div>
      )}

      {/* ===== SCRIPT CLOSER ===== */}
      {tab === 'closer' && (
        <div>
          <Section title="Roteiro de Demonstração">
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
              <h4 className="font-semibold text-slate-800 mb-3">Estrutura da Demo (15-20 min)</h4>
              <div className="space-y-4">
                {[
                  { step: '1', time: '2 min', title: 'Conexão', desc: 'Agradecer o tempo, perguntar sobre a clínica, quantos médicos, quantos pacientes/dia, qual o maior desafio hoje.' },
                  { step: '2', time: '3 min', title: 'Dor', desc: 'Aprofundar na dor: "Quantos pacientes faltam por semana? Como é o processo de agendamento hoje? A recepcionista dá conta? Como controlam o financeiro de cada médico?" — Deixar o prospect falar.' },
                  { step: '3', time: '8 min', title: 'Demo', desc: 'Mostrar as funcionalidades focando nas dores que o prospect mencionou. Não mostre TUDO — mostre o que resolve O PROBLEMA DELE. Ordem sugerida: WhatsApp → Agenda → Prontuário → Financeiro → Dashboard.' },
                  { step: '4', time: '2 min', title: 'Preço', desc: 'Apresentar o preço DEPOIS de mostrar o valor. "Tudo isso, com implantação inclusa e sem fidelidade, é R$ 1.200/mês. Pra clínicas com mais de 10 usuários, cada adicional é R$ 120."' },
                  { step: '5', time: '3 min', title: 'Fechamento', desc: 'Perguntar diretamente: "Faz sentido pra vocês começarem agora? A implantação leva 2-3 dias úteis e a gente faz tudo pra vocês." Se hesitar, usar técnica de urgência ou objeção.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-[#1E3A5F] text-white rounded-full flex items-center justify-center text-sm font-bold">{s.step}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{s.title}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{s.time}</span>
                      </div>
                      <p className="text-sm text-slate-700">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Frases de Fechamento">
            <ScriptBlock
              title="Fechamento direto"
              content={`"[Nome], pelo que você me contou, a Anpexia resolve exatamente os 3 problemas que você mencionou: o agendamento manual, as faltas dos pacientes, e o controle de repasse. A implantação é rápida, em 2-3 dias vocês estão operando. Vamos começar?"`}
            />
            <ScriptBlock
              title="Fechamento por escassez"
              content={`"A gente faz a implantação personalizada pra cada clínica, então tem um limite de quantas a gente consegue implantar por mês. Esse mês ainda tenho [X] vagas. Se vocês fecharem agora, consigo começar a implantação já na semana que vem."`}
            />
            <ScriptBlock
              title="Fechamento por comparação"
              content={`"Faz uma conta comigo: se a clínica perde 5 pacientes por semana com falta, e cada consulta vale em média R$ 200, são R$ 4.000/mês perdidos. O sistema custa R$ 1.200 e reduz faltas em 40%. São R$ 1.600 a menos de prejuízo. O sistema se paga no primeiro mês."`}
            />
            <ScriptBlock
              title="Fechamento por facilidade"
              content={`"A melhor parte é que vocês não precisam se preocupar com nada técnico. A gente implanta, configura os médicos, horários, convênios, treina a equipe — vocês só começam a usar. Se não gostar, cancela no mês seguinte sem multa."`}
            />
          </Section>

          <Section title="O que mostrar na Demo (ordem de impacto)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é AGENDAMENTO</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Chatbot WhatsApp marcando consulta ao vivo</li>
                  <li>Calendário de agendamentos com cores por status</li>
                  <li>Lembretes automáticos (48h + 2h)</li>
                  <li>Paciente confirma pelo WhatsApp com 1 clique</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é FINANCEIRO</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Dashboard financeiro com gráficos</li>
                  <li>Repasse automático ao marcar como realizado</li>
                  <li>Configuração de % por tipo de procedimento</li>
                  <li>Separação convênio vs. particular</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é ORGANIZAÇÃO</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Prontuário digital com tudo em um lugar</li>
                  <li>Prescrições e atestados com PDF</li>
                  <li>Estoque com alerta de validade</li>
                  <li>Histórico completo do paciente</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é CONVÊNIO</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Tabela TUSS integrada com busca</li>
                  <li>Materiais/medicamentos por procedimento</li>
                  <li>Controle pra nunca esquecer de faturar</li>
                  <li>Exportação XML pra faturamento</li>
                  <li>Fluxo separado convênio vs. particular</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é TEMPO DO MÉDICO</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Ditado por voz — médico fala, sistema transcreve</li>
                  <li>Prontuário preenchido sem digitar</li>
                  <li>Baixa automática de estoque na consulta</li>
                  <li>Prescrições e atestados com 1 clique</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-slate-800 mb-2">Se a dor é ESTOQUE</h4>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal pl-4">
                  <li>Alerta automático de estoque baixo no WhatsApp</li>
                  <li>Pedido de reposição automático</li>
                  <li>Template de materiais por procedimento</li>
                  <li>Baixa automática ao realizar consulta</li>
                  <li>Controle de validade com alerta</li>
                </ol>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ===== OBJEÇÕES ===== */}
      {tab === 'objecoes' && (
        <div>
          <Section title="Preço">
            <ObjectionCard
              objection="Tá caro, pago menos no sistema que uso hoje"
              response="Entendo. Mas me diz: o sistema que você usa hoje manda lembrete automático pelo WhatsApp? Tem chatbot com IA que agenda 24h? Faz repasse automático por médico? Exporta XML de convênio? Porque se não faz, você está pagando menos mas perdendo dinheiro com faltas, com recepcionista ocupada, e com erro de repasse. A Anpexia não é um custo — é um investimento que se paga no primeiro mês."
            />
            <ObjectionCard
              objection="Não tenho orçamento pra isso agora"
              response="Faz sentido. Mas pensa comigo: quantos pacientes faltam por semana? Se forem 5 a R$ 200 cada, são R$ 4.000/mês de perda. Com os lembretes automáticos, você recupera pelo menos 40% disso. São R$ 1.600 a mais por mês, e o sistema custa R$ 1.200. Você não está gastando — está parando de perder dinheiro."
            />
            <ObjectionCard
              objection="Consigo fazer isso de graça com agenda do Google"
              response="Sim, o Google Agenda é bom pra compromissos pessoais. Mas ele não manda lembrete por WhatsApp pro paciente, não tem prontuário, não controla financeiro, não faz repasse por médico, e não tem chatbot. Você vai precisar de 5 ferramentas separadas pra fazer o que a Anpexia faz numa só. E o custo operacional de gerenciar tudo isso separado é maior que R$ 1.200."
            />
          </Section>

          <Section title="Timing">
            <ObjectionCard
              objection="Vou pensar / preciso avaliar"
              response="Claro, sem pressão. Mas só pra eu entender: o que falta pra tomar a decisão? É preço, funcionalidade, ou é questão de timing? Pergunto porque se for timing, a gente pode agendar a implantação pro mês que vem — você garante a vaga e só começa quando fizer sentido."
            />
            <ObjectionCard
              objection="Estou satisfeito com o sistema atual"
              response="Que bom! E o sistema de vocês tem agendamento pelo WhatsApp com IA? Porque 70% dos pacientes preferem mandar mensagem a ligar. Se a recepcionista da clínica não atende em 2 minutos, o paciente vai pra outra clínica. Com a Anpexia, ele agenda a qualquer hora, inclusive de madrugada e fim de semana."
            />
            <ObjectionCard
              objection="Acabei de trocar de sistema"
              response="Entendo. Nesse caso, posso te ligar daqui a 3 meses pra ver se o sistema atendeu? Enquanto isso, vou te mandar um material mostrando o que a Anpexia faz. Se em algum momento você sentir que falta algo, já sabe onde me achar."
            />
          </Section>

          <Section title="Confiança">
            <ObjectionCard
              objection="Nunca ouvi falar da Anpexia"
              response="Normal, a gente é novo no mercado. Mas diferente de sistemas legados que foram criados há 10 anos, a Anpexia nasceu com IA integrada, WhatsApp nativo e arquitetura moderna. Não é sistema antigo com remendo. E como não tem contrato de fidelidade, você testa sem risco — se não gostar, cancela no mês seguinte."
            />
            <ObjectionCard
              objection="Tenho medo de perder meus dados"
              response="Seus dados ficam em servidores seguros da Amazon (AWS) com backup automático e criptografia. A gente segue a LGPD desde o início — audit log de todas as ações, criptografia de dados sensíveis, autenticação em dois fatores. E se você quiser sair, exportamos todos os seus dados. Sem prender ninguém."
            />
            <ObjectionCard
              objection="Minha equipe não vai conseguir usar"
              response="A implantação inclui treinamento completo da equipe. O sistema foi desenhado pra ser simples — recepcionistas, médicos e financeiro aprendem em 1 dia. E qualquer dúvida, o suporte é pelo WhatsApp direto comigo."
            />
          </Section>

          <Section title="Funcionalidade">
            <ObjectionCard
              objection="Não tenho muitos pacientes pra justificar um sistema"
              response="Na verdade, é exatamente quando você precisa crescer que um sistema faz diferença. Com o chatbot atendendo 24h, você capta pacientes que hoje ligam e não são atendidos. E os lembretes automáticos garantem que quem marcou não falte. É uma máquina de crescimento."
            />
            <ObjectionCard
              objection="Preciso de uma funcionalidade que vocês não têm"
              response="Me conta qual. A gente tem atualizações toda semana e prioriza o que os clientes pedem. Se for algo que faz sentido, a gente desenvolve. E como não tem contrato de fidelidade, você não fica preso esperando — se não atender, cancela."
            />
          </Section>
        </div>
      )}

      {/* ===== CANAIS ===== */}
      {tab === 'canais' && (
        <div>
          <Section title="Facebook / Instagram Ads">
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
              <h4 className="font-semibold text-slate-800 mb-3">Estratégia</h4>
              <div className="space-y-3 text-sm text-slate-700">
                <p><strong>Público:</strong> Médicos, dentistas, fisioterapeutas, donos de clínica. Idade 28-55. Interesses: gestão de saúde, software médico, empreendedorismo médico.</p>
                <p><strong>Formato:</strong> Vídeo curto (30-60s) mostrando o WhatsApp marcando consulta sozinho. Carrossel com antes/depois (manual vs. automatizado). Depoimento de clínica cliente.</p>
                <p><strong>CTA:</strong> "Agende uma demonstração gratuita" → Landing page com formulário.</p>
                <p><strong>Orçamento sugerido:</strong> R$ 30-50/dia para começar. Otimizar por conversão (formulário preenchido).</p>
              </div>
            </div>
            <ScriptBlock
              title="Copy — Anúncio Facebook (Dor)"
              tag="Ads"
              content={`Sua clínica ainda agenda por telefone?

Enquanto sua recepcionista atende 1 ligação, 3 pacientes desistiram de esperar.

Com a Anpexia, o paciente marca consulta pelo WhatsApp 24h por dia — uma assistente virtual com IA cuida de tudo. Lembrete automático 48h e 2h antes. Faltas reduzidas em até 40%.

Prontuário digital, financeiro com repasse automático, estoque com alerta de validade. Tudo em um sistema.

R$ 1.200/mês. Sem fidelidade. Implantação inclusa.

👉 Agende uma demonstração gratuita`}
            />
            <ScriptBlock
              title="Copy — Anúncio Facebook (Benefício)"
              tag="Ads"
              content={`Imagina sua clínica assim:

✅ Paciente marca consulta pelo WhatsApp a qualquer hora
✅ Lembrete automático — sem a recepcionista ligar pra confirmar
✅ Prontuário digital completo com assinatura do médico
✅ Financeiro com repasse automático por médico
✅ Estoque com alerta de validade via WhatsApp

Isso é a Anpexia. Um sistema completo pra sua clínica.

Sem contrato. Sem fidelidade. Sem complicação.

👉 Veja uma demonstração ao vivo`}
            />
            <ScriptBlock
              title="Copy — Anúncio Facebook (Ditado por Voz)"
              tag="Ads"
              content={`Médico, quanto tempo você perde digitando no prontuário?

Com a Anpexia, você DITA a evolução do paciente pelo microfone enquanto atende. O sistema transcreve tudo automaticamente no prontuário.

🎙️ Ditado por voz em tempo real
📋 Prontuário preenchido sem digitar
⏱️ 5-10 minutos a menos por consulta
👨‍⚕️ Foco 100% no paciente, não no teclado

Ainda tem: agendamento por WhatsApp com IA, lembretes automáticos, financeiro com repasse, estoque inteligente e muito mais.

R$ 1.200/mês. Sem fidelidade. Implantação inclusa.

👉 Agende uma demonstração gratuita`}
            />
            <ScriptBlock
              title="Copy — Anúncio Facebook (Estoque Inteligente)"
              tag="Ads"
              content={`Sua clínica já perdeu material por vencimento?
Já faltou insumo no meio de um procedimento?

Com a Anpexia, o estoque da sua clínica funciona no automático:

📦 Alerta de estoque baixo direto no WhatsApp do dono
🔄 Pedido de reposição automático ao atingir o mínimo
🏥 Ao realizar a consulta, os materiais usados já dão baixa sozinhos
📊 Template de materiais por tipo de procedimento

Chega de planilha. Chega de controle manual. Chega de prejuízo.

R$ 1.200/mês. Sem fidelidade. Sem taxa de implantação.

👉 Veja como funciona ao vivo`}
            />
            <ScriptBlock
              title="Copy — Anúncio Facebook (Convênio + TUSS)"
              tag="Ads"
              content={`Quantos procedimentos sua clínica deixou de cobrar do convênio esse mês?

A maioria das clínicas perde dinheiro por esquecer de faturar procedimentos realizados. Com a Anpexia, isso acaba:

💰 Todo procedimento realizado fica registrado com código TUSS
📋 O sistema organiza tudo pra você não esquecer de cobrar
📤 Exportação XML pronta pro convênio
🔍 Tabela TUSS completa com busca por código ou nome

Pare de deixar dinheiro na mesa. Cada procedimento esquecido é receita perdida.

R$ 1.200/mês. Sem fidelidade. Implantação inclusa.

👉 Agende uma demonstração gratuita`}
            />
            <ScriptBlock
              title="Copy — Anúncio Facebook (Automação Total)"
              tag="Ads"
              content={`E se sua clínica funcionasse quase sozinha?

Com a Anpexia, é possível:

🤖 Paciente agenda pelo WhatsApp 24h — sem ligar
🎙️ Médico dita no microfone — prontuário preenchido automaticamente
📦 Estoque dá baixa sozinho quando a consulta é realizada
💰 Repasse de médicos calculado automaticamente
🔔 Lembrete de consulta, aniversário e reativação no piloto automático
📋 Procedimentos TUSS organizados pra não perder faturamento de convênio

Tudo em um único sistema. Tudo automatizado.

R$ 1.200/mês. Sem fidelidade. Implantação inclusa. Treinamento da equipe por nossa conta.

👉 Quero ver a demonstração`}
            />
          </Section>

          <Section title="Google Ads">
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
              <h4 className="font-semibold text-slate-800 mb-3">Estratégia</h4>
              <div className="space-y-3 text-sm text-slate-700">
                <p><strong>Campanha Search:</strong> Palavras-chave de intenção: "sistema para clínica médica", "agendamento online clínica", "software gestão clínica", "prontuário eletrônico", "sistema WhatsApp clínica".</p>
                <p><strong>Campanha Display:</strong> Remarketing para quem visitou a landing page e não converteu.</p>
                <p><strong>Landing page:</strong> anpexia.com.br com formulário simples (nome, telefone, nome da clínica).</p>
                <p><strong>Orçamento sugerido:</strong> R$ 30-50/dia. CPC médio estimado: R$ 3-8 para termos de gestão de clínica.</p>
              </div>
            </div>
          </Section>

          <Section title="Captação Presencial">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-[#1E3A5F] mb-3">Visita a Clínicas (Porta a Porta)</h4>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-4">
                  <li>Mapear clínicas no Google Maps por região</li>
                  <li>Priorizar clínicas sem site ou com agendamento por telefone</li>
                  <li>Visitar pessoalmente com cartão de visita</li>
                  <li>Pedir pra falar com o dono/administrador</li>
                  <li>Pitch de 30 segundos + deixar material</li>
                  <li>Pegar WhatsApp e agendar demo remota</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-[#1E3A5F] mb-3">Congressos e Eventos Médicos</h4>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-4">
                  <li>Identificar congressos da região (CRM, CRO, congressos de estética, etc.)</li>
                  <li>Montar stand simples com notebook + demo ao vivo</li>
                  <li>QR code pra landing page no banner</li>
                  <li>Coletar leads com formulário rápido (nome + WhatsApp)</li>
                  <li>Follow-up no dia seguinte via WhatsApp</li>
                  <li>Oferecer "condição de evento" (1º mês com desconto)</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-[#1E3A5F] mb-3">Indicações (Amigos e Familiares)</h4>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-4">
                  <li>Listar todos os conhecidos que são médicos ou conhecem médicos</li>
                  <li>Mandar mensagem pessoal (não é spam — é apresentação)</li>
                  <li>Oferecer programa de indicação: R$ 200 por clínica que fechar</li>
                  <li>Pedir que compartilhem o vídeo de demo</li>
                  <li>Manter relacionamento mesmo se não fechar agora</li>
                </ol>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h4 className="font-semibold text-[#1E3A5F] mb-3">Parcerias Estratégicas</h4>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-4">
                  <li>Contadores que atendem clínicas (acesso a vários donos)</li>
                  <li>Representantes de equipamentos médicos</li>
                  <li>Empresas de marketing para clínicas</li>
                  <li>Associações médicas locais</li>
                  <li>Oferecer comissão ou parceria formal</li>
                </ol>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ===== MATERIAIS ===== */}
      {tab === 'materiais' && (
        <div>
          <Section title="Mensagens Prontas para WhatsApp">
            <ScriptBlock
              title="Mensagem de apresentação (contato frio)"
              tag="Copiar e enviar"
              content={`Oi! Meu nome é [Seu Nome] e trabalho na Anpexia, uma plataforma de gestão para clínicas médicas.

A gente automatiza o agendamento pelo WhatsApp com inteligência artificial — o paciente marca consulta sozinho, 24h por dia, e recebe lembrete automático.

Além disso, o sistema tem prontuário digital, financeiro com repasse por médico, estoque com alerta de validade, e muito mais.

Posso te mostrar como funciona em 15 minutos? Sem compromisso.`}
            />
            <ScriptBlock
              title="Mensagem pós-demo (não fechou)"
              tag="Copiar e enviar"
              content={`[Nome], obrigado pelo tempo hoje! Foi ótimo conhecer a [Nome da Clínica].

Recapitulando o que conversamos:
✅ Agendamento por WhatsApp com IA 24h
✅ Lembretes automáticos que reduzem faltas em até 40%
✅ Prontuário digital + financeiro com repasse automático
✅ R$ 1.200/mês, sem fidelidade, implantação inclusa

Se tiver qualquer dúvida, estou aqui. Quando quiser começar, a implantação leva 2-3 dias úteis.`}
            />
            <ScriptBlock
              title="Mensagem para indicação"
              tag="Copiar e enviar"
              content={`[Nome], tudo bem? Preciso de uma ajuda sua.

Estou trabalhando num sistema de gestão pra clínicas médicas (Anpexia) e queria saber: você conhece algum médico ou dono de clínica que eu possa apresentar?

O sistema agenda pelo WhatsApp com IA, manda lembrete pro paciente, tem prontuário, financeiro, estoque... Tudo num lugar só.

Se tiver alguém pra me apresentar, fico muito grato! E se a pessoa fechar, tenho uma bonificação pra você também. 🤝`}
            />
          </Section>

          <Section title="Checklist do SDR">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="space-y-3">
                {[
                  'Pesquisar a clínica antes de ligar (Google, Instagram, site)',
                  'Verificar se tem site com agendamento online (se não tem = oportunidade)',
                  'Preparar pitch de 30 segundos',
                  'Ligar/mandar mensagem e registrar no CRM',
                  'Qualificar com BANT (Budget, Authority, Need, Timeline)',
                  'Se qualificado: agendar demo com o closer',
                  'Se não qualificado: registrar motivo e agendar follow-up futuro',
                  'Mover lead no Kanban do CRM conforme avança',
                  'Follow-up 24h, 3 dias, 7 dias se não responder',
                  'Registrar todas as interações como atividade no CRM',
                ].map((item, i) => (
                  <label key={i} className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Checklist do Closer">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="space-y-3">
                {[
                  'Revisar informações do lead no CRM antes da demo',
                  'Preparar demo focada nas dores específicas do lead',
                  'Abrir com perguntas — deixar o prospect falar primeiro',
                  'Mostrar funcionalidades na ordem de impacto (WhatsApp → Agenda → Financeiro)',
                  'Apresentar preço DEPOIS de demonstrar valor',
                  'Usar técnica de comparação (custo das faltas vs. preço do sistema)',
                  'Perguntar diretamente: "Vamos começar?"',
                  'Se objeção: usar respostas da aba Objeções',
                  'Se não fechar: mover pra Follow-up no CRM com data de retorno',
                  'Enviar resumo pós-demo via WhatsApp',
                ].map((item, i) => (
                  <label key={i} className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Números que convencem">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { stat: '70%', desc: 'dos pacientes preferem WhatsApp a ligação' },
                { stat: '40%', desc: 'de redução de faltas com lembretes automáticos' },
                { stat: '24h', desc: 'de disponibilidade com chatbot IA' },
                { stat: '3 dias', desc: 'para implantação completa' },
                { stat: 'R$ 0', desc: 'de taxa de implantação' },
                { stat: '0', desc: 'meses de fidelidade' },
                { stat: '10+', desc: 'módulos integrados num só sistema' },
                { stat: '9', desc: 'automações rodando 24h (lembretes, aniversário, reativação)' },
                { stat: '5-10 min', desc: 'economizados por consulta com ditado por voz' },
                { stat: 'Auto', desc: 'baixa de estoque ao realizar consulta' },
                { stat: '100%', desc: 'dos procedimentos TUSS rastreados pra faturamento' },
                { stat: '0', desc: 'procedimentos esquecidos de cobrar do convênio' },
              ].map((item, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[#1E3A5F]">{item.stat}</div>
                  <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
