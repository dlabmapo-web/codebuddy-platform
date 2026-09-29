/** Account QA row ACCOUNT-001-S-014. Dry-run by default; never renames campuses. */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { academyFeatureNames } from "@cove/shared";
import { PrismaClient } from "../../generated/prisma/client.js";

const campuses = [
  ["daechi", "대치캠퍼스"], ["jamsil", "잠실캠퍼스"],
  ["mokdong", "목동캠퍼스"], ["gwangjin", "광진캠퍼스"],
  ["mapo", "마포캠퍼스"], ["pangyo", "판교캠퍼스"],
  ["dongtan", "동탄캠퍼스"], ["jeongja", "정자캠퍼스"],
  ["pyeongchon", "평촌학원가캠퍼스"], ["pyeongtaek", "평택캠퍼스"],
  ["gwacheon", "과천캠퍼스"], ["suwon", "수원캠퍼스"],
  ["dongtan-lake", "동탄호수캠퍼스"], ["hanam-misa", "하남미사캠퍼스"],
  ["goyang-hwajeong", "고양화정캠퍼스"], ["wirye", "위례캠퍼스"],
  ["ansan", "안산캠퍼스"], ["daegu-suseong", "대구수성캠퍼스"],
  ["ulsan", "울산캠퍼스"], ["gyeongnam-jinju", "경남진주캠퍼스"],
  ["haeundae", "해운대캠퍼스"], ["namcheon", "남천캠퍼스"],
  ["cheongju", "청주캠퍼스"], ["chungnam-seosan", "충남서산캠퍼스"],
  ["daejeon-gwanjeo", "대전관저캠퍼스"], ["sejong", "세종캠퍼스"],
  ["cheonan-buldang", "천안불당캠퍼스"], ["songdo", "송도국제캠퍼스"],
  ["incheon-guwol", "인천구월캠퍼스"], ["gwangju-bongseon", "광주봉선캠퍼스"],
  ["suncheon-sindae", "순천신대캠퍼스"],
] as const;

const args = process.argv.slice(2);
const orgSlug = args.find(arg => arg.startsWith("--organization="))?.split("=")[1];
const actorId = args.find(arg => arg.startsWith("--actor="))?.split("=")[1];
const apply = args.includes("--apply");
if (!orgSlug || args.some(arg => !/^(--organization=.+|--actor=.+|--apply)$/.test(arg))) {
  throw new Error("Usage: cli.ts --organization=<existing-slug> [--apply --actor=<operator-user-id>]");
}
const connectionString = process.env.QA_CAMPUSES_DATABASE_URL;
if (!connectionString) throw new Error("Set QA_CAMPUSES_DATABASE_URL to the explicitly selected database.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await prisma.$transaction(async tx => {
    const organization = await tx.organization.findUnique({ where: { slug: orgSlug } });
    if (!organization || organization.status !== "ACTIVE") throw new Error("An existing active organization is required.");
    if (apply) {
      const actor = actorId ? await tx.user.findUnique({ where: { id: actorId } }) : null;
      if (!actor || actor.platformRole !== "ADMIN" || actor.status !== "ACTIVE") {
        throw new Error("Apply requires an existing active operator for the audit record.");
      }
    }
    const existing = await tx.academy.findMany({ where: { organizationId: organization.id } });
    const plan = campuses.map(([suffix, name]) => {
      const slug = `dlab-${suffix}`;
      const matches = existing.filter(academy => academy.slug === slug || academy.name === name);
      if (matches.length > 1) throw new Error(`Ambiguous campus: ${name}; reconcile existing records first.`);
      const match = matches[0];
      if (match && (match.status !== "ACTIVE" || match.kind !== "ACADEMY")) {
        throw new Error(`Existing campus ${name} is not an active academy; no automatic reactivation.`);
      }
      return { name, slug, existing: match?.id };
    });
    for (const item of plan) {
      console.log(`${item.existing ? "KEEP" : apply ? "CREATE" : "WOULD CREATE"} ${item.name} (${item.slug})`);
      if (item.existing || !apply) continue;
      const created = await tx.academy.create({ data: {
        organizationId: organization.id, name: item.name, slug: item.slug,
        countryCode: "KR", timeZone: "Asia/Seoul",
      } });
      await tx.academyFeatureFlag.createMany({ data: academyFeatureNames.map(feature => ({ academyId: created.id, feature, isEnabled: true })) });
      await tx.auditLog.create({ data: {
        actorUserId: actorId!, academyId: created.id, action: "platform.academy.created",
        targetType: "academy", targetId: created.id,
        after: { name: item.name, slug: item.slug }, reason: "ACCOUNT-001-S-014 QA campus import",
      } });
    }
    console.log(`${apply ? "Applied" : "Dry-run"}: ${plan.filter(item => !item.existing).length} missing campuses; existing records preserved.`);
  }, { isolationLevel: "Serializable", timeout: 30_000 });
} finally {
  await prisma.$disconnect();
}
