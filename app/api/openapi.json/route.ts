import { gerarOpenApi } from "@/lib/openapi";

/** GET /api/openapi.json — especificação OpenAPI 3.1 (pública, como a documentação). */
export function GET() {
  return Response.json(gerarOpenApi(), { headers: { "Cache-Control": "public, max-age=300" } });
}
