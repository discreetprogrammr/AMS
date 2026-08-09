import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { error } = searchParams;

  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{
          backgroundColor: "#050a16",
          backgroundImage:
            "radial-gradient(ellipse 55% 50% at 8% -5%, rgba(37,99,235,0.28), transparent 60%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "auto, 44px 44px, 44px 44px",
        }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="HorizonCare360"
            className="h-14 w-auto rounded-xl bg-white p-2"
          />
          <div>
            <p className="text-base font-bold leading-tight text-ink">
              HorizonCare360
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              By Pacific Horizon Tek
            </p>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-ink">
            Every unit. Every brand.
            <br />
            Every angle covered.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-ink-soft">
            OEM-independent lifecycle asset management for NII &amp;
            detection equipment. One accountable partner, from calibration to
            compliance.
          </p>
        </div>

        <p className="text-xs uppercase tracking-widest text-slate-600">
          Pacific Horizon Tek Inc. · Bonifacio Global City · Taguig
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-base p-8">
        <form action={login} className="w-full max-w-sm space-y-5">
          <div className="mb-2 flex items-center gap-3 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt="HorizonCare360"
              className="h-10 w-auto rounded-lg bg-white p-1.5"
            />
            <p className="text-base font-bold text-ink">HorizonCare360</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              HorizonCare360 Portal
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Access your fleet, service history, and SLA reporting.
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Work Email
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="mt-1.5 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-ink-soft">
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-hairline bg-surface-2 accent-blue-600"
              />
              Remember me
            </label>
            {/* Not wired to a real reset flow yet — say so instead of
                shipping a dead link. */}
            <span
              title="Password reset isn't built yet — ask a staff admin to reset it in Supabase for now."
              className="cursor-not-allowed text-slate-600"
            >
              Forgot password?
            </span>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Sign in to HorizonCare360
          </button>

          <p className="text-center text-xs text-slate-600">
            Protected environment · Role-based access control
          </p>
        </form>
      </div>
    </div>
  );
}
