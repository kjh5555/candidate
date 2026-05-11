// CLI entry point for data ingestion.
//
// Usage:
//   tsx src/ingest/index.ts all 22
//   tsx src/ingest/index.ts legislators 22
//   tsx src/ingest/index.ts bills 22
//   tsx src/ingest/index.ts votes 22
//   tsx src/ingest/index.ts districts [csvPath]
//   tsx src/ingest/index.ts provincial
//   tsx src/ingest/index.ts resolve 22

import { prisma } from "../db.js";
import { ingestBills, ingestLegislators, ingestVotes } from "./nationalAssembly.js";
import { ingestProvincialLegislators } from "./provincialCouncil.js";
import { seedDistrictMapping } from "./districtMapping.js";
import { resolveBillProposers } from "./billProposerResolver.js";

type Step =
  | "all"
  | "legislators"
  | "bills"
  | "votes"
  | "districts"
  | "provincial"
  | "resolve";

const VALID_STEPS: Step[] = [
  "all",
  "legislators",
  "bills",
  "votes",
  "districts",
  "provincial",
  "resolve",
];

function printUsageAndExit(code = 1): never {
  console.error(
    "Usage:\n" +
      "  tsx src/ingest/index.ts all <assemblyAge>\n" +
      "  tsx src/ingest/index.ts legislators <assemblyAge>\n" +
      "  tsx src/ingest/index.ts bills <assemblyAge>\n" +
      "  tsx src/ingest/index.ts votes <assemblyAge>\n" +
      "  tsx src/ingest/index.ts districts [csvPath]\n" +
      "  tsx src/ingest/index.ts provincial\n" +
      "  tsx src/ingest/index.ts resolve <assemblyAge>",
  );
  process.exit(code);
}

function parseAge(raw: string | undefined): number {
  if (!raw) {
    console.error("Missing <assemblyAge> argument.");
    printUsageAndExit();
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid assemblyAge: ${raw}`);
    printUsageAndExit();
  }
  return n;
}

async function runStep(step: Exclude<Step, "all">, args: string[]): Promise<void> {
  switch (step) {
    case "legislators": {
      await ingestLegislators(parseAge(args[0]));
      return;
    }
    case "bills": {
      await ingestBills(parseAge(args[0]));
      return;
    }
    case "votes": {
      await ingestVotes(parseAge(args[0]));
      return;
    }
    case "districts": {
      const csvPath = args[0];
      if (csvPath) {
        await seedDistrictMapping(csvPath);
      } else {
        await seedDistrictMapping();
      }
      return;
    }
    case "provincial": {
      await ingestProvincialLegislators();
      return;
    }
    case "resolve": {
      await resolveBillProposers(parseAge(args[0]));
      return;
    }
  }
}

async function runAll(assemblyAge: number): Promise<void> {
  const order: Array<Exclude<Step, "all">> = [
    "districts",
    "legislators",
    "provincial",
    "bills",
    "votes",
    "resolve",
  ];
  for (const step of order) {
    console.log(`\n=== Step: ${step} ===`);
    try {
      if (step === "districts" || step === "provincial") {
        await runStep(step, []);
      } else {
        await runStep(step, [String(assemblyAge)]);
      }
    } catch (err) {
      console.error(`[all] Step "${step}" failed; continuing.`, err);
    }
  }
}

async function main(): Promise<void> {
  const [, , rawStep, ...rest] = process.argv;
  if (!rawStep) printUsageAndExit();

  const step = rawStep as Step;
  if (!VALID_STEPS.includes(step)) {
    console.error(`Unknown step: ${rawStep}`);
    printUsageAndExit();
  }

  if (step === "all") {
    const age = parseAge(rest[0]);
    await runAll(age);
  } else {
    await runStep(step, rest);
  }
}

main()
  .catch((err) => {
    console.error("[ingest] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
