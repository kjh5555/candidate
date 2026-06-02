import { prisma } from "../src/db.js";
const c = await prisma.legislatorAsset.count({ where: { reportYm: "202603" } });
const sample = await prisma.legislatorAsset.findFirst({ where: { reportYm: "202603", legislatorName: "우원식" } });
console.log("count=", c);
console.log("sample.name=", sample?.legislatorName, "kind=", sample?.assetKind);
await prisma.$disconnect();
