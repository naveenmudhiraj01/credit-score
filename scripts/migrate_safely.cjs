/**
 * scripts/migrate_safely.cjs
 * 
 * Stage 2: Safe, additive database migration runner for customer_onboarding.
 * - Confirms connection to target database 'customer_onboarding' without printing secrets.
 * - Verifies pre-migration backup file immediately before execution.
 * - Checks each individual column, table, and index before adding it.
 * - Idempotent and safely resumable.
 * - 100% additive: no drops, no resets, no data modifications.
 * - Preserves historical orders with reviewStatus = 'NOT_APPLICABLE' and reviewDeadline = NULL.
 */

const fs = require("fs");
const path = require("path");

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = (match[2] || "").trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("CRITICAL PRECONDITION FAILED: DATABASE_URL is not set.");
  process.exit(1);
}

const parsedUrl = new URL(dbUrl);
const targetDb = parsedUrl.pathname.replace(/^\//, "");
const targetHost = parsedUrl.hostname;
const targetPort = parsedUrl.port || "3306";

const { PrismaClient } = require(path.resolve(__dirname, "..", "node_modules", "@prisma", "client"));
const prisma = new PrismaClient();

const backupFile = "C:\\Users\\veera\\.gemini\\antigravity-ide\\brain\\d3750fff-ac7e-49d6-b065-23d4f2ec4930\\scratch\\customer_onboarding_backup.sql";
const replacer = (key, value) => typeof value === "bigint" ? value.toString() : value;

async function queryTableState(tableName) {
  const [cols, idxs] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, column_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = '${targetDb}' AND table_name = '${tableName}'
      ORDER BY ordinal_position ASC
    `),
    prisma.$queryRawUnsafe(`
      SELECT DISTINCT index_name 
      FROM information_schema.statistics 
      WHERE table_schema = '${targetDb}' AND table_name = '${tableName}'
    `)
  ]);
  return {
    cols: new Map(cols.map(c => [c.column_name || c.COLUMN_NAME, c])),
    idxs: new Set(idxs.map(i => i.index_name || i.INDEX_NAME))
  };
}

async function runStage2() {
  console.log("================================================================================");
  console.log("STAGE 2: CONTROLLED ADDITIVE DATABASE MIGRATION");
  console.log("================================================================================");

  // PRECONDITION 1: Target Database Validation
  console.log("\n[PRECONDITION 1: TARGET DATABASE CHECK]");
  console.log(`Target Host:     ${targetHost}`);
  console.log(`Target Port:     ${targetPort}`);
  console.log(`Target Database: ${targetDb}`);

  if (targetDb !== "customer_onboarding") {
    console.error(`ABORTING: Expected target database 'customer_onboarding' but received '${targetDb}'.`);
    process.exit(1);
  }
  console.log("-> Target database confirmed: 'customer_onboarding'.");

  // PRECONDITION 2: Backup File Verification Immediately Before Migration
  console.log("\n[PRECONDITION 2: BACKUP VERIFICATION IMMEDIATELY BEFORE EXECUTION]");
  if (!fs.existsSync(backupFile)) {
    console.error(`ABORTING: Pre-migration backup file missing at: ${backupFile}`);
    process.exit(1);
  }
  const bStats = fs.statSync(backupFile);
  console.log(`Backup file confirmed: ${backupFile} (${bStats.size} bytes, modified: ${bStats.mtime.toISOString()})`);
  console.log("-> Verified backup is present and ready on disk.");

  // PRECONDITION 3: Pre-Migration Record Audit & Parity Snapshot
  console.log("\n[PRECONDITION 3: RECORD AUDIT PRIOR TO ANY DDL]");
  const preOrdersCount = await prisma.paymentOrder.count();
  const preAttemptsCount = await prisma.paymentAttempt.count();
  const preWebhooksCount = await prisma.webhookEvent.count();

  console.log(`Current production counts:`);
  console.log(`  paymentorder:   ${preOrdersCount}`);
  console.log(`  paymentattempt: ${preAttemptsCount}`);
  console.log(`  webhookevent:   ${preWebhooksCount}`);

  if (preOrdersCount !== 15 || preAttemptsCount !== 14) {
    console.error(`ABORTING: Unexpected row count (expected 15 orders, 14 attempts). Received: orders=${preOrdersCount}, attempts=${preAttemptsCount}`);
    process.exit(1);
  }

  const preOrdersSnapshot = await prisma.paymentOrder.findMany({
    select: { receipt: true, razorpayOrderId: true, razorpayPaymentId: true, amount: true, status: true, customerEmail: true },
    orderBy: { createdAt: "asc" }
  });
  console.log("-> Pre-migration snapshot recorded for all 15 orders.");

  // EXECUTION STEP 1: SystemSetting Table
  console.log("\n[MIGRATION STEP 1: SystemSetting Table]");
  const dbTables = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = '${targetDb}'
  `);
  const existingTableNames = new Set(dbTables.map(t => t.table_name || t.TABLE_NAME));

  if (!existingTableNames.has("SystemSetting")) {
    console.log("  Executing: CREATE TABLE `SystemSetting`...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`SystemSetting\` (
        \`key\` VARCHAR(60) NOT NULL,
        \`value\` TEXT NOT NULL,
        \`description\` VARCHAR(255) NULL,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`updatedBy\` VARCHAR(120) NULL,
        PRIMARY KEY (\`key\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log("  -> Table `SystemSetting` created successfully.");
  } else {
    console.log("  -> Table `SystemSetting` already exists. (Skipped)");
  }

  // EXECUTION STEP 2: Seed Default Service Fee
  console.log("\n[MIGRATION STEP 2: Service Fee Seed in SystemSetting]");
  const feeRows = await prisma.$queryRawUnsafe(`
    SELECT \`key\`, \`value\` FROM \`SystemSetting\` WHERE \`key\` = 'service_fee_paise'
  `);
  if (!feeRows || feeRows.length === 0) {
    console.log("  Executing: INSERT default service fee (19900 paise = ₹199.00)...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`, \`updatedBy\`)
      VALUES ('service_fee_paise', '19900', 'Active onboarding service fee in integer paise', 'SYSTEM_INIT');
    `);
    console.log("  -> Seeded 'service_fee_paise' = 19900.");
  } else {
    console.log(`  -> Setting 'service_fee_paise' already present: ${feeRows[0].value} paise. (Skipped)`);
  }

  // Inspect existing paymentorder columns before adding
  const poStateBefore = await queryTableState("paymentorder");

  // EXECUTION STEP 3: Additive Consent Columns on paymentorder
  console.log("\n[MIGRATION STEP 3: Additive Consent Columns on paymentorder]");
  const consentColumns = [
    { name: "consentGiven", ddl: "ADD COLUMN `consentGiven` BOOLEAN NOT NULL DEFAULT FALSE" },
    { name: "consentVersion", ddl: "ADD COLUMN `consentVersion` VARCHAR(40) NULL" },
    { name: "consentText", ddl: "ADD COLUMN `consentText` VARCHAR(1000) NULL" },
    { name: "consentTimestamp", ddl: "ADD COLUMN `consentTimestamp` DATETIME(3) NULL" },
    { name: "consentIp", ddl: "ADD COLUMN `consentIp` VARCHAR(45) NULL" },
  ];

  for (const col of consentColumns) {
    if (!poStateBefore.cols.has(col.name)) {
      console.log(`  Executing: ALTER TABLE \`paymentorder\` ${col.ddl}...`);
      await prisma.$executeRawUnsafe(`ALTER TABLE \`paymentorder\` ${col.ddl};`);
      console.log(`  -> Column '${col.name}' added successfully.`);
    } else {
      console.log(`  -> Column '${col.name}' already present. (Skipped)`);
    }
  }

  // EXECUTION STEP 4: Additive Review Columns on paymentorder (reviewStatus ENUM default NOT_APPLICABLE)
  console.log("\n[MIGRATION STEP 4: Additive Review & 72h SLA Columns on paymentorder]");
  const reviewColumns = [
    { 
      name: "reviewStatus", 
      ddl: "ADD COLUMN `reviewStatus` ENUM('PENDING_REVIEW', 'IN_REVIEW', 'RESPONDED', 'CLOSED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'NOT_APPLICABLE'" 
    },
    { name: "reviewDeadline", ddl: "ADD COLUMN `reviewDeadline` DATETIME(3) NULL" },
    { name: "teamRespondedAt", ddl: "ADD COLUMN `teamRespondedAt` DATETIME(3) NULL" },
    { name: "teamResponseNotes", ddl: "ADD COLUMN `teamResponseNotes` TEXT NULL" },
    { name: "teamRespondedBy", ddl: "ADD COLUMN `teamRespondedBy` VARCHAR(120) NULL" },
  ];

  for (const col of reviewColumns) {
    if (!poStateBefore.cols.has(col.name)) {
      console.log(`  Executing: ALTER TABLE \`paymentorder\` ${col.ddl}...`);
      await prisma.$executeRawUnsafe(`ALTER TABLE \`paymentorder\` ${col.ddl};`);
      console.log(`  -> Column '${col.name}' added successfully.`);
    } else {
      console.log(`  -> Column '${col.name}' already present. (Skipped)`);
    }
  }

  // EXECUTION STEP 5: Additive Compound Index on paymentorder
  console.log("\n[MIGRATION STEP 5: Compound Index on (reviewStatus, reviewDeadline)]");
  const poStateMid = await queryTableState("paymentorder");
  const targetIndex = "PaymentOrder_reviewStatus_reviewDeadline_idx";

  if (!poStateMid.idxs.has(targetIndex)) {
    console.log(`  Executing: ALTER TABLE \`paymentorder\` ADD INDEX \`${targetIndex}\` (\`reviewStatus\`, \`reviewDeadline\`)...`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`paymentorder\` ADD INDEX \`${targetIndex}\` (\`reviewStatus\`, \`reviewDeadline\`);
    `);
    console.log(`  -> Index '${targetIndex}' created successfully.`);
  } else {
    console.log(`  -> Index '${targetIndex}' already exists. (Skipped)`);
  }

  // ============================================================================
  // POST-MIGRATION VERIFICATION & PARITY AUDIT
  // ============================================================================
  console.log("\n================================================================================");
  console.log("POST-MIGRATION VERIFICATION AUDIT");
  console.log("================================================================================");

  // 1. Verify Row Counts Match Exactly
  const postOrdersCount = await prisma.paymentOrder.count();
  const postAttemptsCount = await prisma.paymentAttempt.count();
  const postWebhooksCount = await prisma.webhookEvent.count();

  console.log("\n[ROW COUNT PARITY]");
  console.log(`  paymentorder:   Pre=${preOrdersCount} | Post=${postOrdersCount} -> ${postOrdersCount === preOrdersCount ? "EXACT MATCH (ZERO LOSS)" : "FAIL"}`);
  console.log(`  paymentattempt: Pre=${preAttemptsCount} | Post=${postAttemptsCount} -> ${postAttemptsCount === preAttemptsCount ? "EXACT MATCH (ZERO LOSS)" : "FAIL"}`);
  console.log(`  webhookevent:   Pre=${preWebhooksCount} | Post=${postWebhooksCount} -> ${postWebhooksCount === preWebhooksCount ? "EXACT MATCH (ZERO LOSS)" : "FAIL"}`);

  if (postOrdersCount !== preOrdersCount || postAttemptsCount !== preAttemptsCount) {
    console.error("CRITICAL: Row count mismatch detected after migration!");
    process.exit(1);
  }

  // 2. Verify Schema & Column Definitions
  const poStateAfter = await queryTableState("paymentorder");
  console.log(`\n[SCHEMA AUDIT: paymentorder]`);
  console.log(`Total columns on paymentorder: ${poStateAfter.cols.size} (Pre: 20, Added: 10)`);
  
  const expectedNewCols = ["consentGiven", "consentVersion", "consentText", "consentTimestamp", "consentIp", "reviewStatus", "reviewDeadline", "teamRespondedAt", "teamResponseNotes", "teamRespondedBy"];
  for (const c of expectedNewCols) {
    const colDef = poStateAfter.cols.get(c);
    if (!colDef) {
      console.error(`CRITICAL: Column '${c}' missing on paymentorder!`);
      process.exit(1);
    }
    console.log(`  Column '${c.padEnd(20)}': Type=${(colDef.column_type || colDef.DATA_TYPE).padEnd(25)} | Nullable=${colDef.is_nullable} | Default=${colDef.column_default}`);
  }

  // 3. Verify SystemSetting Table & Seed
  console.log(`\n[SYSTEM SETTING AUDIT]`);
  const settingCheck = await prisma.$queryRawUnsafe(`SELECT \`key\`, \`value\`, \`description\`, \`updatedBy\` FROM \`SystemSetting\``);
  console.log("SystemSetting records in DB:", JSON.stringify(settingCheck, null, 2));

  // 4. Verify Historical Orders (Preservation & Classification)
  console.log(`\n[HISTORICAL ORDER CLASSIFICATION & INTEGRITY CHECK]`);
  const postOrders = await prisma.$queryRawUnsafe(`
    SELECT receipt, razorpayOrderId, razorpayPaymentId, amount, status, customerEmail, reviewStatus, reviewDeadline, consentGiven
    FROM \`paymentorder\`
    ORDER BY createdAt ASC
  `);

  let parityCheckPassed = true;
  postOrders.forEach((o, idx) => {
    const pre = preOrdersSnapshot[idx];
    const unchanged = (
      o.receipt === pre.receipt &&
      o.razorpayOrderId === pre.razorpayOrderId &&
      o.razorpayPaymentId === pre.razorpayPaymentId &&
      o.amount === pre.amount &&
      o.status === pre.status &&
      o.customerEmail === pre.customerEmail
    );
    const correctlyClassified = (
      o.reviewStatus === 'NOT_APPLICABLE' &&
      o.reviewDeadline === null &&
      o.consentGiven === 0
    );

    if (!unchanged || !correctlyClassified) {
      parityCheckPassed = false;
      console.error(`Integrity issue on order ${o.receipt}: unchanged=${unchanged}, correctlyClassified=${correctlyClassified}`);
    }

    console.log(`  [${String(idx + 1).padStart(2, '0')}] ${o.receipt.padEnd(18)} | Status: ${o.status.padEnd(8)} | Fee: ₹${(o.amount/100).toFixed(2).padEnd(6)} | Review: ${o.reviewStatus.padEnd(14)} | Deadline: ${o.reviewDeadline ? o.reviewDeadline.toISOString() : 'NULL (Correct)'} | Consent: ${o.consentGiven ? 'TRUE' : 'FALSE (Correct)'}`);
  });

  if (!parityCheckPassed) {
    console.error("CRITICAL: Historical order parity or classification check failed!");
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("STAGE 2 RESULT: MIGRATION SUCCESSFUL - ALL PRECONDITIONS & PARITY CHECKS PASSED");
  console.log("Zero records lost or modified. Historical orders classified as NOT_APPLICABLE.");
  console.log("No application code was modified. Stage 3 gate active.");
  console.log("================================================================================");
}

runStage2().catch(err => {
  console.error("STAGE 2 FAILURE:", err.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
