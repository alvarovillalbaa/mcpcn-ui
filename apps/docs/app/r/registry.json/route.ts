import registry from "../../../../../registry/registry.json";

export function GET() { return Response.json(registry); }
