const { prepareParameters, processReturn } = require("./params.js")
const revs = require("rethink-event-sourcing")

class Action {

  constructor(definition, service) {
    this.definition = definition
    this.service = service
  }

  async runCommand(command, emit) {
    let parameters = command.parameters
    //console.log("PARAMETERS", JSON.stringify(parameters), "DEFN", this.definition.properties)
    let preparedParams = await prepareParameters(parameters, this.definition.properties, this.service)
    //console.log("PREP PARAMS", preparedParams)

    let resultPromise = this.definition.execute({
      ...parameters,
      ...preparedParams
    }, {
      action: this,
      service: this.service,
      client: command.client,
      command
    }, emit)

    resultPromise = resultPromise.then(async result => {
      let processedResult = await processReturn(result, this.definition.returns, this.service)
      return processedResult
    })
    resultPromise.catch(error => {
      console.error(`Action ${this.definition.name} error `, error)
    })
    return resultPromise
  }

  callCommand(parameters, clientData) {
    return revs.command(this.service.db, this.service, this.definition.name, {
      parameters,
      client: {
        sessionId: clientData.sessionId,
        ip: clientData.ip
      }
    })
  }

  async execute(parameters, clientData) {
    //console.log("PARAMETERS", JSON.stringify(parameters), "DEFN", this.definition.properties)
    let preparedParams = await prepareParameters(parameters, this.definition.properties, this.service)
    //console.log("PREP PARAMS", preparedParams)

    let resultPromise = this.definition.execute({
      ...preparedParams,
    }, {
      action: this,
      service: this.service,
      client: clientData
    })

    resultPromise = resultPromise.then(async result => {
      let processedResult = await processReturn(result, this.definition.returns, this.service)
      return processedResult
    })
    resultPromise.catch(error => {
      console.error(`Action ${this.definition.name} error `, error)
    })
    return resultPromise
  }
}

module.exports = Action