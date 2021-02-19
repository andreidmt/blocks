/* eslint-disable promise/no-nesting */

const debug = require("debug")("blocks:RouterPlugin")
const Ajv = require("ajv").default
const addFormats = require("ajv-formats")
const addKeywords = require("ajv-keywords")
const { pathToRegexp } = require("path-to-regexp")
const {
  count,
  reduce,
  findWith,
  merge,
  pluck,
  is,
  isEmpty,
} = require("@asd14/m")

const { InputError } = require("../errors/input")
const { AuthenticationError } = require("../errors/authentication")
const { AuthorizationError } = require("../errors/authorization")
const { NotFoundError } = require("../errors/not-found")

module.exports = {
  create: () => {
    const ALL_ERRORS = process.env.AJV_ALL_ERRORS
    const COERCE_TYPES = process.env.AJV_COERCE_TYPES
    const USE_DEFAULTS = process.env.AJV_USE_DEFAULTS

    const ajv = new Ajv({
      allErrors: is(ALL_ERRORS) ? ALL_ERRORS === "true" : true,
      coerceTypes: is(COERCE_TYPES) ? COERCE_TYPES === "true" : true,
      useDefaults: is(USE_DEFAULTS) ? USE_DEFAULTS === "true" : true,
    })

    addFormats(ajv, {
      formats: [
        "date",
        "time",
        "date-time",
        "duration",
        "email",
        "uuid",
        "uri",
        "ipv4",
        "ipv6",
        "regex",
      ],
    })

    addKeywords(ajv)

    const defaultRouteSchema = require("./route-default.schema")
    const routes = []

    return {
      count: () => count(routes),

      /**
       * Searches for the first match.
       *
       * @param   {object} arg1          Props
       * @param   {string} arg1.method   HTTP method
       * @param   {string} arg1.pathname URL pathname
       *
       * @returns {object}
       */
      find: ({ method, pathname }) => {
        const route = findWith(
          {
            method,
            pathRegExp: field => field.test(pathname),
          },
          {},
          routes
        )

        if (isEmpty(route)) {
          throw new NotFoundError(`Endpoint ${method}:${pathname} not found`)
        }

        const parametersList = route.pathRegExp.exec(pathname)
        const parameters = reduce(
          (accumulator, item, index) => ({
            ...accumulator,
            [item.name]: parametersList[index + 1],
          }),
          {},
          route.pathParamsKeys
        )

        return {
          route,
          params: parameters,
        }
      },

      /**
       * @param   {object}    props
       * @param   {string}    props.method
       * @param   {string}    props.path
       * @param   {object}    props.schema
       * @param   {Function}  props.authenticate
       * @param   {Function}  props.authorize
       *
       * @returns {undefined}
       */
      add: ({
        method = "GET",
        path,
        schema = {},
        authenticate,
        authorize,
        ...rest
      }) => {
        const keys = []

        debug(`Loading ${method}: ${path}`)

        routes.push({
          method,
          path,
          schema,
          authenticate,
          authorize,
          ...rest,
          pathParamsKeys: keys,
          pathRegExp: pathToRegexp(path, keys),
          validate: ajv.compile({
            type: "object",
            properties: merge(
              defaultRouteSchema,
              pluck(["headers", "params", "query", "body"])(schema)
            ),
          }),
        })
      },

      /**
       * { function_description }
       *
       * @param   {object} arg1       The argument 1
       * @param   {object} arg1.route The route
       * @param   {object} arg1.req   The request
       *
       * @returns {object}
       */
      answer: ({ route, req }) => {
        // Input validation check
        if (
          !route.validate({
            headers: req.headers,
            params: req.ctx.params,
            query: req.ctx.query,
            body: req.ctx.body,
          })
        ) {
          throw new InputError("Invalid request data", {
            fieldErrors: route.validate.errors,
          })
        }

        return (
          Promise.resolve()
            // Authentication
            .then(() =>
              Promise.resolve()
                .then(() => route.authenticate(req))
                .catch(error => {
                  throw new AuthenticationError(error.message, error.details)
                })
            )
            .then(isAuthenticated => {
              if (isAuthenticated === false) {
                throw new AuthenticationError()
              }
            })
            // Authorization
            .then(() =>
              Promise.resolve()
                .then(() => route.authorize(req))
                .catch(error => {
                  throw new AuthorizationError(error.message, error.details)
                })
            )
            .then(isAuthorized => {
              if (isAuthorized === false) {
                throw new AuthorizationError()
              }
            })
            // Route business logic
            .then(() => route.action(req))
            .then(payload => ({
              status: req.method === "POST" ? 201 : 200,
              payload,
            }))
        )
      },
    }
  },
}
