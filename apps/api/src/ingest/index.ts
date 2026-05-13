// CLI entry point for data ingestion.
//
// Usage:
//   tsx src/ingest/index.ts all 22
//   tsx src/ingest/index.ts legislators 22
//   tsx src/ingest/index.ts bills 22
//   tsx src/ingest/index.ts votes 22
//   tsx src/ingest/index.ts districts [csvPath]
//   tsx src/ingest/index.ts link-districts [assemblyAge]
//   tsx src/ingest/index.ts provincial
//   tsx src/ingest/index.ts resolve 22
//   tsx src/ingest/index.ts local-candidates [electionId]
//   tsx src/ingest/index.ts candidate-backgrounds [electionId]

import { prisma } from "../db.js";
import { ingestBills, ingestLegislators, ingestVotes } from "./nationalAssembly.js";
import { ingestBasicLegislators, ingestProvincialLegislators } from "./provincialCouncil.js";
import { seedDistrictMapping } from "./districtMapping.js";
import { resolveBillProposers } from "./billProposerResolver.js";
import { linkLegislatorDistricts } from "./linkDistricts.js";
import { ingestLocalCandidates } from "./localElection.js";
import { ingestCandidateBackgrounds } from "./candidateBackground.js";
import { linkAllLegislatorHuboids } from "./legislatorHuboids.js";
import { ingestLegislatorBackgrounds } from "./legislatorBackgrounds.js";
import { ingestNationalLegislatorAssets } from "./legislatorAssets.js";
import { ingestProvincialAssetsFromNewstapa, ingestBasicAssetsFromNewstapa } from "./newstapaAssets.js";
import {
  ingestMetropolitanBudget,
  ingestNationalBudget,
} from "./budget.js";
import {
  ingestSettlement,
  ingestSettlementReports,
  ingestSettlementStructure,
} from "./settlement.js";
import { ingestLegislatorMilitary } from "./legislatorMilitary.js";

type Step =
  | "all"
  | "all-budget"
  | "legislators"
  | "bills"
  | "votes"
  | "districts"
  | "link-districts"
  | "provincial"
  | "provincial-assembly"
  | "basic-assembly"
  | "resolve"
  | "local-candidates"
  | "candidate-backgrounds"
  | "backgrounds"
  | "legislator-huboids"
  | "legislator-backgrounds"
  | "legislator-assets"
  | "assets"
  | "provincial-assets"
  | "newstapa-provincial"
  | "basic-assets"
  | "newstapa-basic"
  | "budget"
  | "budget-national"
  | "budget-metropolitan"
  | "settlement"
  | "budget-settlement"
  | "settlement-structure"
  | "structure"
  | "settlement-reports"
  | "reports"
  | "military"
  | "legislator-military";

const VALID_STEPS: Step[] = [
  "all",
  "all-budget",
  "legislators",
  "bills",
  "votes",
  "districts",
  "link-districts",
  "provincial",
  "provincial-assembly",
  "basic-assembly",
  "resolve",
  "local-candidates",
  "candidate-backgrounds",
  "backgrounds",
  "legislator-huboids",
  "legislator-backgrounds",
  "legislator-assets",
  "assets",
  "provincial-assets",
  "newstapa-provincial",
  "basic-assets",
  "newstapa-basic",
  "budget",
  "budget-national",
  "budget-metropolitan",
  "settlement",
  "budget-settlement",
  "settlement-structure",
  "structure",
  "settlement-reports",
  "reports",
  "military",
  "legislator-military",
];

function printUsageAndExit(code = 1): never {
  console.error(
    "Usage:\n" +
      "  tsx src/ingest/index.ts all <assemblyAge>\n" +
      "  tsx src/ingest/index.ts all-budget [fiscalYear]\n" +
      "  tsx src/ingest/index.ts legislators <assemblyAge>\n" +
      "  tsx src/ingest/index.ts bills <assemblyAge>\n" +
      "  tsx src/ingest/index.ts votes <assemblyAge>\n" +
      "  tsx src/ingest/index.ts districts [csvPath]\n" +
      "  tsx src/ingest/index.ts link-districts [assemblyAge]\n" +
      "  tsx src/ingest/index.ts provincial\n" +
      "  tsx src/ingest/index.ts provincial-assembly [sgId]\n" +
      "  tsx src/ingest/index.ts basic-assembly [sgId]\n" +
      "  tsx src/ingest/index.ts resolve <assemblyAge>\n" +
      "  tsx src/ingest/index.ts local-candidates [electionId]\n" +
      "  tsx src/ingest/index.ts candidate-backgrounds [electionId]\n" +
      "  tsx src/ingest/index.ts legislator-huboids\n" +
      "  tsx src/ingest/index.ts legislator-backgrounds\n" +
      "  tsx src/ingest/index.ts legislator-assets [csvPath]\n" +
      "  tsx src/ingest/index.ts assets [csvPath]\n" +
      "  tsx src/ingest/index.ts provincial-assets\n" +
      "  tsx src/ingest/index.ts newstapa-provincial\n" +
      "  tsx src/ingest/index.ts basic-assets\n" +
      "  tsx src/ingest/index.ts newstapa-basic\n" +
      "  tsx src/ingest/index.ts budget [fiscalYear]\n" +
      "  tsx src/ingest/index.ts budget-national [fiscalYear]\n" +
      "  tsx src/ingest/index.ts budget-metropolitan [fiscalYear]\n" +
      "  tsx src/ingest/index.ts settlement [fiscalYear]\n" +
      "  tsx src/ingest/index.ts budget-settlement [fiscalYear]\n" +
      "  tsx src/ingest/index.ts settlement-structure [fiscalYear]\n" +
      "  tsx src/ingest/index.ts structure [fiscalYear]\n" +
      "  tsx src/ingest/index.ts settlement-reports [fiscalYear]\n" +
      "  tsx src/ingest/index.ts reports [fiscalYear]\n" +
      "  tsx src/ingest/index.ts military\n" +
      "  tsx src/ingest/index.ts legislator-military",
  );
  process.exit(code);
}

