import { PrismaClient } from "@prisma/client";

// We create ONE instance and reuse it everywhere
// If you create a new PrismaClient() in every file,
// you'll run out of database connections fast

const prisma = new PrismaClient();

export default prisma;