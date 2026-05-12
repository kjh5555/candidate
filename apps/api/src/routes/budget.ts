import type { FastifyPluginAsync } from "fastify";
import {
  getAvailableYears,
  getMetropolitanBudgetByField,
  getMetropolitanBudgetBySido,
  getNationalBudgetByField,
  getNationalBudgetByMinistry,
  getNationalBudgetByMinistryAndField,
} from "../services/budgetService.js";
import type { BudgetLevel } from "@repo/shared";

interface YearsQuery {
  level?: BudgetLevel;
}

interface YearQuery {
  year?: number;
}

interface MinistryParams {
  ministry: string;
}

interface SidoParams {
  sido: string;
}

function parseYear(raw: number | undefined): number {
  if (raw && Number.isFinite(raw) && raw >= 1900 && raw <= 9999) {
    return raw;
  }
  // Fall back to current year if not provided.
  return new Date().getFullYear();
}

const budgetRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /budget/years?level=NATIONAL|METROPOLITAN
  fastify.get<{ Querystring: YearsQuery }>(
    "/years",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["NATIONAL", "METROPOLITAN"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { level = "NATIONAL" } = request.query;
      const years = await getAvailableYears(level);
      return reply.send({ years });
    },
  );

  // GET /budget/national/by-field?year=2024
  fastify.get<{ Querystring: YearQuery }>(
    "/national/by-field",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const data = await getNationalBudgetByField(year);
      return reply.send(data);
    },
  );

  // GET /budget/national/by-ministry?year=2024
  fastify.get<{ Querystring: YearQuery }>(
    "/national/by-ministry",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const data = await getNationalBudgetByMinistry(year);
      return reply.send(data);
    },
  );

  // GET /budget/national/ministry/:ministry?year=2024
  fastify.get<{ Params: MinistryParams; Querystring: YearQuery }>(
    "/national/ministry/:ministry",
    {
      schema: {
        params: {
          type: "object",
          required: ["ministry"],
          properties: { ministry: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const data = await getNationalBudgetByMinistryAndField(
        year,
        request.params.ministry,
      );
      return reply.send(data);
    },
  );

  // GET /budget/metropolitan/by-sido?year=2024
  fastify.get<{ Querystring: YearQuery }>(
    "/metropolitan/by-sido",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const data = await getMetropolitanBudgetBySido(year);
      return reply.send(data);
    },
  );

  // GET /budget/metropolitan/sido/:sido?year=2024
  fastify.get<{ Params: SidoParams; Querystring: YearQuery }>(
    "/metropolitan/sido/:sido",
    {
      schema: {
        params: {
          type: "object",
          required: ["sido"],
          properties: { sido: { type: "string", minLength: 1 } },
        },
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const data = await getMetropolitanBudgetByField(
        year,
        request.params.sido,
      );
      return reply.send(data);
    },
  );
};

export default budgetRoutes;
