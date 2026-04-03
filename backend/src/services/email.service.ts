import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.resendApiKey);

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const { data, error } = await resend.emails.send({
    from: env.emailFrom,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    console.error('[EMAIL] Resend error:', error);
    throw new Error(`Falha ao enviar email: ${error.message}`);
  }

  console.log(`[EMAIL] Sent to ${options.to} | ID: ${data?.id}`);
  return { id: data?.id || '' };
}

interface LowStockProduct {
  name: string;
  currentStock: number;
  minStock: number;
  unit: string;
}

export async function sendLowStockAlert(
  supplierEmail: string,
  supplierName: string,
  businessName: string,
  products: LowStockProduct[],
): Promise<{ id: string }> {
  const rows = products
    .map(
      (p) =>
        `<tr>
          <td style="padding:8px;border:1px solid #ddd">${p.name}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.currentStock} ${p.unit}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.minStock} ${p.unit}</td>
        </tr>`,
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#e53e3e">Alerta de Estoque Baixo - ${businessName}</h2>
      <p>Olá ${supplierName},</p>
      <p>Os seguintes produtos estão com estoque abaixo do mínimo:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Produto</th>
            <th style="padding:8px;border:1px solid #ddd">Estoque Atual</th>
            <th style="padding:8px;border:1px solid #ddd">Estoque Mínimo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Poderia nos informar disponibilidade e prazo de entrega?</p>
      <p>Obrigado!<br/>${businessName}</p>
    </div>
  `;

  return sendEmail({
    to: supplierEmail,
    subject: `Alerta de Estoque Baixo - ${businessName}`,
    html,
  });
}

interface PurchaseOrderProduct {
  productName: string;
  currentStock: number;
  minStock: number;
  quantity: number;
  unit: string;
}

export async function sendPurchaseOrder(
  supplierEmail: string,
  supplierName: string,
  businessName: string,
  products: PurchaseOrderProduct[],
  message?: string,
): Promise<{ id: string }> {
  const rows = products
    .map(
      (p) =>
        `<tr>
          <td style="padding:8px;border:1px solid #ddd">${p.productName}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.currentStock} ${p.unit}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.minStock} ${p.unit}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.quantity} ${p.unit}</td>
        </tr>`,
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#333">Pedido de Reposição - ${businessName}</h2>
      <p>Olá ${supplierName},</p>
      <p>Precisamos repor os seguintes itens:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Produto</th>
            <th style="padding:8px;border:1px solid #ddd">Estoque Atual</th>
            <th style="padding:8px;border:1px solid #ddd">Estoque Mínimo</th>
            <th style="padding:8px;border:1px solid #ddd">Quantidade Solicitada</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${message ? `<p><strong>Observações:</strong> ${message}</p>` : ''}
      <p>Poderia nos informar prazo e disponibilidade?</p>
      <p>Obrigado!<br/>${businessName}</p>
    </div>
  `;

  return sendEmail({
    to: supplierEmail,
    subject: `Pedido de Reposição - ${businessName}`,
    html,
  });
}
