const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BACKUP_PATH = "C:\\Users\\veera\\.gemini\\antigravity-ide\\brain\\d3750fff-ac7e-49d6-b065-23d4f2ec4930\\scratch\\customer_onboarding_backup.sql";

async function reconcile() {
  console.log("=== STEP 1: AUDIT & RECONCILIATION OF 15 HISTORICAL ORDERS ===");


  const backupSql = fs.readFileSync(BACKUP_PATH, "utf8");
  console.log(`Backup file exists at ${BACKUP_PATH}, size: ${backupSql.length} bytes.`);

  // Extract values list from INSERT INTO `paymentorder`
  const insertMatch = backupSql.match(/INSERT INTO `paymentorder`[^(]+\(([^)]+)\)\s*VALUES\s*([\s\S]+?);\s*(?:DROP|CREATE|$)/i);
  if (!insertMatch) {
    console.error("Could not find INSERT INTO `paymentorder` block in backup!");
    return;
  }

  const rawValuesBlock = insertMatch[2].trim();

  // Custom SQL row parser handling escaped quotes ('') and NULLs
  function parseSqlRows(str) {
    const rows = [];
    let i = 0;
    while (i < str.length) {
      // Find start of row '('
      while (i < str.length && str[i] !== "(") i++;
      if (i >= str.length) break;
      i++; // skip '('

      const tokens = [];
      while (i < str.length && str[i] !== ")") {
        while (i < str.length && (str[i] === " " || str[i] === "\n" || str[i] === "\r" || str[i] === "\t")) i++;
        if (str[i] === ")") break;

        if (str[i] === "'") {
          // String literal
          i++; // skip open quote
          let val = "";
          while (i < str.length) {
            if (str[i] === "'" && str[i + 1] === "'") {
              val += "'";
              i += 2;
            } else if (str[i] === "\\'") {
              val += "'";
              i += 2;
            } else if (str[i] === "'") {
              i++; // close quote
              break;
            } else {
              val += str[i++];
            }
          }
          tokens.push(val);
        } else if (str.slice(i, i + 4).toUpperCase() === "NULL") {
          tokens.push(null);
          i += 4;
        } else {
          // Number or identifier
          let numStr = "";
          while (i < str.length && str[i] !== "," && str[i] !== ")" && str[i] !== " " && str[i] !== "\n") {
            numStr += str[i++];
          }
          tokens.push(numStr ? Number(numStr) : null);
        }

        // skip whitespace and comma
        while (i < str.length && (str[i] === " " || str[i] === "\n" || str[i] === "\r" || str[i] === "\t")) i++;
        if (str[i] === ",") i++;
      }
      if (str[i] === ")") i++;
      if (tokens.length >= 15) rows.push(tokens);
    }
    return rows;
  }

  const rawRows = parseSqlRows(rawValuesBlock);
  console.log(`Parsed ${rawRows.length} raw rows from backup SQL.`);

  const backupOrders = rawRows.map(tokens => ({
    id: tokens[0],
    receipt: tokens[1],
    razorpayOrderId: tokens[2],
    razorpayPaymentId: tokens[3],
    razorpaySignature: tokens[4],
    product: tokens[5],
    amount: tokens[6],
    currency: tokens[7],
    status: tokens[8],
    failureReason: tokens[9],
    customerName: tokens[10],
    customerEmail: tokens[11],
    customerMobile: tokens[12],
    emailStatus: tokens[13],
    emailSentAt: tokens[14],
    sheetStatus: tokens[15],
    sheetSyncedAt: tokens[16],
    paidAt: tokens[17],
    createdAt: tokens[18],
    updatedAt: tokens[19],
  }));

  console.log(`Backup PaymentOrder count: ${backupOrders.length}`);

  // 2. Fetch current DB orders
  const currentOrders = await prisma.paymentOrder.findMany({
    orderBy: { createdAt: "asc" },
  });
  console.log(`Current DB PaymentOrder count: ${currentOrders.length}`);

  // Check matching IDs and receipts
  const currentById = new Map(currentOrders.map(o => [o.id, o]));
  const currentByReceipt = new Map(currentOrders.map(o => [o.receipt, o]));

  let allMatched = true;
  console.log("\nDetailed Record-by-Record Parity Check:");
  for (const b of backupOrders) {
    const c = currentById.get(b.id) || currentByReceipt.get(b.receipt);
    if (!c) {
      console.error(`[MISSING] Backup order ${b.receipt} (id: ${b.id}) NOT FOUND in current DB!`);
      allMatched = false;
      continue;
    }

    const receiptMatch = c.receipt === b.receipt;
    const rzpOrderMatch = c.razorpayOrderId === b.razorpayOrderId;
    const rzpPaymentMatch = c.razorpayPaymentId === b.razorpayPaymentId;
    const amountMatch = c.amount === b.amount;
    const statusMatch = c.status === b.status;
    const emailMatch = c.customerEmail === b.customerEmail;
    const bCreatedDate = b.createdAt ? (b.createdAt.includes("T") ? new Date(b.createdAt).toISOString() : b.createdAt.replace(" ", "T") + "Z") : null;
    const cCreatedDate = c.createdAt.toISOString();
    const createdMatch = bCreatedDate === cCreatedDate;

    // Mask email for security/redaction
    const maskedEmail = b.customerEmail ? b.customerEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "NULL";
    const maskedPayment = b.razorpayPaymentId ? b.razorpayPaymentId.slice(0, 8) + "..." : "NULL";

    const isRecordExact = receiptMatch && rzpOrderMatch && rzpPaymentMatch && amountMatch && statusMatch && emailMatch && createdMatch;
    if (!isRecordExact) {
      console.error(`[DIFF] Mismatch on order ${b.receipt}:`);
      console.error(`  Backup:  amount=${b.amount}, status=${b.status}, rzpPayment=${b.razorpayPaymentId}, created=${bCreatedDate}`);
      console.error(`  Current: amount=${c.amount}, status=${c.status}, rzpPayment=${c.razorpayPaymentId}, created=${cCreatedDate}`);
      allMatched = false;
    } else {
      console.log(`  [OK] ${b.receipt} | amt=${b.amount} | status=${b.status} | rzpPay=${maskedPayment} | email=${maskedEmail} | created=${bCreatedDate} | revStatus=${c.reviewStatus}`);
    }
  }

  console.log(`\nAll 15 backup orders matched 1-to-1 in current DB: ${allMatched}`);

  // Inspect createdAt of all 15 orders to explain the "14 vs 15" discrepancy
  console.log("\n--- EXPLANATION OF '14 vs 15' DISCREPANCY ---");
  const beforeOct13 = currentOrders.filter(o => o.createdAt < new Date("2026-10-13T00:00:00Z"));
  const onOrAfterOct13 = currentOrders.filter(o => o.createdAt >= new Date("2026-10-13T00:00:00Z"));
  console.log(`Orders with createdAt < 2026-10-13T00:00:00Z: ${beforeOct13.length}`);
  console.log(`Orders with createdAt >= 2026-10-13T00:00:00Z: ${onOrAfterOct13.length}`);
  for (const o of onOrAfterOct13) {
    console.log(`  Order created on Oct 13: receipt=${o.receipt}, createdAt=${o.createdAt.toISOString()}, reviewStatus=${o.reviewStatus}`);
  }

  // Inspect actual MySQL column definition for reviewStatus
  console.log("\n--- STEP 6: SCHEMA CONSISTENCY AUDIT ---");
  const colRows = await prisma.$queryRawUnsafe(
    "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'customer_onboarding' AND TABLE_NAME = 'paymentorder' AND COLUMN_NAME = 'reviewStatus'"
  );
  console.log("MySQL reviewStatus Column definition:", colRows);

  await prisma.$disconnect();
}

reconcile().catch(e => {
  console.error("Error in reconciliation:", e);
  process.exit(1);
});
