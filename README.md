# Bed

Bed is a simple, opinionated library for writing RESTful APIs for Deno. It comes with several optional add-ons and does allow for custom configuration, if you are handy with the Deno HTTP API.

## Core

The core export (`/core.ts`) is the `Server` class. Start a server like so:

```ts
import { Server } from 'bed/core.ts';
import handlers from './api.ts';

const server = new Server(handlers);
await server.listen(8080);
```

`handlers` should be a tree describing the routes, middleware, and endpoints of your server. Unlike more sophisticated server libraries like Express, Koa, or Oak, you cannot dynamically load middleware or endware after initializing a server -- the argument to `new Server` should fully specify the API.

Suppose we want to define four endpoints for our server: `GET /`, `GET /users`, `POST /users`, and `GET /users/admins`. We would then define our handlers like so:

```ts
// api.ts
import { GET, POST } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';

export default {
	[GET]: getRoot,
	users: {
		[GET]: getUsers,
		[POST]: postUser,
		admins: {
			[GET]: getAdmins
		}
	}
}
```

Endware funcs should be functions of type `(context: Context) => Promise<void>`, where `Context` is defined as:

```ts
interface Context {
	query: Record<string, unknown>
	params: Record<string, string>
	err: Error | null
	extras: Record<string, unknown> // middleware can attach arbitrary data here
	requestEvent: Deno.RequestEvent // the underlying request event
	server: Server // reference to the server
	get processedUrl(): {
		path: string[] // if the relative url is '/a/b/c', path === ['a', 'b', 'c']
		queryString: string
		pathString: string // relative url, get absolute url from requestEvent
		fullPathString: string // === `${pathString}?${queryString}`
	}

	getBody: () => Promise<unknown>
	next: (err?: Error) => Promise<void>

	res(): Promise<void> // sends 204, no data
	res(status: number)
	res(data: Sendable) // sends 200, with data
	res(status: number, data: Sendable)
}

type Sendable = string | boolean | null | (Sendable | number)[] | {
  [key: string]: (Sendable | number);
};
```

So an example handler might look like this:

```ts
// handlers/getUsers.ts
import type { Context } from 'bed/core.ts';
import userDbFunc from './models/Users';

export default async function getUsers({ query, res } : Context) {
	const users = await userDbFunc(query);
	await res(users);
}
```

For parametric routes, middleware, fallback handlers, error handling, body parsing, and customization see the following subsections.

### Parametric Routes

Here's how to add `GET /users/:userId` to our router.

```ts
// api.ts
import { GET, POST, PARAM, ALIAS } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';
import getUserDetail from './handlers/getUserDetail.ts';

export default {
	[GET]: getRoot,
	users: {
		[GET]: getUsers,
		[POST]: postUser,
		admins: {
			[GET]: getAdmins
		},
		[PARAM]: {
			[ALIAS]: "userId",
			[GET]: getUserDetail
		}
	}
}
```

And here's how to access the parametric value:

```ts
// handlers/getUsers.ts
import type { Context } from 'bed/core.ts';
import userDbFunc from './models/Users';

export default async function getUsers({ params: { userId }, res } : Context) {
	const users = await userDbFunc({ where: userId });
	await res(users);
}
```

### Middleware

To specify middleware for one specific endpoint, provide an array of functions instead of just one.

```ts
// api.ts
import { GET, POST } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';
import adminOnly from './handlers/auth/adminOnly.ts';

export default {
	[GET]: getRoot,
	users: {
		[GET]: [adminOnly, getUsers],
		[POST]: [adminOnly, postUser],
		admins: {
			[GET]: [adminOnly, getAdmins]
		}
	}
}
```

Like with other libraries, middleware should call `next` to pass control to other middleware or endware.

```ts
// handlers/auth/adminOnly.ts

export default function adminOnly({ res, next }: Context) {
	// ...authenticate somehow
	if (authenticated) {
		await next();
		await logActionsTakenByAdmin();
	} else {
		await res(401);
	}
}
```

We can improve on the example above, however, since we want to use the same middlware for all endpoints on the `/users` router:

```ts
// api.ts
import { GET, POST, USE } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';
import adminOnly from './handlers/auth/adminOnly.ts';

export default {
	[GET]: getRoot,
	users: {
		[USE]: [adminOnly],
		[GET]: getUsers,
		[POST]: postUser,
		admins: {
			[GET]: getAdmins
		}
	}
}
```

### Fallback Handlers

Bed does not support wildcard handlers, but you can define endpoints which will be accessed if no other endpoint matches. Let's add one such fallback handler to the routes we defined above:

```ts
// api.ts
import { GET, POST, FALLBACK } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';
import notFound from './handlers/notFound.ts';

export default {
	[GET]: getRoot,
	users: {
		[FALLBACK]: notFound,
		[GET]: getUsers,
		[POST]: postUser,
		admins: {
			[GET]: getAdmins
		}
	}
}
```

