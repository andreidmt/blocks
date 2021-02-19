/* eslint-disable new-cap,no-sync */

const http = require("http")
const path = require("path")
const jwt = require("jsonwebtoken")
const { stringify } = require("qs")
const { describe } = require("riteway")
const { createReadStream, existsSync } = require("fs")
const {
  GET,
  PATCH,
  POST,
  MULTIPART,
  set: setHTTPProperties,
} = require("@asd14/fetch-node")

const { block } = require("../src")

const PORT = 4567
const API_URL = `http://localhost:${PORT}`

setHTTPProperties({
  // Prefix request urls with API_URL
  baseURL: API_URL,

  /**
   * Transform query object into string with `qs`
   *
   * @param   {object} source Request query object
   *
   * @returns {string}        String appended to the URL
   */
  queryStringifyFn: source =>
    stringify(source, {
      allowDots: true,
      encode: false,
      arrayFormat: "brackets",
      strictNullHandling: true,
    }),
})

describe("blocks :: init with defaults", async assert => {
  {
    const [middleware, plugins] = await block({
      plugins: [
        path.resolve(__dirname, "plugins", "good.js"),
        path.resolve(__dirname, "plugins", "error.js"),
      ],
      routes: [
        require("./routes/no-schema.route"),
        require("./routes/with-schema.route"),
        require("./routes/with-keywords.route"),
        require("./routes/no-authenticate.route"),
        require("./routes/no-authorize.route"),
        require("./routes/dont-authenticate.route"),
        require("./routes/dont-authorize.route"),
        require("./routes/authenticate-throws.route"),
        require("./routes/authorize-throws.route"),
        require("./routes/return-undefined.route"),
        require("./routes/upload.route"),
        require("./routes/custom-validator-fields.route"),
      ],
    })

    assert({
      given: "1 custom plugin",
      should: "load default plugins (Router, QueryParser) and custom",
      actual: Object.keys(plugins).sort(),
      expected: ["ErrorPlugin", "Good", "QueryParser", "Router"],
    })

    assert({
      given: "13 custom routes",
      should: "load default /ping and all custom",
      actual: plugins.Router.count(),
      expected: 13,
    })

    assert({
      given: "no custom middleware",
      should: "contain 9 middleware",
      actual: middleware.stack.length,
      expected: 9,
    })

    const server = http.createServer(middleware).listen(PORT, "localhost")

    assert({
      given: "default route /ping",
      should: "response with pong",
      actual: await GET(`${API_URL}/ping`).then(({ name, ping }) => ({
        name,
        ping,
      })),
      expected: { name: "blocks", ping: "pong" },
    })

    assert({
      given: "route with custom validator in schema and valid req data",
      should: "respond with mirrored data",
      actual: await PATCH(
        `${API_URL}/custom-validator/f81d4fae-7dec-11d0-a765-00a0c91e6bf6`,
        {
          query: {
            email: "foo@bar.com",
          },
          body: {
            thumbnailURL: "https://foo.bar.com",
            createdAt: "2021-01-29T09:50:31.840Z",
          },
        }
      ),
      expected: {
        params: {
          id: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
        },
        query: {
          email: "foo@bar.com",
        },
        body: {
          thumbnailURL: "https://foo.bar.com",
          createdAt: "2021-01-29T09:50:31.840Z",
        },
      },
    })

    assert({
      given: "route path does not exist",
      should: "return 404",
      actual: await GET(`${API_URL}/not-exist`).catch(({ status, body }) => ({
        status,
        body,
      })),
      expected: {
        status: 404,
        body: {
          error: "NotFoundError",
          message: "Endpoint GET:/not-exist not found",
        },
      },
    })

    assert({
      given: "route without isAuthenticated defined",
      should: "return 401",
      actual: await GET(`${API_URL}/no-authenticate`).catch(
        ({ status, body }) => ({
          status,
          body,
        })
      ),
      expected: {
        status: 401,
        body: {
          error: "AuthenticationError",
          message: "Need to be authenticated to access resource",
        },
      },
    })

    assert({
      given: "route without isAuthorized defined",
      should: "return 403",
      actual: await GET(`${API_URL}/no-authorize`).catch(
        ({ status, body }) => ({
          status,
          body,
        })
      ),
      expected: {
        status: 403,
        body: {
          error: "AuthorizationError",
          message: "Need permission to access resource",
        },
      },
    })

    assert({
      given: "route isAuthenticated returns false",
      should: "return 401",
      actual: await GET(`${API_URL}/dont-authenticate`).catch(
        ({ status, body }) => ({
          status,
          body,
        })
      ),
      expected: {
        status: 401,
        body: {
          error: "AuthenticationError",
          message: "Need to be authenticated to access resource",
        },
      },
    })

    assert({
      given: "route isAuthenticated throws error",
      should: "return 401",
      actual: await GET(`${API_URL}/is-authenticated-throws`).catch(
        ({ status, body }) => ({
          status,
          body,
        })
      ),
      expected: {
        status: 401,
        body: {
          error: "AuthenticationError",
          message: "Trololo",
        },
      },
    })

    assert({
      given: "accept app/json on route that returns undefined",
      should: "return empty JSON object",
      actual: await GET(`${API_URL}/return-undefined`, {
        headers: {
          Accepts: "application/json",
        },
      }),
      expected: {},
    })

    assert({
      given: "accept text/plain on route that returns undefined",
      should: "return empty JSON object",
      actual: await GET(`${API_URL}/return-undefined`, {
        headers: {
          Accept: "text/plain",
        },
      }),
      expected: "",
    })

    assert({
      given: "route that returns null",
      should: "return empty JSON object",
      actual: await GET(`${API_URL}/return-undefined`),
      expected: {},
    })

    assert({
      given: "form encoded body and content type",
      should: "parse body with qs",
      actual: await POST(`${API_URL}/with-schema/mutant?v=1`, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "parsed=with%20qs&another=value",
      }),
      expected: {
        message: "Hello Plugin World!",
        params: { name: "mutant" },
        query: { v: 1 },
        body: { parsed: "with qs", another: "value" },
      },
    })

    assert({
      given: "form encoded with custom keywords",
      should: "validate input",
      actual: await POST(`${API_URL}/with-keywords`, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "title=%20UP%20CASED%20&foo=foobar",
      }),
      expected: {
        message: "Hello Plugin World!",
        query: {},
        params: {},
        body: { foo: "foobar", title: "up cased" },
      },
    })

    assert({
      given: "multipart/form-data with file field",
      should: "upload and save file localy",
      actual: await MULTIPART(`${API_URL}/upload`, {
        body: {
          field: "testField",
          file: createReadStream(`${__dirname}/index.js`),
        },
      }).then(({ file }) => existsSync(file)),
      expected: true,
    })

    server.close()
  }

  {
    process.env.JWT_SECRET = "testing"

    const [middleware] = await block({
      routes: [require("./routes/with-jwt.route")],
    })
    const server = http.createServer(middleware).listen(PORT, "localhost")

    assert({
      given: "invalid jwt in request headers",
      should: "return 401",
      actual: await GET(`/with-jwt`, {
        headers: {
          Authorization: "invalid-jwt",
        },
      }).catch(({ status, body }) => ({
        status,
        body,
      })),
      expected: {
        status: 401,
        body: {
          error: "AuthenticationError",
          message: "jwt malformed",
        },
      },
    })

    assert({
      given: "valid jwt in request headers",
      should: "verify, parse and expose content to route action",
      actual: await GET(`/with-jwt`, {
        headers: {
          Authorization: jwt.sign(
            { foo: "bar", jti: "id-123" },
            process.env.JWT_SECRET
          ),
        },
      }),
      expected: {
        foo: "bar",
        jti: "id-123",
      },
    })

    server.close()
  }
})
