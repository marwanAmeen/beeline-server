/* eslint-disable new-cap */
/* eslint-disable guard-for-in */

const _ = require("lodash")
const auth = require("../core/auth")
const jwt = require("jsonwebtoken")
const Joi = require("joi")
const Boom = require("boom")
const assert = require("assert")
const Request = require("request")

module.exports = (server, options, next) => {
  server.route({
    method: "POST",
    path: "/downloads",
    config: {
      description:
        "Creates a download link that is valid for a short time (10mins)",
      tags: ["api", "admin"],
      validate: {
        payload: {
          uri: Joi.string().required(),
        },
      },
    },
    async handler(request, reply) {
      try {
        // Get the token
        const token = request.headers.authorization.split(" ")[1]
        const tokenPayload = auth.checkToken(token)

        assert(!tokenPayload.noExtend)

        // disallow anyone from extending the validity of the token
        tokenPayload.noExtend = true
        tokenPayload.uri = request.payload.uri

        const temporaryToken = jwt.sign(
          _.omit(tokenPayload, ["exp", "iat"]),
          auth.secretKey,
          {
            expiresIn: "10m",
          }
        )

        return reply({
          token: temporaryToken,
        })
      } catch (err) {
        console.error(err.stack)
        reply(Boom.badImplementation())
      }
    },
  })

  server.route({
    method: "GET",
    path: "/downloads/{token}",
    config: {
      tags: ["api", "admin"],
      validate: {
        params: {
          token: Joi.string(),
        },
      },
    },
    async handler(request, reply) {
      try {
        const t = jwt.decode(request.params.token)

        // leave the verification to the injected function
        Request({
          url: `http://127.0.0.1:${request.connection.info.port}${t.uri}`,
          headers: {
            authorization: `Bearer ${request.params.token}`,
          },
        })
          .on("response", http => {
            const { PassThrough } = require("stream")
            const response = reply(http.pipe(new PassThrough()))
            for (let header in http.headers) {
              response.header(header, http.headers[header])
            }
          })
          .on("error", err => {
            console.error(err)
            reply(Boom.boomify(err))
          })
      } catch (err) {
        console.error(err.stack)
        reply(Boom.badImplementation())
      }
    },
  })

  next()
}

module.exports.attributes = {
  name: "download",
}
