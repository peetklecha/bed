import { getCookies, setCookie } from 'https://deno.land/std@0.125.0/http/cookie.ts'
import type { Handler } from "./lib/types.ts";

const processCookies : Handler = ctx => {
	const cookies = getCookies(ctx.requestEvent.request.headers);
	ctx.cookies = cookies;
	ctx.next();
}
