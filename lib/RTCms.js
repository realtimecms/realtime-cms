const ServiceDefinition = require("./definition/ServiceDefinition.js")

const Service = require("./runtime/Service.js")

const RTCMSDao = require("./runtime/Dao.js")
const ApiServer = require("./runtime/ApiServer.js")
const SessionApiServer = require("./runtime/SessionApiServer.js")

const utils = require("./utils.js")
const r = require('rethinkdb-reconnect')

const { Client: ElasticSearch } = require('@elastic/elasticsearch')

const crypto = require("crypto")

const reverseRelationProcessor = require("./processors/reverseRelation.js")
const indexListProcessor = require("./processors/indexList.js")
const crudGenerator = require("./processors/crudGenerator.js")
const draftGenerator = require("./processors/draftGenerator.js")
const accessControl = require("./processors/accessControl.js")
const autoValidation = require("./processors/autoValidation.js")
const searchIndex = require("./processors/searchIndex.js")
const autoSlice = require("./processors/autoSlice.js")

const rethinkDbUpdater = require("./updaters/rethinkdb.js")
const rethinkDbEventSourcingUpdater = require("./updaters/rethinkdbEventSourcing.js")
const elasticSearchUpdater = require("./updaters/elasticsearch.js")

const accessControlFilter = require("./clientSideFilters/accessControlFilter.js")
const clientSideFilter = require("./clientSideFilters/clientSideFilter.js")

class RTCms {

  constructor() {
    this.defaultProcessors = [
        crudGenerator,
        draftGenerator,
        reverseRelationProcessor,
        indexListProcessor,
        accessControl,
        autoValidation,
        autoSlice
    ]
    if(process.env.SEARCH_INDEX_PREFIX) this.defaultProcessors.push(searchIndex)
    this.defaultUpdaters = [
        rethinkDbUpdater,
        rethinkDbEventSourcingUpdater
    ]
    if(process.env.SEARCH_INDEX_PREFIX) this.defaultUpdaters.push(elasticSearchUpdater)
    this.defaultClientSideFilters = [
        accessControlFilter,
        clientSideFilter
    ]
    this.defaultPath = "."
  }

  connectToDatabase() {
    if(this.db) return this.db
    this.db = r.autoConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      db: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      timeout: process.env.DB_TIMEOUT
    })
    return this.db
  }

  connectToSearch() {
    if(!process.env.SEARCH_INDEX_PREFIX) throw new Error("ElasticSearch not configured")
    if(this.search) return this.search
    this.searchIndexPrefix = process.env.SEARCH_INDEX_PREFIX
    this.search = new ElasticSearch({ node: process.env.SEARCH_URL || 'http://localhost:9200' })
    this.search.info(console.log)
    return this.search
  }

  createServiceDefinition( definition ) {
    return new ServiceDefinition(definition)
  }

  processServiceDefinition( sourceService, processors ) {
    if(!processors) processors = this.defaultProcessors
    for(let processor of processors) processor(sourceService, this)
  }

  computeChanges( oldServiceJson, newService ) {
    return newService.computeChanges(oldServiceJson)
  }

  async applyChanges(changes, service, updaters, force) {
    console.log("APPLY CHANGES", JSON.stringify(changes, null, '  '))
    updaters = updaters || this.defaultUpdaters
    for(let updater of updaters) {
      await updater(changes, service, this, force)
    }
  }

  async updateService( service, { path, updaters, force } = {}) {
    await this.connectToDatabase()
    let dir = path || this.defaultPath
    let jsonPath = dir + "/service.json"
    let oldServiceJson
    if(await utils.exists(jsonPath)) {
      oldServiceJson = await utils.loadJson(jsonPath)
    } else {
      console.log("old service not found, creating new from scratch")
      oldServiceJson = this.createServiceDefinition({name: service.name}).toJSON()
    }
    let changes = this.computeChanges(oldServiceJson, service)

    /// TODO: chceck for overwriting renames, solve by addeding temporary names

    await this.applyChanges(changes, service, updaters || this.defaultUpdaters, force)
    utils.saveJson(jsonPath, service.toJSON())
  }

  async startService( serviceDefinition, config ) {
    console.log("Starting service", serviceDefinition.name, "!")
    await this.connectToDatabase()
    if(!(serviceDefinition instanceof ServiceDefinition))
      serviceDefinition = new ServiceDefinition(serviceDefinition)
    let service = new Service(serviceDefinition, this)
    await service.start(config || {})
    return service
  }

  async createReactiveDao( config, clientData ) {
    return new RTCMSDao(config, clientData)
  }

  async createApiServer( config ) {
    return new ApiServer({ ...config, cms: this })
  }

  async createSessionApiServer( config ) {
    return new SessionApiServer({ ...config, cms: this })
  }

  generateUid() {
    return crypto.randomBytes(16).toString("hex");
  }

  async clientSideDefinition( service, client, filters ) {
    let definition = JSON.parse(JSON.stringify(service.definition.toJSON()))
    if(!filters) filters = this.defaultClientSideFilters
    for(let filter of filters) await filter(service, definition, this, client)
    return definition
  }

}


module.exports = RTCms
