import cron from 'node-cron';
import prisma from '../config/database';
import { evolutionApi } from '../modules/messaging/evolution.client';
import { env } from '../config/env';
import { sendReminder48h, sendReminder2h, sendPostConsultation } from '../modules/scheduling/scheduling.notifications';

const TAG = '[CRON]';

function isWhatsAppConfigured(): boolean {
  return !!(env.evolutionApiUrl && env.evolutionApiKey && !env.evolutionApiUrl.includes('localhost'));
}

async function getOwnerPhone(tenantId: string): Promise<string | null> {
  const owner = await prisma.user.findFirst({
    where: { tenantId, role: 'OWNER', isActive: true, phone: { not: null } },
    select: { phone: true },
  });
  return owner?.phone ?? null;
}

async function getTenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name || 'Sua empresa';
}

// ============================================================
// JOB 1: Process scheduled messages (every 1 minute)
// ============================================================
async function processScheduledMessages() {
  if (!isWhatsAppConfigured()) return;

  try {
    const pendingMessages = await prisma.leadMessage.findMany({
      where: { status: 'scheduled' },
      include: { lead: true },
      take: 20,
    });

    for (const msg of pendingMessages) {
      try {
        await evolutionApi.sendText('anpexia', msg.lead.phone, msg.body);
        await prisma.leadMessage.update({
          where: { id: msg.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        console.log(`${TAG} Sent scheduled message ${msg.id} to ${msg.lead.phone}`);
      } catch (err) {
        await prisma.leadMessage.update({
          where: { id: msg.id },
          data: { status: 'failed' },
        });
        console.error(`${TAG} Failed to send message ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} processScheduledMessages error:`, err);
  }
}

// ============================================================
// JOB 2: Process pending tenant messages (every 1 minute)
// ============================================================
async function processPendingTenantMessages() {
  if (!isWhatsAppConfigured()) return;

  try {
    const pending = await prisma.messageSent.findMany({
      where: { status: 'PENDING' },
      take: 20,
    });

    for (const msg of pending) {
      try {
        await evolutionApi.sendTextByTenant(msg.tenantId, msg.phone, msg.body);
        await prisma.messageSent.update({
          where: { id: msg.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        console.log(`${TAG} Sent tenant message ${msg.id} to ${msg.phone}`);
      } catch (err) {
        await prisma.messageSent.update({
          where: { id: msg.id },
          data: { status: 'FAILED', error: (err as Error).message },
        });
        console.error(`${TAG} Failed tenant message ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} processPendingTenantMessages error:`, err);
  }
}

// ============================================================
// JOB 3: Appointment reminders — 48h and 2h (every 30 min)
// Now with interactive buttons
// ============================================================
async function sendAppointmentReminders() {
  try {
    const now = new Date();

    // --- 48h reminder (confirmation) ---
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in48hEnd = new Date(in48h.getTime() + 60 * 60 * 1000);

    const upcomingIn48h = await prisma.scheduledCall.findMany({
      where: {
        date: { gte: in48h, lt: in48hEnd },
        status: { in: ['scheduled', 'confirmed'] },
        confirmationSentAt: null, // Only send once
      },
    });

    for (const call of upcomingIn48h) {
      await sendReminder48h({
        id: call.id,
        name: call.name,
        phone: call.phone,
        date: call.date,
        leadId: call.leadId,
      });
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: { confirmationSentAt: now },
      });
    }

    // --- 2h reminder ---
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in2hEnd = new Date(in2h.getTime() + 30 * 60 * 1000);

    const upcomingIn2h = await prisma.scheduledCall.findMany({
      where: {
        date: { gte: in2h, lt: in2hEnd },
        status: { in: ['scheduled', 'confirmed'] },
        reminderSentAt: null, // Only send once
      },
    });

    for (const call of upcomingIn2h) {
      await sendReminder2h({
        id: call.id,
        name: call.name,
        phone: call.phone,
        date: call.date,
        leadId: call.leadId,
      });
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: { reminderSentAt: now },
      });
    }

    if (upcomingIn48h.length > 0 || upcomingIn2h.length > 0) {
      console.log(`${TAG} Appointment reminders: ${upcomingIn48h.length} (48h) + ${upcomingIn2h.length} (2h)`);
    }
  } catch (err) {
    console.error(`${TAG} sendAppointmentReminders error:`, err);
  }
}

// ============================================================
// JOB 4: Post-consultation follow-up (every 30 min)
// 2h after completed appointments
// ============================================================
async function sendPostConsultationFollowUp() {
  if (!isWhatsAppConfigured()) return;

  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twoAndHalfHoursAgo = new Date(now.getTime() - 2.5 * 60 * 60 * 1000);

    // Find appointments that ended ~2h ago (30min window)
    const completedCalls = await prisma.scheduledCall.findMany({
      where: {
        date: { gte: twoAndHalfHoursAgo, lt: twoHoursAgo },
        status: 'completed',
      },
    });

    for (const call of completedCalls) {
      // Check if we already sent post-consultation for this call
      if (call.leadId) {
        const alreadySent = await prisma.leadActivity.findFirst({
          where: {
            leadId: call.leadId,
            metadata: { path: ['reminderType'], equals: 'POST_CONSULTATION' },
          },
        });
        if (alreadySent) continue;
      }

      await sendPostConsultation({
        id: call.id,
        name: call.name,
        phone: call.phone,
        leadId: call.leadId,
      });
    }

    if (completedCalls.length > 0) {
      console.log(`${TAG} Post-consultation: ${completedCalls.length} follow-ups sent`);
    }
  } catch (err) {
    console.error(`${TAG} sendPostConsultationFollowUp error:`, err);
  }
}

// ============================================================
// JOB 5: Low stock alerts (daily at 8:00 AM)
// Sends WhatsApp with buttons to OWNER
// ============================================================
async function sendLowStockAlerts() {
  try {
    const lowStockProducts = await prisma.$queryRaw<Array<{
      tenant_id: string;
      product_id: string;
      product_name: string;
      quantity: number;
      min_quantity: number;
      unit: string;
      tenant_name: string;
    }>>`
      SELECT p.tenant_id, p.id as product_id, p.name as product_name, p.quantity, p.min_quantity,
             p.unit, t.name as tenant_name
      FROM products p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.quantity <= p.min_quantity
        AND p.min_quantity > 0
        AND p.is_active = true
        AND t.is_active = true
      ORDER BY p.tenant_id, p.quantity ASC
    `;

    if (lowStockProducts.length === 0) return;

    const byTenant = new Map<string, typeof lowStockProducts>();
    for (const p of lowStockProducts) {
      const list = byTenant.get(p.tenant_id) || [];
      list.push(p);
      byTenant.set(p.tenant_id, list);
    }

    for (const [tenantId, products] of byTenant) {
      const first = products[0];
      const ownerPhone = await getOwnerPhone(tenantId);

      // --- Auto-create purchase orders for linked suppliers ---
      try {
        await createSupplierOrders(tenantId, first.tenant_name, products);
      } catch (err) {
        console.error(`${TAG} Failed to create supplier orders for ${tenantId}:`, err);
      }

      if (!ownerPhone) continue;

      const productList = products.slice(0, 5).map(p =>
        `• ${p.product_name}: ${p.quantity} unidades (minimo: ${p.min_quantity})`
      ).join('\n');

      // Check if there are pending orders to mention
      const pendingOrderCount = await prisma.purchaseOrder.count({
        where: { tenantId, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
      });

      const pendingNote = pendingOrderCount > 0
        ? `\n\n📋 Voce tem ${pendingOrderCount} pedido(s) de reposicao pendente(s). Acesse Fornecedores > Pedidos para aprovar.`
        : '';

      const body = `Os seguintes produtos estao com estoque baixo:\n\n${productList}` +
        (products.length > 5 ? `\n... e mais ${products.length - 5}` : '') +
        `\n\nAcesse o sistema para fazer o pedido ao fornecedor.` +
        pendingNote;

      if (isWhatsAppConfigured()) {
        try {
          const instanceName = await evolutionApi.getInstanceName(tenantId);
          if (instanceName) {
            await evolutionApi.sendButtons(instanceName, ownerPhone, body, [
              { id: 'btn_open_stock', text: 'Abrir estoque' },
            ], `⚠️ Alerta de Estoque - ${first.tenant_name}`);
          }
        } catch (err) {
          // Fallback to text
          try {
            await evolutionApi.sendTextByTenant(tenantId, ownerPhone,
              `⚠️ Alerta de Estoque - ${first.tenant_name}\n\n${body}`);
          } catch {}
          console.error(`${TAG} Failed to send low stock alert to ${tenantId}:`, err);
        }
      }

      console.log(`${TAG} Low stock alert for ${first.tenant_name}: ${products.length} products`);
    }
  } catch (err) {
    console.error(`${TAG} sendLowStockAlerts error:`, err);
  }
}

// Helper: create purchase orders for suppliers linked to low-stock products
async function createSupplierOrders(
  tenantId: string,
  tenantName: string,
  lowStockProducts: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    min_quantity: number;
    unit: string;
  }>,
) {
  // Find all supplier-product links for these products (primary first)
  const productIds = lowStockProducts.map((p) => p.product_id);

  const supplierLinks = await prisma.supplierProduct.findMany({
    where: { tenantId, productId: { in: productIds } },
    include: { supplier: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  if (supplierLinks.length === 0) return;

  // Group products by supplier (prefer primary supplier)
  const productToSupplier = new Map<string, string>(); // productId -> supplierId
  for (const link of supplierLinks) {
    if (!link.supplier.isActive) continue;
    // Only assign if not already assigned (primary comes first due to ordering)
    if (!productToSupplier.has(link.productId)) {
      productToSupplier.set(link.productId, link.supplierId);
    }
  }

  // Group by supplier
  const supplierProducts = new Map<string, typeof lowStockProducts>();
  for (const product of lowStockProducts) {
    const supplierId = productToSupplier.get(product.product_id);
    if (!supplierId) continue;
    const list = supplierProducts.get(supplierId) || [];
    list.push(product);
    supplierProducts.set(supplierId, list);
  }

  for (const [supplierId, products] of supplierProducts) {
    // Check for existing pending/sent order for this supplier with overlapping products
    const existingOrder = await prisma.purchaseOrder.findFirst({
      where: {
        tenantId,
        supplierId,
        status: { in: ['PENDING_APPROVAL', 'SENT', 'APPROVED'] },
      },
    });
    if (existingOrder) {
      console.log(`${TAG} Skipping order for supplier ${supplierId} — existing order ${existingOrder.id} (${existingOrder.status})`);
      continue;
    }

    const supplier = supplierLinks.find((l) => l.supplierId === supplierId)?.supplier;
    if (!supplier) continue;

    const items = products.map((p) => ({
      productId: p.product_id,
      productName: p.product_name,
      quantity: p.min_quantity - p.quantity, // How much to order
      currentStock: p.quantity,
      minStock: p.min_quantity,
      unit: p.unit || 'un',
    }));

    const status = supplier.autoDispatch ? 'APPROVED' : 'PENDING_APPROVAL';

    const order = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId,
        status,
        items: items as any,
        approvedAt: supplier.autoDispatch ? new Date() : null,
      },
    });

    console.log(`${TAG} Created purchase order ${order.id} for supplier ${supplier.name} (status: ${status})`);

    // If autoDispatch, send notification immediately
    if (supplier.autoDispatch) {
      try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
          const { sendPurchaseOrderNotification } = await import('../modules/suppliers/purchase-order.service');
          const fullOrder = { ...order, items };
          await sendPurchaseOrderNotification(fullOrder, supplier, tenant);

          await prisma.purchaseOrder.update({
            where: { id: order.id },
            data: { status: 'SENT', sentAt: new Date() },
          });

          console.log(`${TAG} Auto-dispatched order ${order.id} to supplier ${supplier.name}`);
        }
      } catch (err) {
        console.error(`${TAG} Failed to auto-dispatch order ${order.id}:`, err);
      }
    }
  }
}

// ============================================================
// JOB 6: Expiry alerts (daily at 8:00 AM)
// ============================================================
async function sendExpiryAlerts() {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringProducts = await prisma.$queryRaw<Array<{
      tenant_id: string;
      product_name: string;
      expires_at: Date;
      quantity: number;
      tenant_name: string;
    }>>`
      SELECT p.tenant_id, p.name as product_name, p.expires_at, p.quantity,
             t.name as tenant_name
      FROM products p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.expires_at IS NOT NULL
        AND p.expires_at <= ${thirtyDaysFromNow}
        AND p.expires_at >= NOW()
        AND p.is_active = true
        AND t.is_active = true
      ORDER BY p.tenant_id, p.expires_at ASC
    `;

    if (expiringProducts.length === 0) return;

    const byTenant = new Map<string, typeof expiringProducts>();
    for (const p of expiringProducts) {
      const list = byTenant.get(p.tenant_id) || [];
      list.push(p);
      byTenant.set(p.tenant_id, list);
    }

    for (const [tenantId, products] of byTenant) {
      const first = products[0];
      const ownerPhone = await getOwnerPhone(tenantId);
      if (!ownerPhone) continue;

      const now = new Date();
      const productList = products.slice(0, 5).map(p => {
        const expiresDate = new Date(p.expires_at).toLocaleDateString('pt-BR');
        const daysLeft = Math.ceil((new Date(p.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `• ${p.product_name}: vence em ${expiresDate} (${daysLeft} dias restantes)`;
      }).join('\n');

      const body = `Os seguintes produtos vencem em breve:\n\n${productList}` +
        (products.length > 5 ? `\n... e mais ${products.length - 5}` : '') +
        `\n\nAcesse o sistema para providenciar a reposicao.`;

      if (isWhatsAppConfigured()) {
        try {
          const instanceName = await evolutionApi.getInstanceName(tenantId);
          if (instanceName) {
            await evolutionApi.sendButtons(instanceName, ownerPhone, body, [
              { id: 'btn_open_stock', text: 'Abrir estoque' },
            ], `⚠️ Alerta de Vencimento - ${first.tenant_name}`);
          }
        } catch (err) {
          try {
            await evolutionApi.sendTextByTenant(tenantId, ownerPhone,
              `⚠️ Alerta de Vencimento - ${first.tenant_name}\n\n${body}`);
          } catch {}
          console.error(`${TAG} Failed to send expiry alert to ${tenantId}:`, err);
        }
      }

      console.log(`${TAG} Expiry alert for ${first.tenant_name}: ${products.length} products`);
    }
  } catch (err) {
    console.error(`${TAG} sendExpiryAlerts error:`, err);
  }
}

// ============================================================
// JOB 7: Customer reactivation (weekly, Monday 10am)
// 90+ days without contact — with buttons
// ============================================================
async function sendReactivationMessages() {
  if (!isWhatsAppConfigured()) return;

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const inactiveCustomers = await prisma.$queryRaw<Array<{
      id: string;
      tenant_id: string;
      name: string;
      phone: string;
      last_message: Date | null;
    }>>`
      SELECT c.id, c.tenant_id, c.name, c.phone,
             MAX(ms.sent_at) as last_message
      FROM customers c
      LEFT JOIN messages_sent ms ON ms.customer_id = c.id AND ms.status = 'SENT'
      WHERE c.opt_in_whatsapp = true
        AND c.is_active = true
        AND c.phone IS NOT NULL
      GROUP BY c.id, c.tenant_id, c.name, c.phone
      HAVING MAX(ms.sent_at) IS NULL OR MAX(ms.sent_at) < ${ninetyDaysAgo}
      LIMIT 50
    `;

    for (const customer of inactiveCustomers) {
      const tenantName = await getTenantName(customer.tenant_id);
      const body = `Ola ${customer.name}! Sentimos sua falta na ${tenantName}.\n\nJa faz um tempo desde sua ultima visita. Gostaríamos de saber como voce esta.`;

      try {
        const instanceName = await evolutionApi.getInstanceName(customer.tenant_id);
        if (!instanceName) continue;

        await evolutionApi.sendButtons(instanceName, customer.phone, body, [
          { id: 'btn_book', text: 'Agendar agora' },
          { id: 'btn_call', text: 'Me ligue' },
          { id: 'btn_no', text: 'Nao obrigado' },
        ], `Sentimos sua falta!`);

        await prisma.messageSent.create({
          data: {
            tenantId: customer.tenant_id,
            customerId: customer.id,
            phone: customer.phone,
            body,
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        console.log(`${TAG} Reactivation sent to ${customer.name} (${customer.phone})`);
      } catch (err) {
        console.error(`${TAG} Reactivation failed for ${customer.phone}:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} sendReactivationMessages error:`, err);
  }
}

// ============================================================
// JOB 8: 30-day return reminder (daily at 10am)
// Customers who had an appointment 30 days ago but no follow-up
// ============================================================
async function sendReturnReminders() {
  if (!isWhatsAppConfigured()) return;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    // Find completed appointments from ~30 days ago
    const oldAppointments = await prisma.scheduledCall.findMany({
      where: {
        date: { gte: thirtyOneDaysAgo, lt: thirtyDaysAgo },
        status: 'completed',
      },
    });

    for (const call of oldAppointments) {
      // Check if there's a newer appointment for this phone
      const newerAppointment = await prisma.scheduledCall.findFirst({
        where: {
          phone: { contains: call.phone.slice(-8) },
          date: { gt: call.date },
          status: { in: ['scheduled', 'confirmed', 'completed'] },
        },
      });
      if (newerAppointment) continue;

      // Find customer for tenant context
      const customer = await prisma.customer.findFirst({
        where: { phone: { contains: call.phone.slice(-8) }, isActive: true },
      });
      if (!customer || !customer.optInWhatsApp) continue;

      const tenantName = await getTenantName(customer.tenantId);
      const body = `Ola ${call.name}! Ja faz um mes desde sua ultima consulta na ${tenantName}.\n\nEsta tudo bem? Gostaria de agendar um retorno?`;

      try {
        const instanceName = await evolutionApi.getInstanceName(customer.tenantId);
        if (!instanceName) continue;

        await evolutionApi.sendButtons(instanceName, call.phone, body, [
          { id: 'btn_book', text: 'Agendar retorno' },
          { id: 'btn_fine', text: 'Estou bem' },
        ], `Hora do retorno?`);

        console.log(`${TAG} Return reminder sent to ${call.name} (${call.phone})`);
      } catch (err) {
        console.error(`${TAG} Return reminder failed for ${call.phone}:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} sendReturnReminders error:`, err);
  }
}

// ============================================================
// JOB 9: Birthday greetings (daily at 9:00 AM)
// ============================================================
async function sendBirthdayGreetings() {
  if (!isWhatsAppConfigured()) return;

  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Find customers with birthday today
    const birthdayCustomers = await prisma.$queryRaw<Array<{
      id: string;
      tenant_id: string;
      name: string;
      phone: string;
    }>>`
      SELECT c.id, c.tenant_id, c.name, c.phone
      FROM customers c
      WHERE c.birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM c.birth_date) = ${month}
        AND EXTRACT(DAY FROM c.birth_date) = ${day}
        AND c.opt_in_whatsapp = true
        AND c.is_active = true
        AND c.phone IS NOT NULL
    `;

    for (const customer of birthdayCustomers) {
      const tenantName = await getTenantName(customer.tenant_id);
      const body = `Feliz aniversario, ${customer.name}!\n\nA equipe da ${tenantName} deseja um dia incrivel para voce. Que este novo ano traga muita saude e alegria!`;

      try {
        const instanceName = await evolutionApi.getInstanceName(customer.tenant_id);
        if (!instanceName) continue;

        await evolutionApi.sendButtons(instanceName, customer.phone, body, [
          { id: 'btn_book', text: 'Quero agendar' },
          { id: 'btn_thanks', text: 'Obrigado!' },
        ], `🎂 Feliz aniversario!`);

        console.log(`${TAG} Birthday greeting sent to ${customer.name}`);
      } catch (err) {
        // Fallback to text
        try {
          await evolutionApi.sendTextByTenant(customer.tenant_id, customer.phone,
            `🎂 ${body}`);
        } catch {}
        console.error(`${TAG} Birthday greeting failed for ${customer.phone}:`, err);
      }
    }
  } catch (err) {
    console.error(`${TAG} sendBirthdayGreetings error:`, err);
  }
}

// ============================================================
// INIT: Register all cron jobs
// ============================================================
export function initCronJobs() {
  console.log(`${TAG} Initializing cron jobs...`);
  console.log(`${TAG} WhatsApp configured: ${isWhatsAppConfigured()}`);

  // Every 1 minute: process message queues
  cron.schedule('* * * * *', async () => {
    await processScheduledMessages();
    await processPendingTenantMessages();
  }, { timezone: 'America/Sao_Paulo' });

  // Every 30 min: appointment reminders (48h + 2h) and post-consultation
  cron.schedule('*/30 * * * *', async () => {
    await sendAppointmentReminders();
    await sendPostConsultationFollowUp();
  }, { timezone: 'America/Sao_Paulo' });

  // Daily at 8:00 AM: stock & expiry alerts for OWNER
  cron.schedule('0 8 * * *', async () => {
    console.log(`${TAG} Running daily stock/expiry alerts...`);
    await sendLowStockAlerts();
    await sendExpiryAlerts();
  }, { timezone: 'America/Sao_Paulo' });

  // Daily at 9:00 AM: birthday greetings
  cron.schedule('0 9 * * *', async () => {
    console.log(`${TAG} Running birthday greetings...`);
    await sendBirthdayGreetings();
  }, { timezone: 'America/Sao_Paulo' });

  // Daily at 10:00 AM: 30-day return reminders
  cron.schedule('0 10 * * *', async () => {
    console.log(`${TAG} Running 30-day return reminders...`);
    await sendReturnReminders();
  }, { timezone: 'America/Sao_Paulo' });

  // Monday at 10:00 AM: 90-day reactivation
  cron.schedule('0 10 * * 1', async () => {
    console.log(`${TAG} Running weekly reactivation...`);
    await sendReactivationMessages();
  }, { timezone: 'America/Sao_Paulo' });

  console.log(`${TAG} Cron jobs registered:`);
  console.log(`${TAG}   - Message queues: every 1 min`);
  console.log(`${TAG}   - Appointment reminders + post-consultation: every 30 min`);
  console.log(`${TAG}   - Stock/expiry alerts (OWNER): daily 8:00 AM`);
  console.log(`${TAG}   - Birthday greetings: daily 9:00 AM`);
  console.log(`${TAG}   - 30-day return reminders: daily 10:00 AM`);
  console.log(`${TAG}   - 90-day reactivation: Monday 10:00 AM`);
}
