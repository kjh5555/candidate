import type { FastifyPluginAsync } from "fastify";
import { getBillDetail } from "../services/billService.js";

interface BillParams {
  billId: string;
}

const billRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: BillParams }>(
    "/:billId",
    {
      schema: {
        params: {
          type: "object",
          required: ["billId"],
          properties: { billId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const detail = await getBillDetail(request.params.billId);
      if (!detail) {
        return reply.status(404).send({
          error: "BILL_NOT_FOUND",
          message: `Bill ${request.params.billId} not found`,
        });
      }
      return reply.send(detail);
    },
  );
};

export default billRoutes;
