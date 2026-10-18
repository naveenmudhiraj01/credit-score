const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function clean() {
  await prisma.paymentAttempt.deleteMany({
    where: { order: { customerEmail: { contains: "sandbox" } } },
  });
  const res = await prisma.paymentOrder.deleteMany({
    where: { customerEmail: { contains: "sandbox" } },
  });
  console.log("Cleaned isolated sandbox test orders:", res.count);

  const total = await prisma.paymentOrder.count();
  console.log("Final total paymentOrder count:", total);

  const historical = await prisma.paymentOrder.count({
    where: { reviewStatus: "NOT_APPLICABLE", reviewDeadline: null, consentGiven: false },
  });
  console.log("Historical NOT_APPLICABLE records count:", historical);

  await prisma.$disconnect();
}

clean().catch(console.error);
