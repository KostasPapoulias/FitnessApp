import { PrismaClient } from "@prisma/client";

// The single shared PrismaClient — one instance keeps the connection pool bounded.

const prisma = new PrismaClient({
  // Interactive transactions pay a network round trip per statement against the
  // remote database, so the default 5 s budget is too tight. Batching queries is
  // still the rule; this only keeps a slow link from losing a write.
  transactionOptions: {
    maxWait: 15_000,
    timeout: 60_000,
  },
});

export default prisma;
