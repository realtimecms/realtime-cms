const { prepareParameters, processReturn } = require("./params.js")

const { RethinkObservableList, RethinkObservableValue } = require("reactive-dao-rethinkdb")

function observableList(...args) { return new RethinkObservableList(...args) }
function observableValue(...args) { return new RethinkObservableValue(...args) }

class View {
  constructor(definition, service) {
    this.service = service
    this.definition = definition
    this.name = definition.name
  }

  async prepareRequest(parameters, clientData, queryType) {
    const context = {
      service: this.service, client: clientData
    }
    //console.log("PARAMETERS", JSON.stringify(parameters), "DEFN", this.definition.properties)
    parameters = await prepareParameters(parameters, this.definition.properties, this.service)
    //console.log("PREPARED PARAMETERS", parameters)
    return await this.definition.read(parameters, context, queryType, this.service)
  }

  observable(parameters, clientData) {
    let req = this.prepareRequest(parameters, clientData, 'observable')
    let returnsDef = this.definition.returns
    if(returnsDef.type == Array) {
      let elementDef = returnsDef.type.of
      let idField = elementDef.idField || 'id'
      if(!this.definition.rawRead)
        req = req.then(r=> r.changes({ includeInitial: true, includeStates: true }))
      return (this.definition.observableFactory || observableList)(
          this.service.dbPromise, req,
          elementDef.idOnly ? null : idField,
          this.definition.maxLength
      )
    } else {
      if(!this.definition.rawRead) req.then(r=> r.changes({ includeInitial: true }))
      return (this.definition.observableFactory || observableValue)(
          this.service.dbPromise, req
      )
    }
  }

  get(parameters, clientData) {
    let req = this.prepareRequest(parameters, clientData, 'get')
    let res = req.run(this.service.db)
    return res
  }
}

module.exports = View