function parseFiscalYear(raw: string | undefined): number {
  if (raw && raw.trim() !== "") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1900 && n <= 9999) return n;
  }
  // Default to current calendar year.
  return new Date().getFullYear();
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
    case "link-districts": {
      const age = args[0] ? parseAge(args[0]) : 22;
      await linkLegislatorDistricts(age);
      return;
    }
    case "provincial": {
      await ingestProvincialLegislators();
      return;
    }
    case "provincial-assembly": {
      const sgId = args[0] && args[0].trim() !== "" ? args[0] : "20220601";
      await ingestProvincialLegislators(sgId);
      return;
    }
    case "basic-assembly": {
      const sgId = args[0] && args[0].trim() !== "" ? args[0] : "20220601";
      await ingestBasicLegislators(sgId);
      return;
    }
    case "budget":
    case "budget-national": {
      const year = parseFiscalYear(args[0]);
      await ingestNationalBudget(year);
      return;
    }
    case "budget-metropolitan": {
      const year = parseFiscalYear(args[0]);
      await ingestMetropolitanBudget(year);
      return;
    }
    case "settlement":
    case "budget-settlement": {
      // Settlement is published year-end, so default to previous year
      // when no fiscalYear is provided.
      const raw = args[0];
      let year: number;
      if (raw && raw.trim() !== "") {
        year = parseFiscalYear(raw);
      } else {
        year = new Date().getFullYear() - 1;
      }
      await ingestSettlement(year);
      return;
    }
    case "settlement-structure":
    case "structure": {
      const raw = args[0];
      const year =
        raw && raw.trim() !== ""
          ? parseFiscalYear(raw)
          : new Date().getFullYear() - 1;
      await ingestSettlementStructure(year);
      return;
    }
    case "settlement-reports":
    case "reports": {
      const raw = args[0];
      const year =
        raw && raw.trim() !== ""
          ? parseFiscalYear(raw)
          : new Date().getFullYear() - 1;
      await ingestSettlementReports(year);
      return;
    }
    case "resolve": {
      await resolveBillProposers(parseAge(args[0]));
      return;
    }
    case "local-candidates": {
      const electionId = args[0] && args[0].trim() !== "" ? args[0] : "20260603";
      await ingestLocalCandidates(electionId);
      return;
    }
    case "candidate-backgrounds":
    case "backgrounds": {
      const electionId = args[0] && args[0].trim() !== "" ? args[0] : "20260603";
      await ingestCandidateBackgrounds(electionId);
      return;
    }
    case "legislator-huboids": {
      await linkAllLegislatorHuboids();
      return;
    }
    case "legislator-backgrounds": {
      await ingestLegislatorBackgrounds();
      return;
    }
    case "legislator-assets":
    case "assets": {
      const csvPath = args[0] && args[0].trim() !== "" ? args[0] : undefined;
      await ingestNationalLegislatorAssets(csvPath);
      return;
    }
    case "provincial-assets":
    case "newstapa-provincial": {
      await ingestProvincialAssetsFromNewstapa();
      return;
    }
    case "basic-assets":
    case "newstapa-basic": {
      await ingestBasicAssetsFromNewstapa();
      return;
    }
    case "military":
    case "legislator-military": {
      await ingestLegislatorMilitary();
      return;
    }
  }
}

async function runAll(assemblyAge: number): Promise<void> {
  const order: Array<Exclude<Step, "all" | "all-budget">> = [
    "districts",
    "legislators",
    "link-districts",
    "provincial-assembly",
    "legislator-huboids",
    "legislator-backgrounds",
    "local-candidates",
    "candidate-backgrounds",
    "provincial",
    "bills",
    "votes",
    "resolve",
  ];
  for (const step of order) {
    console.log(`\n=== Step: ${step} ===`);
    try {
      if (
        step === "districts" ||
        step === "provincial" ||
        step === "provincial-assembly" ||
        step === "local-candidates" ||
        step === "candidate-backgrounds" ||
        step === "backgrounds" ||
        step === "legislator-huboids" ||
        step === "legislator-backgrounds"
      ) {
        await runStep(step, []);
      } else {
        await runStep(step, [String(assemblyAge)]);
      }
    } catch (err) {
      console.error(`[all] Step "${step}" failed; continuing.`, err);
    }
  }
}

async function runAllBudget(fiscalYear: number): Promise<void> {
  const order: Array<"budget-national" | "budget-metropolitan"> = [
    "budget-national",
    "budget-metropolitan",
  ];
  for (const step of order) {
    console.log(`\n=== Step: ${step} (fiscalYear=${fiscalYear}) ===`);
    try {
      await runStep(step, [String(fiscalYear)]);
    } catch (err) {
      console.error(`[all-budget] Step "${step}" failed; continuing.`, err);
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
  } else if (step === "all-budget") {
    const year = parseFiscalYear(rest[0]);
    await runAllBudget(year);
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
