module.exports = {
  headers: {
    type: "object",
    required: ["x-content-type"],
    properties: {
      "x-content-type": {
        enum: ["application/x-www-form-urlencoded"],
      },
    },
  },

  body: {
    type: "object",
    // additionalProperties: false,
    properties: {
      foo: {
        type: "string",
        regexp: "/foo/i",
      },
      title: {
        type: "string",
        transform: ["trim", "toLowerCase"]
      },
    },
  },
}
