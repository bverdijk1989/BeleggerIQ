/**
 * CLI: zet of update het wachtwoord van een user.
 *
 * Gebruik:
 *   npx tsx scripts/set-user-password.ts <email> <password>
 *
 * Veiligheid:
 *  - Password wordt direct gehasht met bcrypt cost-12
 *  - Raw password NIET gelogd
 *  - Vereist bestaande User-row (geen account-creatie via dit script)
 *
 * Voor productie:
 *   sudo -u beleggeriq npx tsx scripts/set-user-password.ts you@x.com 'jouw-pwd'
 *
 * Note: gebruik aanhalingstekens rond het password om shell-escaping
 * te vermijden (vooral als 'em $ of ! bevat).
 */

import { PrismaClient } from "@prisma/client";

import { hashPassword, PASSWORD_POLICY } from "../src/lib/auth/password";

async function main(): Promise<void> {
  const [, , emailArg, passwordArg] = process.argv;
  if (!emailArg || !passwordArg) {
    console.error(
      "Usage: npx tsx scripts/set-user-password.ts <email> <password>",
    );
    console.error(
      `Password minimum length: ${PASSWORD_POLICY.MIN_LENGTH}, max: ${PASSWORD_POLICY.MAX_LENGTH}`,
    );
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      console.error(`❌ User niet gevonden: ${email}`);
      console.error(
        "   Dit script creëert geen accounts — gebruiker moet eerst bestaan",
      );
      console.error(
        "   (bv. via magic-link of OAuth-login).",
      );
      process.exit(2);
    }

    const hash = await hashPassword(passwordArg);
    if (!hash.ok) {
      console.error(`❌ Password ongeldig: ${hash.error}`);
      process.exit(3);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash.hash },
    });

    console.log(`✅ Password gezet voor ${user.email}`);
    console.log("   User kan nu inloggen via /login → tab 'Wachtwoord'");
  } catch (error) {
    console.error("❌ Onverwachte fout:", error);
    process.exit(4);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
