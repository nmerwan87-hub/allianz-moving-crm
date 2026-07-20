import { createCallerFactory } from "./init"
import { appRouter } from "./router"
import { createContext } from "./context"

const createCaller = createCallerFactory(appRouter)

export async function createServerCaller() {
  const ctx = await createContext()
  return createCaller(ctx)
}
