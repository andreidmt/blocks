/* eslint-disable no-sync,new-cap */

import http from "http"
import path from "path"
import fs from "fs"
import { describe } from "riteway"

import { GET, POST, FORM_DATA } from "./http.lib"
import { block } from "../src"

describe("blocks :: init with defaults", async assert => {
  const [middleware, plugins] = await block({
    plugins: [path.resolve(__dirname, "plugins", "good.js")],
    routes: [
      require("./routes/no-schema.route"),
      require("./routes/with-schema.route"),
      require("./routes/no-allow.route"),
      require("./routes/return-undefined.route"),
      require("./routes/upload.route"),
    ],
  })

  assert({
    given: "1 custom plugin",
    should: "load default plugins (Router, QueryParser) and custom",
    actual: Object.keys(plugins).sort(),
    expected: ["Good", "QueryParser", "Router"],
  })

  assert({
    given: "5 custom routes",
    should: "load default /ping and custom",
    actual: plugins.Router.count(),
    expected: 6,
  })

  assert({
    given: "no custom middleware",
    should: "contain 9 middleware",
    actual: middleware.stack.length,
    expected: 9,
  })

  const PORT = 4567
  const API_URL = `http://localhost:${PORT}`
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
        code: 404,
        message: "Endpoint GET:/not-exist not found",
        details: {
          method: "GET",
          pathname: "/not-exist",
        },
      },
    },
  })

  assert({
    given: "route that returns undefined",
    should: "return empty JSON object",
    actual: await GET(`${API_URL}/return-undefined`),
    expected: {},
  })

  assert({
    given: "form encoded body and content type",
    should: "parse body with qs",
    actual: await POST(`${API_URL}/with-schema/mutant`, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "parsed=with%20qs&another=value",
    }),
    expected: {
      message: "Hello Plugin World!",
      params: { name: "mutant" },
      query: {},
      body: { parsed: "with qs", another: "value" },
    },
  })

  assert({
    given: "form data with file field",
    should: "upload and save file localy",
    actual: await FORM_DATA(`${API_URL}/upload`, {
      body: {
        field: "testField",
        file: fs.createReadStream(`${__dirname}/index.js`),
      },
    }).then(({ file }) => fs.existsSync(file)),
    expected: true,
  })

  server.close()
})