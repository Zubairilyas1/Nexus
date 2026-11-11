import { proxyToBackend } from "@/lib/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { path: string[] } };

async function handle(request: Request, { params }: Context) {
  return proxyToBackend(request, `/api/${params.path.join("/")}`);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH };
export { handle as DELETE, handle as HEAD, handle as OPTIONS };
