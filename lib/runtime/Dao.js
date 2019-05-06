const ReactiveDao = require("reactive-dao")


function promiseMap(promise, fn) {
  if(promise.then) return promise.then(fn)
  return fn(promise)
}

function prepareReactiveDaoDefinition(config, clientData) {
  let dao = {}
  if(config.remote) {
    const remoteList = config.remote(clientData)
    for (let remote of remoteList) {
      dao[remote.name] = {
        type: "remote",
        generator: remote.generator || ReactiveDao.ObservableList
      }
    }
  }
  if(config.local) {
    const local = config.local(clientData)
    for (let localName in local) {
      dao[localName] = {
        type: "local",
        source: local[localName]
      }
    }
  }
  if(config.services) {
    for (let service of config.services) {
      let methods = {}, values = {}
      for(let actionName in service.actions) {
        let action = service.actions[actionName]
        if(service.definition.eventSourcing) {
          methods[actionName] = (...args) => action.callCommand(...args, clientData)
        } else {
          methods[actionName] = (...args) => action.execute(...args, clientData)
        }
      }
      for(let viewName in service.views) {
        let view = service.views[viewName]
        values[viewName] = {
          observable(parameters) {
            return view.observable(parameters, clientData)
          },
          get(parameters) {
            return view.get(parameters, clientData)
          }
        }
      }
      if(config.shareDefinition) {
        values['definition'] = {
          observable(parameters) {
            return new ReactiveDao.ObservablePromiseProxy(
                service.cms.clientSideDefinition(service, clientData)
                    .then(x => new ReactiveDao.ObservableValue(x))
            )
          },
          async get(parameters) {
            return await service.cms.clientSideDefinition(service, clientData)
          }
        }
      }
      dao[service.name] = {
        type: "local",
        source: new ReactiveDao.SimpleDao({ methods, values })
      }
    }
    if(config.shareDefinition) {
      dao['metadata'] = {
        type: "local",
        source: new ReactiveDao.SimpleDao({
          methods: {},
          values: {
            serviceNames: {
              observable(parameters) {
                return new ReactiveDao.Observable(config.services.map(s => s.name))
              },
              async get(parameters) {
                return config.services.map(s => s.name)
              }
            },
            serviceDefinitions: {
              observable(parameters) {
                return new ReactiveDao.ObservablePromiseProxy(
                    Promise.all(
                      config.services.map(service => service.cms.clientSideDefinition(service, clientData))
                    ).then(x => new ReactiveDao.ObservableValue(x))
                )
                /*let definitions = config.services.map(s => s.definition.toJSON())
                return new ReactiveDao.ObservableValue(definitions)*/
              },
              async get(parameters) {
                return Promise.all(config.services.map(s => s.cms.clientSideDefinition(s, clientData)))
              }
            }
          }
        })
      }
    }
  }
  dao.protocols = config.protocols || {}
  return dao
}

class RTCMSDao extends ReactiveDao {
  constructor(config, clientData) {
    super(clientData.sessionId, prepareReactiveDaoDefinition(config, clientData))
  }
}

module.exports = RTCMSDao
