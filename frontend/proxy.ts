import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the `middleware` convention to `proxy`, and the exported
 * function must be named `proxy`.
 */
export async function proxy(request: NextRequest) {
  console.log("[proxy] invoked for", request.nextUrl.pathname);
  const response = await updateSession(request);
  console.log("[proxy] response status", response.status, response.headers.get("location"));
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, so auth logic never blocks CSS or images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
