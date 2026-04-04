import PDFDocument from 'pdfkit';
import prisma from '../config/database';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawHeader(doc: PDFKit.PDFDocument, tenant: { name: string; address?: string | null; phone?: string | null }) {
  doc.fontSize(16).font('Helvetica-Bold').text(tenant.name, { align: 'center' });
  doc.moveDown(0.3);

  doc.fontSize(10).font('Helvetica');
  if (tenant.address) {
    doc.text(tenant.address, { align: 'center' });
  }
  if (tenant.phone) {
    doc.text(`Tel: ${tenant.phone}`, { align: 'center' });
  }

  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(1);
}

function drawSignature(
  doc: PDFKit.PDFDocument,
  doctorName: string,
  signatureImage?: string | null,
) {
  doc.moveDown(2);

  if (signatureImage) {
    try {
      const imgBuffer = Buffer.from(signatureImage, 'base64');
      const x = (doc.page.width - 150) / 2;
      doc.image(imgBuffer, x, doc.y, { width: 150 });
      doc.moveDown(1);
    } catch {
      // If image fails, fall back to blank line
      doc.moveDown(2);
      const lineY = doc.y;
      const center = doc.page.width / 2;
      doc.moveTo(center - 100, lineY).lineTo(center + 100, lineY).stroke();
      doc.moveDown(0.5);
    }
  } else {
    doc.moveDown(2);
    const lineY = doc.y;
    const center = doc.page.width / 2;
    doc.moveTo(center - 100, lineY).lineTo(center + 100, lineY).stroke();
    doc.moveDown(0.5);
  }

  doc.fontSize(12).font('Helvetica-Bold').text(doctorName, { align: 'center' });
}

