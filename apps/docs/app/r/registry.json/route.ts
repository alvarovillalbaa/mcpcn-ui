import registry from "../../../../../registry/registry.json";

export const dynamic = "force-static";

export function GET() { return Response.json(registry); }
