import registry from "../../../../../registry/registry.json";

export async function GET(_:Request,{params}:{params:Promise<{name:string}>}) {
  const name=(await params).name.replace(/\.json$/,"").toLowerCase();
  if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) return Response.json({error:"Registry item not found"},{status:404});
  const item=registry.items.find(item=>item.name===name || item.type==="registry:ui" && item.title.toLowerCase()===name);
  if(!item) return Response.json({error:"Registry item not found"},{status:404});
  return Response.json(item);
}
