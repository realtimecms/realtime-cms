const revs = require("rethink-event-sourcing")
const r = require.main.rethinkdb || require('rethinkdb')

const Model = require("./Model.js")
const ForeignModel = require("./ForeignModel.js")
const View = require("./View.js")
const Action = require("./Action.js")
const EventHandler = require("./EventHandler.js")
const TriggerHandler = require("./TriggerHandler.js")


class Service extends revs.Service {

  constructor(definition, cms) {
    super({
      serviceName: definition.name,
      noAutostart: true
    })

    this.db = cms.connectToDatabase()

    this.definition = definition
    this.cms = cms
    this.name = definition.name

    this.models = {}
    for(let modelName in this.definition.models) {
      this.models[modelName] = new Model( this.definition.models[modelName], this )
    }

    this.foreignModels = {}
    for(let modelName in this.definition.foreignModels) {
      this.foreignModels[modelName] = new ForeignModel( this.definition.foreignModels[modelName], this )
    }

    this.views = {}
    for(let viewName in this.definition.views) {
      this.views[viewName] = new View( this.definition.views[viewName], this )
    }

    this.actions = {}
    for(let actionName in this.definition.actions) {
      this.actions[actionName] = new Action( this.definition.actions[actionName], this )
    }

    this.triggers = {}
    for(let triggerName in this.definition.triggers) {
      this.triggers[triggerName] = new TriggerHandler( this.definition.triggers[triggerName], this )
    }

    this.events = {}
    for(let eventName in this.definition.events) {
      this.events[eventName] = new EventHandler( this.definition.events[eventName], this )
    }

  }

  async start(config) {

    this.definition._runtime = this

    //console.log("DB", this.db)
    //console.log("USERS", await (await r.table("users_User").run(this.db)).toArray())

    //console.log("DEFN", this.definition)
    //console.log("DEFN JSON", JSON.stringify(this.definition.toJSON(), null, "  "))

    if(config.runCommands) this.startCommandExecutor()
    if(config.handleEvents) this.startEventListener()
    if(config.runCommands || config.handleEvents) {
      await revs.Service.prototype.start.apply(this)
    }

    //if(config.startEventListener) this.startEventListener()

    console.log("Service", this.definition.name, "started")
  }

  callTrigger(data) {
    return this.trigger(data)
  }

  async startEventListener() {
    if(!this.definition.eventSourcing) throw new Error("No event sourcing, command executor not needed")
    let listeners = {}
    for (let eventName in this.events) {
      const event = this.events[eventName]
      listeners[eventName] = (params) => event.execute(params)
      listeners[eventName].queuedBy = event.queuedBy
    }
    if(this.definition.eventsQueuedBy) listeners.queuedBy = this.definition.eventsQueuedBy
    await this.registerEventListeners(listeners)
  }

  async startCommandExecutor() {
    if(!this.definition.eventSourcing) throw new Error("No event sourcing, command executor not needed")
    let commands = {}
    for (let actionName in this.actions) {
      const action = this.actions[actionName]
      commands[actionName] = (command, emit) => action.runCommand(command, emit)
      commands[actionName].queuedBy = action.queuedBy
    }
    if(this.definition.commandsQueuedBy) commands.queuedBy = this.definition.commandsQueuedBy
    await this.registerCommands(commands)

    let triggers = {}
    for (let triggerName in this.triggers) {
      const trigger = this.triggers[triggerName]
      triggers[triggerName] = (command, emit) => trigger.execute(command, emit)
      triggers[triggerName].queuedBy = trigger.queuedBy
    }
    if(this.definition.triggersQueuedBy) triggers.queuedBy = this.definition.triggersQueuedBy
    await this.registerTriggers(triggers)
  }

}

module.exports = Service
