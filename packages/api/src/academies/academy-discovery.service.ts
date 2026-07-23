import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class AcademyDiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForSignup() {
    const academies = await this.prisma.academy.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return { academies };
  }
}