Our `notFound` handler will fire on any request whose relative url starts with `/users...` that is not defined, including anything that starts with `/users/admins...`, since we haven't defined a fallback handler specifically for the `admins` router. But a request to `/usres` will not hit our `notFound` handler since we did not attach it at the root level. (In this case, the default fallback handler will be used, which simply sends status 404 with no body.)

### Error Handling

Similar to fallback handlers, error handling endware can be defined for individual routers, or globally if attached to the root. Here we defined an error handler for the whole API:

```ts
// api.ts
import { GET, POST, ERROR } from 'bed/core.ts';

// import our endware funcs
import getRoot from './handlers/getRoot.ts';
import getUsers from './handlers/getUsers.ts';
import postUser from './handlers/postUser.ts';
import getAdmin from './handlers/getAdmin.ts';
import errorHandler from './handlers/error.ts';

export default {
	[ERROR]: errorHandler,
	[GET]: getRoot,
	users: {
		[GET]: getUsers,
		[POST]: postUser,
		admins: {
			[GET]: getAdmins
		}
	}
}
```

```ts
// handlers/error.ts

export default function errorHandler({ err, res, processedUrl }: Context) {
	console.error(`There was an error at ${processedUrl.fullPathString}:`, err);
	res(500, err.message);
}
```

To use error handling endware, simply throw an error from inside a handling function, and it will be passed in to the nearest error handling endware in the API tree. You can also call `next` passing in an error, but this will simply immediately throw the error, adding one extra call to the call stack.

```ts
// handlers/getUsers.ts
import type { Context } from 'bed/core.ts';
import userDbFunc from './models/Users';

export default async function getUsers({ query, res } : Context) {
	const users = await userDbFunc(query);
	if (!users.length) {
		throw new Error(`No users found for search ${JSON.stringify(query)}`);
	}
	await res(users);
}
```

The core module also exposes an `Error` subclass called `PublicError` which takes a status code argument. Throwing one of these errors will cause all error-handling to be bypassed and for the error message to be sent as the response with the attached status code.

```ts
// handlers/getUsers.ts
import type { Context } from 'bed/core.ts';
import { PublicError } from 'bed/core.ts';
import userDbFunc from './models/Users';

export default async function getUsers({ query, res } : Context) {
	const users = await userDbFunc(query);
	if (!users.length) {
		throw new PublicError(404, `No users found for search ${JSON.stringify(query)}`);
		// ^ equivalent to `return res(404, `No users found...`)`
	}
	await res(users);
}
```

Finally, if no error handler is loaded, by default any errors thrown from middleware or endware handlers result in a 500 response with no body.

### Body Parsing

By default, Bed parses request bodies as JSON. Access the body by calling `getBody`.

```ts
// handlers/postUser.ts
import type { Context } from 'bed/core.ts';
import createUserDb from './models/Users';

export default async function postUser({ getBody, res } : Context) {
	const body = await getBody();
	const newUser = await createUserDb(query);
	await res(users);
}
```

Note that parsing begins eagerly as soon as the request is recieved. But any errors (like if the body is not JSON) are deferred until `getBody` is called.

To disable JSON body parsing, pass an extra option to `new Server`.

```ts
import { Server } from 'bed/core.ts';
import handlers from './api.ts';

const server = new Server(handlers, { jsonBody: false });
await server.listen(8080);
```

### Customization

To customize the behavior of your Bed server, you can load middleware that that intercepts the raw `Deno.RequestEvent` before any processing (e.g., the creation of the context object that gets passed along). If this middleware returns true, it will short-circuit and undergo no further processing. If it returns false, it will be passed into the normal handling sequence.

```ts
import { Server } from 'bed/core.ts';
import handlers from './api.ts';
import { myLowLevelMiddleware } from './utils.ts'

const server = new Server(handlers, { prehandlers: [myLowLevelMiddleware] });
await server.listen(8080);
```

## Sockets

A small socket library is exposed from the `./socket.ts` module. It can be used for both front-end and back-end uses. The default export of this library is a function which takes a configuration object specifying the event handlers, and returns a prehandler/middleware which can be loaded into a Bed server.

```ts
// ./socketHandlers.ts

import { default as socketServer } from 'bed/socket.ts';

export default socketServer({
	sayHello: () => {
		console.log("hello!");
	}
})
```

Each handler function takes three arguments: A data argument,




Load it as a prehandler.

```ts
import { Server } from 'bed/core.ts';
import handlers from './api.ts';
import { myLowLevelMiddleware } from './utils.ts'

const server = new Server(handlers, { prehandlers: [myLowLevelMiddleware] });
await server.listen(8080);
```

## Static

## Logger

## Validator

