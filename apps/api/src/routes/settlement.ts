import type { FastifyPluginAsync } from "fastify";
import {
  getAvailableSettlementYears,
  getSettlementByField,
  getSettlementBySido,
  getSettlementBySidoDetail,
  getSettlementByUnitDetail,
  getSettlementUnits,
} from "../services/settlementService.js";
import type { SettlementLevel } from "@repo/shared";

interface YearQuery {
  year?: number;
}

interface YearLevelQuery extends YearQuery {
  level?: SettlementLevel;
  sido?: string;
}

interface SidoParams {
  sido: string;
}

interface UnitParams {
  unitCode: string;
}

function parseYear(raw: number | undefined): number {
  if (raw && Number.isFinite(raw) && raw >= 1900 && raw <= 9999) {
    return raw;
  }
  // Settlement is published year-end, so default to previous year.
  return new Date().getFullYear() - 1;
}

const settlementRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /settlement/years
  fastify.get("/years", async (_request, reply) => {
    const years = await getAvailableSettlementYears();
    return reply.send({ years });
  });

  // GET /settlement/by-sido?year=
  fastify.get<{ Querystring: YearQuery }>(
    "/by-sido",
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
      const data = await getSettlementBySido(year);
      return reply.send(data);
    },
  );

  // GET /settlement/by-field?year=&level=METROPOLITAN|BASIC
  fastify.get<{ Querystring: YearLevelQuery }>(
    "/by-field",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
            level: { type: "string", enum: ["METROPOLITAN", "BASIC"] },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const level: SettlementLevel = request.query.level ?? "METROPOLITAN";
      const data = await getSettlementByField(year, level);
      return reply.send(data);
    },
  );

  // GET /settlement/sido/:sido?year=
  fastify.get<{ Params: SidoParams; Querystring: YearQuery }>(
    "/sido/:sido",
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
      const data = await getSettlementBySidoDetail(year, request.params.sido);
      return reply.send(data);
    },
  );

  // GET /settlement/units?year=&sido=
  fastify.get<{ Querystring: YearLevelQuery }>(
    "/units",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 1900, maximum: 9999 },
            sido: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const year = parseYear(request.query.year);
      const units = await getSettlementUnits(year, request.query.sido);
      return reply.send({ units });
    },
  );

  // GET /settlement/unit/:unitCode?year=
  fastify.get<{ Params: UnitParams; Querystring: YearQuery }>(
    "/unit/:unitCode",
    {
      schema: {
        params: {
          type: "object",
          required: ["unitCode"],
          properties: { unitCode: { type: "string", minLength: 1 } },
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
      const data = await getSettlementByUnitDetail(
        year,
        request.params.unitCode,
      );
      return reply.send(data);
    },
  );
};

export default settlementRoutes;
