import { PrismaClient } from "@prisma/client";

// We create ONE instance and reuse it everywhere
// If you create a new PrismaClient() in every file,
// you'll run out of database connections fast

const prisma = new PrismaClient({
  // Prisma allows an interactive transaction — `$transaction(async tx => …)` —
  // five seconds by default, and that budget is spent on the NETWORK, not on
  // the database. Every statement inside one is its own round trip, plus one
  // each for BEGIN and COMMIT, and the dev database is remote: a round trip
  // has been measured at ~290 ms and, on a bad link, over 2 s. Four statements
  // is then past the limit, and the transaction dies with P2028 "Transaction
  // not found" — which arrives at the client as a bare 500 with nothing in it
  // to suggest the cause was latency.
  //
  // This is a safety net, not a licence. Batching independent queries and
  // preferring the array form of `$transaction` (one round trip for the whole
  // list) is still the rule — see the note in CLAUDE.md. The net exists so
  // that a slow link degrades into a slow request instead of a lost write.
  transactionOptions: {
    maxWait: 15_000,
    timeout: 60_000,
  },
});

export default prisma;
