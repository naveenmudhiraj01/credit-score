/**
 * scripts/migrate_review_workflow.cjs
 *
 * Additive, idempotent MySQL migration for the order-tracking / review workflow.
 *  - Extends ENUM PaymentOrder.reviewStatus   with APPROVED, REJECTED, INFO_REQUESTED
 *  - Extends ENUM EmailNotification.emailType with REVIEW_APPROVED, REVIEW_REJECTED, REVIEW_INFO_REQUESTED
 *  - Adds PaymentOrder.reviewStartedAt / reviewStartedBy (nullable)
 * Existing values, rows and the other columns are untouched. Safe to re-run.
 *
 * Usage (take a database backup first):
 *   CONFIRM_BACKUP=yes node scripts/migrate_review_workflow.cjs
 * Table names are the Prisma model names (PaymentOrder, EmailNotification) as used by your existing database.
 */
const fs = require("fs");
const path = require("path");

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = (m[2] || "").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
if (process.env.CONFIRM_BACKUP !== "yes") {
  console.error("Refusing to run: take a database backup, then re-run with CONFIRM_BACKUP=yes.");
  process.exit(1);
}

const db = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
const { PrismaClient } = require(path.resolve(__dirname, "..", "node_modules", "@prisma", "client"));
const prisma = new PrismaClient();

const REVIEW_ENUM = ["PENDING_REVIEW", "IN_REVIEW", "RESPONDED", "CLOSED", "NOT_APPLICABLE", "APPROVED", "REJECTED", "INFO_REQUESTED"];
const EMAIL_TYPE_ENUM = [
  "CUSTOMER_REGISTRATION", "ADMIN_REGISTRATION", "CUSTOMER_PAYMENT_CONFIRMATION", "ADMIN_PAYMENT_NOTIFICATION",
  "REVIEW_APPROVED", "REVIEW_REJECTED", "REVIEW_INFO_REQUESTED",
];

async function columnType(table, column) {
  const rows = await prisma.$queryRaw`
    SELECT COLUMN_TYPE AS t, IS_NULLABLE AS n, COLUMN_DEFAULT AS d
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ${db} AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`;
  return rows[0] || null;
}
const enumValues = (t) => (String(t).match(/'((?:[^']|'')*)'/g) || []).map((v) => v.slice(1, -1));
const quoteList = (a) => a.map((v) => `'${v}'`).join(", ");

async function ensureEnum(table, column, wanted, tail) {
  const col = await columnType(table, column);
  if (!col) throw new Error(`Column ${table}.${column} not found in database "${db}".`);
  const have = enumValues(col.t);
  const missing = wanted.filter((v) => !have.includes(v));
  if (missing.length === 0) { console.log(`  ${table}.${column}: already up to date.`); return; }
  // Keep every existing value (in its existing order) and append the new ones, so no stored value can be invalidated.
  const merged = [...have, ...missing];
  console.log(`  ${table}.${column}: adding ${missing.join(", ")}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${quoteList(merged)}) ${tail}`);
}

async function ensureColumn(table, column, ddl) {
  if (await columnType(table, column)) { console.log(`  ${table}.${column}: already exists.`); return; }
  console.log(`  ${table}.${column}: adding`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

(async () => {
  console.log(`Target database: ${db}`);
  const before = await prisma.paymentOrder.count();
  await ensureEnum("PaymentOrder", "reviewStatus", REVIEW_ENUM, "NOT NULL DEFAULT 'NOT_APPLICABLE'");
  await ensureEnum("EmailNotification", "emailType", EMAIL_TYPE_ENUM, "NOT NULL");
  await ensureColumn("PaymentOrder", "reviewStartedAt", "`reviewStartedAt` DATETIME(3) NULL");
  await ensureColumn("PaymentOrder", "reviewStartedBy", "`reviewStartedBy` VARCHAR(120) NULL");
  const after = await prisma.paymentOrder.count();
  if (before !== after) throw new Error(`Row count changed (${before} -> ${after}).`);
  console.log(`Done. PaymentOrder rows unchanged (${after}).`);
})()
  .catch((e) => { console.error("Migration failed:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
