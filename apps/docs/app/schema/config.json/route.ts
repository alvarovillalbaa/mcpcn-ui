import { configSchema } from "@mcpcn/registry/installation";

export function GET() {
  return Response.json(configSchema);
}
