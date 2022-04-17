import staticFiles from "https://deno.land/x/static_files@1.1.6/mod.ts";
import { join } from 'https://deno.land/std@0.115.1/path/mod.ts';
import type { Context } from "./lib/context.ts";

export default function serveStatic(...path: string[]) {
  return async ({ requestEvent, next }: Context) => {
    await staticFiles(join(...path))(requestEvent, null, next);
  };
}
