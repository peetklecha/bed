import { getCookies, setCookie, Cookie } from 'https://deno.land/std@0.125.0/http/cookie.ts'
import type { Handler, Sendable } from "./lib/types.ts";
import type { Context } from './lib/context.ts';

export interface CookiesContext {
	cookies: Record<string, string>
	addCookie: (cookie: Cookie) => void;
	outgoingCookies: Cookie[]
 }

export const cookies : Handler<Context & CookiesContext> = async ctx => {
	const cookies = getCookies(ctx.requestEvent.request.headers);
	ctx.cookies = cookies;
	ctx.outgoingCookies = [];
	ctx.addCookie = (cookie: Cookie) => {
		ctx.outgoingCookies.push(cookie);
	}
	const { res, redirect, next } = ctx;
	ctx.res = (first?: number | Sendable, second?: Sendable, responseParams?: Partial<ResponseInit>) => {
		const headers = new Headers(responseParams?.headers);
		for (const cookie of ctx.outgoingCookies) setCookie(headers, cookie);
		return res(first, second, { ...responseParams, headers });
	};
	ctx.redirect = (url: string, responseParams?: Partial<ResponseInit>) => {
		const headers = new Headers(responseParams?.headers);
		for (const cookie of ctx.outgoingCookies) setCookie(headers, cookie);
		return redirect(url, { ...responseParams, headers });
	};
	await next();
}
