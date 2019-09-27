const { prepareParameters, processReturn } = require("./params.js")

const { RethinkObservableList, RethinkObservableValue } = require("reactive-dao-rethinkdb")
const { ObservablePromiseProxy } = require("reactive-dao")

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

  async fetch(parameters, clientData) {
    const context = {
      service: this.service, client: clientData
    }
    parameters = await prepareParameters(parameters, this.definition.properties, this.service)
    return await this.definition.fetch(parameters, context)
  }

  observable(parameters, clientData) {
    if(!this.definition.read) {
      if(this.definition.observable) {
        const context = { service: this.service, client: clientData }
        return new ObservablePromiseProxy(
          prepareParameters(parameters, this.definition.properties, this.service).then(
              params => this.definition.observable(params, context)
          )
        )
      }
      if(this.definition.fetch) return new ObservablePromiseProxy(this.fetch(parameters, clientData))
    }
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
      if(!this.definition.rawRead) req = req.then(r=> r.changes({ includeInitial: true }))
      return (this.definition.observableFactory || observableValue)(
          this.service.dbPromise, req
      )
    }
  }

  async get(parameters, clientData) {
    if(this.definition.fetch && !this.definition.read) {
      return await this.fetch(parameters, clientData)
    }
    let req = await this.prepareRequest(parameters, clientData, 'get')
    let res = await req.run(this.service.db)
    if(!res) return res
    return res.toArray ? await res.toArray() : res
  }
}

module.exports = View
