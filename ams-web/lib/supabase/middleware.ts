import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { NAV_MODULES, ALWAYS_ACCESSIBLE_HREFS } from "@/lib/nav-items";
import { fetchWithTimeout } from "./fetch-with-timeout";

// Given a request path, finds which sidebar module (if any) it belongs to
// — the longest-matching href wins, same rule components/sidebar.tsx uses
// to decide which nav item is "active" (so e.g. /assets/scan resolves to
// "Scan Asset", not the more general "Assets" module it's also a prefix
// match for). No match at all (e.g. /profile, /login) means nothing here
// can ever block it — hidden_modules only ever restricts an actual sidebar
// module, never an unrelated route.
function matchModule(pathname: string) {
  return NAV_MODULES.filter((m) => pathname.startsWith(m.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

// Refreshes the Supabase auth session on every request, redirects
// signed-out users to /login, and — User Access (schema_step44.sql) —
// blocks a signed-in user from reaching any module a Super Admin has
// specifically hidden from them via hidden_modules. This is the actual
// enforcement point, not just cosmetic sidebar hiding: someone who already
// knows a hidden module's direct URL gets redirected here too, not just
// left without a link to click. Called from the root middleware.ts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const pathname = request.nextUrl.pathname;
    const matched = ALWAYS_ACCESSIBLE_HREFS.includes(pathname) ? undefined : matchModule(pathname);

    if (matched && !ALWAYS_ACCESSIBLE_HREFS.includes(matched.href)) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, hidden_modules")
        .eq("id", user.id)
        .single();

      // super_admin is never subject to hidden_modules at all — there's
      // normally only one, and app/user-access excludes Super Admin rows
      // from the UI entirely, so this row should always be empty for them,
      // but skip explicitly anyway rather than trust that invariant holds.
      const isBlocked =
        profile?.role !== "super_admin" && (profile?.hidden_modules ?? []).includes(matched.href);

      if (isBlocked) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "?access_denied=1";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