export async function generateCertificatePdf(tenantId: string, certificateId: string): Promise<Buffer> {
  const certificate = await prisma.medicalCertificate.findFirstOrThrow({
    where: { id: certificateId, tenantId },
    include: { patient: true },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const doctorSignature = await prisma.doctorSignature.findUnique({
    where: { tenantId_doctorId: { tenantId, doctorId: certificate.doctorId } },
  });

  const doctor = await prisma.user.findUniqueOrThrow({ where: { id: certificate.doctorId } });

  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  const bufferPromise = collectPdfBuffer(doc);

  // Header
  drawHeader(doc, tenant);

  // Title
  const title = certificate.type === 'ATESTADO' ? 'ATESTADO MÉDICO' : 'DECLARAÇÃO';
  doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(1.5);

  // Body
  doc.fontSize(12).font('Helvetica');

  const patientName = certificate.patient.name;
  const cpf = certificate.patient.cpfCnpj ? `, CPF ${certificate.patient.cpfCnpj}` : '';

  doc.text(
    `Atesto para os devidos fins que o(a) paciente ${patientName}${cpf}, ` +
    `esteve sob cuidados médicos pelo seguinte motivo:`,
    { lineGap: 4 },
  );
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Motivo: ', { continued: true });
  doc.font('Helvetica').text(certificate.reason);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Período: ', { continued: true });
  doc.font('Helvetica').text(
    `${formatShortDate(certificate.startDate)} a ${formatShortDate(certificate.endDate)}`,
  );

  if (certificate.daysOff != null) {
    doc.font('Helvetica-Bold').text('Dias de afastamento: ', { continued: true });
    doc.font('Helvetica').text(`${certificate.daysOff} dia(s)`);
  }

  if (certificate.observations) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Observações: ', { continued: true });
    doc.font('Helvetica').text(certificate.observations);
  }

  doc.moveDown(1.5);
  doc.fontSize(12).font('Helvetica').text(
    `${tenant.address ? tenant.address.split(',')[0] : ''}, ${formatDate(new Date())}`,
    { align: 'center' },
  );

  // Signature
  drawSignature(doc, doctor.name, doctorSignature?.signatureImage);

  doc.end();
  return bufferPromise;
}

export async function generatePrescriptionPdf(tenantId: string, prescriptionId: string): Promise<Buffer> {
  const prescription = await prisma.prescription.findFirstOrThrow({
    where: { id: prescriptionId, tenantId },
    include: { patient: true },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const doctorSignature = await prisma.doctorSignature.findUnique({
    where: { tenantId_doctorId: { tenantId, doctorId: prescription.doctorId } },
  });

  const doctor = await prisma.user.findUniqueOrThrow({ where: { id: prescription.doctorId } });

  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  const bufferPromise = collectPdfBuffer(doc);

  // Header
  drawHeader(doc, tenant);

  // Patient info
  doc.fontSize(12).font('Helvetica-Bold').text('Paciente: ', { continued: true });
  doc.font('Helvetica').text(prescription.patient.name);
  doc.moveDown(0.5);

  const data = prescription.data as Record<string, any>;

  switch (prescription.type) {
    case 'MEDICAMENTO':
      renderMedicamento(doc, data);
      break;
    case 'EXAME_EXTERNO':
      renderExameExterno(doc, data);
      break;
    case 'OCULOS':
      renderOculos(doc, data);
      break;
    case 'EXAME_INTERNO':
      renderExameInterno(doc, data);
      break;
  }

  // Date
  doc.moveDown(1.5);
  doc.fontSize(12).font('Helvetica').text(
    `${tenant.address ? tenant.address.split(',')[0] : ''}, ${formatDate(new Date())}`,
    { align: 'center' },
  );

  // Signature
  drawSignature(doc, doctor.name, doctorSignature?.signatureImage);

  doc.end();
  return bufferPromise;
}

function renderMedicamento(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  doc.fontSize(16).font('Helvetica-Bold').text('RECEITUÁRIO', { align: 'center' });
  doc.moveDown(1);

  const medications = data.medications as any[] || [];
  medications.forEach((med: any, index: number) => {
    doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${med.name}`);
    doc.font('Helvetica');
    if (med.dosage) doc.text(`   Dosagem: ${med.dosage}`);
    if (med.posologia) doc.text(`   Posologia: ${med.posologia}`);
    if (med.duration) doc.text(`   Duração: ${med.duration}`);
    if (med.via) doc.text(`   Via: ${med.via}`);
    doc.moveDown(0.5);
  });
}

function renderExameExterno(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  doc.fontSize(16).font('Helvetica-Bold').text('SOLICITAÇÃO DE EXAMES', { align: 'center' });
  doc.moveDown(1);

  const exams = data.exams as any[] || [];
  exams.forEach((exam: any, index: number) => {
    doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${exam.name}`);
    doc.font('Helvetica');
    if (exam.specialty) doc.text(`   Especialidade: ${exam.specialty}`);
    if (exam.indication) doc.text(`   Indicação: ${exam.indication}`);
    if (exam.urgency) doc.text(`   Urgência: ${exam.urgency}`);
    doc.moveDown(0.5);
  });
}

function renderOculos(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  doc.fontSize(16).font('Helvetica-Bold').text('RECEITA DE ÓCULOS', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica');

  const renderEye = (label: string, eye: any) => {
    if (!eye) return;
    doc.font('Helvetica-Bold').text(label);
    doc.font('Helvetica');
    const parts: string[] = [];
    if (eye.esferico != null) parts.push(`Esférico: ${eye.esferico}`);
    if (eye.cilindrico != null) parts.push(`Cilíndrico: ${eye.cilindrico}`);
    if (eye.eixo != null) parts.push(`Eixo: ${eye.eixo}°`);
    if (eye.adicao != null) parts.push(`Adição: ${eye.adicao}`);
    if (eye.dnp != null) parts.push(`DNP: ${eye.dnp}mm`);
    doc.text(`   ${parts.join('  |  ')}`);
    doc.moveDown(0.5);
  };

  renderEye('OD (Olho Direito):', data.od);
  renderEye('OE (Olho Esquerdo):', data.oe);

  if (data.lensType) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Tipo de lente: ', { continued: true });
    doc.font('Helvetica').text(data.lensType);
  }
}

function renderExameInterno(doc: PDFKit.PDFDocument, data: Record<string, any>) {
  doc.fontSize(16).font('Helvetica-Bold').text('EXAMES INTERNOS', { align: 'center' });
  doc.moveDown(1);

  const exams = data.exams as any[] || [];
  exams.forEach((exam: any, index: number) => {
    doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${exam.name}`);
    doc.font('Helvetica');
    if (exam.indication) doc.text(`   Indicação: ${exam.indication}`);
    if (exam.urgency) doc.text(`   Urgência: ${exam.urgency}`);
    doc.moveDown(0.5);
  });
}
