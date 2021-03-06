let Joi = require("joi")
let common = require("../util/common")
let Boom = require("boom")

let getModels = common.getModels
let defaultErrorHandler = common.defaultErrorHandler

/**
 * Returns a Sequelize WHERE clause suited
 * for determining whether the user credentials
 * is authorized to make changes to the vehicle
 * @param {Number} id - the driver id
 * @param {Object} request - the HAPI request containing user credentials
 * @return {Object} the Sequelize query
 */
function authenticateAgent(id, request) {
  let m = getModels(request)
  let creds = request.auth.credentials

  let query = {
    where: {},
    include: [
      {
        model: m.Driver,
        // where: {
        //   $or: [ // role == 'admin' ==> company id must match
        //     request.auth.credentials.role != "admin",
        //     {transportCompanyId: creds.transportCompanyId}
        //   ]
        // }
      },
    ],
  }

  // if specific id was requested...
  if (id != null && id !== undefined) {
    query.where.id = id
  }

  query.where.$or = [
    request.auth.credentials.scope === "superadmin",
    request.auth.credentials.scope === "admin",
    {
      $and: [
        request.auth.credentials.scope === "driver",
        { driverId: creds.driverId },
      ],
    },
  ]

  return query
}

export const register = function register(server, options, next) {
  server.route({
    method: "GET",
    path: "/vehicles",
    config: {
      tags: ["api", "admin", "driver"],
      auth: { access: { scope: ["driver", "admin", "superadmin"] } },
    },
    handler: function(request, reply) {
      let m = common.getModels(request)

      m.Vehicle.findAll(authenticateAgent(null, request))
        .then(vehicles => {
          reply(vehicles.map(vehicle => vehicle.toJSON()))
        })
        .then(null, defaultErrorHandler(reply))
    },
  })

  server.route({
    method: "GET",
    path: "/vehicles/{id}",
    config: {
      tags: ["api", "admin", "driver"],
      description: "Get a vehicle",
      auth: { access: { scope: ["driver", "admin", "superadmin"] } },
      validate: {
        params: {
          id: Joi.number().integer(),
        },
      },
    },
    async handler(request, reply) {
      let m = common.getModels(request)

      try {
        let resp = await m.Vehicle.findOne(
          authenticateAgent(request.params.id, request)
        )
        if (resp) {
          reply(resp.toJSON())
        } else {
          reply(null)
        }
      } catch (err) {
        defaultErrorHandler(reply)(err)
      }
    },
  })

  /** Create a new vehicle **/
  server.route({
    method: "POST",
    path: "/vehicles",
    config: {
      tags: ["api", "admin", "driver"],
      auth: { access: { scope: ["driver", "admin", "superadmin"] } },
      validate: {
        payload: Joi.object({
          vehicleNumber: Joi.string(),
          driverId: Joi.number()
            .integer()
            .optional(),
        }),
      },
    },
    handler: async function(request, reply) {
      try {
        let m = getModels(request)

        if (request.auth.credentials.scope === "driver") {
          request.payload.driverId = request.auth.credentials.driverId
        } else {
          if (typeof request.payload.driverId === "undefined") {
            throw new Error("Must define driver ID")
          }
        }

        // check for existing vehicles with same number
        if (
          (await m.Vehicle.findOne({
            where: {
              vehicleNumber: request.payload.vehicleNumber,
              driverId: request.payload.driverId,
            },
          })) != null
        ) {
          throw new Error("Vehicle with this vehicle number already exists")
        }

        // otherwise create the vehicle
        let vehicle = await m.Vehicle.create(request.payload)
        reply(vehicle.toJSON())
      } catch (err) {
        console.error(err)
        reply(Boom.badRequest(err.message))
      }
    },
  })

  /* Update the vehicle name */
  server.route({
    method: "PUT",
    path: "/vehicles/{id}",
    config: {
      tags: ["api", "admin", "driver"],
      auth: { access: { scope: ["driver", "admin", "superadmin"] } },
      validate: {
        payload: Joi.object({
          vehicleNumber: Joi.string(),
          driverId: Joi.number()
            .integer()
            .optional(),
        }),
      },
    },
    handler: async function(request, reply) {
      try {
        let m = getModels(request)

        if (request.auth.credentials.role === "admin") {
          request.payload.driverId = request.auth.credentials.driverId
        }

        let result = await m.Vehicle.update(
          request.payload,
          authenticateAgent(request.params.id, request)
        )

        if (result[0] === 0) {
          return reply(Boom.notFound())
        }

        reply((await m.Vehicle.findById(request.params.id)).toJSON())
      } catch (err) {
        reply(Boom.badImplementation(err.message))
      }
    },
  })

  /* Delete */
  server.route({
    method: "DELETE",
    path: "/vehicles/{id}",
    config: {
      tags: ["api", "admin", "driver"],
      auth: { access: { scope: ["driver", "admin", "superadmin"] } },
      validate: {
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
      },
    },
    handler: async function(request, reply) {
      try {
        let m = getModels(request)

        let result = await m.Vehicle.destroy(
          authenticateAgent(request.params.id, request)
        )
        if (result[0] === 0) {
          return reply(Boom.notFound())
        } else {
          reply("")
        }
      } catch (err) {
        console.error(err)
        reply(Boom.badImplementation(err.message))
      }
    },
  })
  next()
}
register.attributes = {
  name: "endpoints-vehicles",
}
