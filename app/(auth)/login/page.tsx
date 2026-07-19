import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in — Bivro",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel — lg+ only */}
      <div className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex lg:w-1/2">
        <span className="text-xl font-semibold tracking-tight">Bivro</span>
        <div>
          <p className="text-3xl leading-snug font-bold">
            Moving operations,
            <br />
            intelligently.
          </p>
          <p className="mt-4 text-sm text-slate-400">
            The operating system built for professional moving companies.
          </p>
        </div>
        <p className="text-xs text-slate-500">© 2026 Bivro. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="mb-8 lg:hidden">
          <span className="text-xl font-semibold tracking-tight text-slate-900">Bivro</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Logging into <span className="font-medium text-slate-700">your workspace</span>
            </p>
          </div>

          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@yourcompany.com"
                className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
