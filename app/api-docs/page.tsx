import type { Metadata } from "next";
import { gerarOpenApi } from "@/lib/openapi";
import { ApiDocsView, type Spec } from "@/views/api-docs/api-docs-view";

export const metadata: Metadata = { title: "Documentação da API" };

/** /api-docs — referência navegável, gerada da mesma especificação servida em /api/openapi.json. */
export default function ApiDocsPage() {
  return <ApiDocsView spec={gerarOpenApi() as unknown as Spec} />;
}
