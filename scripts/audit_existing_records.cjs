const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function audit() {
  const orders = await prisma.paymentOrder.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`Auditing ${orders.length} orders in database:\n`);

  for (const o of orders) {
    console.log(JSON.stringify({
      id: o.id,
      receipt: o.receipt,
      product: o.product,
      amount: o.amount,
      status: o.status,
      name: o.customerName,
      email: o.customerEmail,
      mobile: o.customerMobile,
      paidAt: o.paidAt,
      rzpPaymentId: o.razorpayPaymentId,
      createdAt: o.createdAt,
    }, null, 2));
  }

  await prisma.$disconnect();
}

audit().catch(console.error);
