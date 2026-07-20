import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/lib/trpc/router"
import { createContext } from "@/lib/trpc/context"

const isDev = process.env["NODE_ENV"] === "development"

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(),
    ...(isDev && {
      onError({ path, error }: { path: string | undefined; error: Error }) {
        console.error(`[tRPC] ${path ?? "unknown"}: ${error.message}`)
      },
    }),
  })

export { handler as GET, handler as POST }
