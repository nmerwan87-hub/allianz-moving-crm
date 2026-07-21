import { readFileSync } from "fs"
import { resolve } from "path"

// Load .env.local so SUPABASE_SERVICE_ROLE_KEY is present for integration tests.
// Vitest node environment does not auto-load .env.local from the project root.
try {
  const content = readFileSync(resolve(__dirname, "../../.env.local"), "utf8")
  for (const raw of content.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eqIdx = line.indexOf("=")
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
} catch {
  // .env.local not present — tests will be skipped via HAS_LOCAL_DB check
}
