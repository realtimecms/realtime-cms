const Entity = require("./Entity.js")
const r = require.main.rethinkdb || require('rethinkdb')

class Model {

  constructor(definition, service) {
    this.service = service
    this.definition = definition
    this.tableName = service.name + "_" + this.definition.name
    this.table = r.table( this.tableName )
    this.changeListeners = this.definition.onChange || []
  }

  async run(query) {
    return query.run(await this.service.db)
  }

  async entity(id, fetchData) {
    let entity = new Entity(this, id)
    if(fetchData) await entity.get()
    return entity
  }

  async get(id) {
    let req = this.table.get(id)
    let res = this.run(req)
    return res
  }

  async update(id, data, options) {
    let req = this.table.get(id).update(data, {...options, returnChanges: true})
    let res = await this.run(req)
    await this.handleChanges(res.changes)
    let newData = res.changes[0] && res.changes[0].new_val
    return newData
  }

  async delete(id, options) {
    id = id.id || id
    let res = await this.run(this.table.get(id).delete({ ...options, returnChanges: true}))
    await this.handleChanges(res.changes)
  }

  async create(data, options) {
    //console.log("CREATE", this.definition.name, data)
    let prepData = {...data}
    for(let key in this.definition.properties) {
      if(!prepData.hasOwnProperty(key)) {
        let prop = this.definition.properties[key]
        if (prop.hasOwnProperty('defaultValue')) {
          prepData[key] = prop.defaultValue
        }
      }
    }
    //console.log("CREATE PREP DATA", prepData)
    let result = await this.run(this.table.insert(prepData, { ...(options || {}) }))
    let entity = new Entity(this, data.id || result.generated_keys[0])
    prepData.id = entity.id
    entity.data = prepData
    this.handleChanges([
      { new_val: prepData }
    ])
    return entity
  }

  async handleChanges(changes) {
    //console.trace("HANDLE CHANGES", changes)
    for(let change of changes) {
      let id = (change.old_val && change.old_val.id) || (change.new_val && change.new_val.id)
      console.log("CHANGE LISTENERS", this.changeListeners)
      for(let listener of this.changeListeners) await listener(id, change.old_val, change.new_val, change)
    }
  }


}

module.exports = Model
