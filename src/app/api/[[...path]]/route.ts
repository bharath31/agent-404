import { handleApiRequest } from "../../../lib/http/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function dispatch(request: Request, context: RouteContext): Promise<Response> {
	const { path = [] } = await context.params;
	return handleApiRequest(request, path);
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
