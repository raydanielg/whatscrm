import { createFileRoute } from "@tanstack/react-router";
import { BRAND_NAME } from "@/lib/branding/brand";
import { getPlatformBranding } from "@/lib/admin/platform-branding.functions";

const spec = {
  openapi: "3.1.0",
  info: {
    title: `${BRAND_NAME} Public API`,
    version: "1.0.0",
    description: `Enterprise REST API for ${BRAND_NAME}. All endpoints require a Bearer API key with the correct scope. Responses follow the JSON:API-inspired envelope { data, meta, errors }.`,
    contact: { name: `${BRAND_NAME} Support` },
    license: { name: "Proprietary" },
  },
  servers: [{ url: "/api/public/v1", description: "Production v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string" },
                code: { type: "string" },
                title: { type: "string" },
              },
            },
          },
          meta: { type: "object", properties: { request_id: { type: "string" } } },
        },
      },
      Contact: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          whatsapp_number: { type: "string" },
          company: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/contacts": {
      get: {
        summary: "List contacts",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OK" },
          "401": { description: "Unauthorized" },
          "429": { description: "Rate limited" },
        },
      },
      post: {
        summary: "Create a contact",
        responses: {
          "201": { description: "Created" },
          "422": { description: "Validation error" },
        },
      },
    },
    "/conversations": {
      get: { summary: "List conversations", responses: { "200": { description: "OK" } } },
    },
    "/messages": {
      post: {
        summary: "Send / queue an outbound message",
        responses: { "202": { description: "Queued" }, "422": { description: "Validation error" } },
      },
    },
    "/deals": {
      get: { summary: "List deals", responses: { "200": { description: "OK" } } },
      post: { summary: "Create a deal", responses: { "201": { description: "Created" } } },
    },
  },
} as const;

export const Route = createFileRoute("/api/public/v1/openapi")({
  server: {
    handlers: {
      GET: async () => {
        const { platformName } = await getPlatformBranding();
        const body = JSON.stringify(spec).replaceAll(BRAND_NAME, platformName);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
