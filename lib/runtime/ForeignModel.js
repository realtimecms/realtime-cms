const Entity = require("./Entity.js")
const r = require.main.rethinkdb || require('rethinkdb')

class ForeignModel {

  constructor(definition, service) {
    this.serviceName = definition.serviceName
    this.modelName = definition.modelName
    this.service = service
    this.tableName = this.serviceName + "_" + this.modelName
    this.table = r.table( this.tableName )
  }

  async run(query) {
    return query.run(await this.service.db)
  }

  async get(id) {
    let req = this.table.get(id)
    let res = this.run(req)
    return res
  }

}

module.exports = ForeignModel
