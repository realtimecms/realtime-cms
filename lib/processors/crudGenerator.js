const utils = require("../utils.js")

module.exports = function(service, cms) {
  for(let modelName in service.models) {
    const model = service.models[modelName]
    if(!model.crud) continue
    const crud = model.crud
    const generateId = crud.id || (() => service.cms.generateUid())
    const options = crud.options || {}
    const writeOptions = crud.writeOptions || {}
    const readOptions = crud.readOptions || {}
    const idName = model.name.slice(0, 1).toLowerCase() + model.name.slice(1)
    let properties = {}
    for(let propName in model.properties) {
      let property = model.properties[propName]
      let typeName = utils.typeName(property.type)
      properties[propName] = {
        ...property,
        idOnly: !!service.models[typeName] // we need only id of entity, nothing more
      }
    }
    let idProp = {}
    idProp[idName] = {
      type: model,
      idOnly: true
    }
    function genName(name) {
      return (crud.prefix || "") + model.name + name
    }
    function modelRuntime() {
      return service._runtime.models[modelName]
    }

    if(service.eventSourcing && !service.events[genName("Created")]) { // Events:
      service.event({
        name: genName("Created"),
        async execute(props) {
          await modelRuntime().create({ ...props.data, id: props[idName] })
        }
      })
    }
    if(!service.actions[genName("Create")]) {
      service.action({
        name: genName("Create"),
        properties,
        returns: {
          type: model,
          idOnly: true
        },
        ...options,
        ...writeOptions,
        execute: !service.eventSourcing ? async function(props) {
          let entity = await modelRuntime().create(props.data || {})
          return entity
        } : async function(props, {service}, emit) {
          const id = generateId(props)
          let event = {
            data: props || {},
            type: genName("Created")
          }
          event[idName] = id
          emit(event)
          return id
        }
      })
    }

    if(service.eventSourcing && !service.events[genName("Updated")]) { // Events:
      service.event({
        name: genName("Updated"),
        async execute(props) {
          await modelRuntime().update(props[idName], props.data)
        }
      })
    }
    if(!service.actions[genName("Update")]) {
      service.action({
        name: genName("Update"),
        properties: {
          ...idProp,
          ...properties
        },
        returns: {
          type: model,
          idOnly: true
        },
        ...options,
        ...writeOptions,
        execute: !service.eventSourcing ? async function (props) {
          let entity = await modelRuntime().update(props[idName], props.data)
          return entity
        } : async function (props, {service}, emit) {
          let event = {
            data: {...props},
            type: genName("Updated")
          }
          event[idName] = props[idName]
          delete event.data[idName]
          emit(event)
          return props[idName]
        }
      })
    }

    if(service.eventSourcing && !service.events[genName("Deleted")]) { // Events:
      service.event({
        name: genName("Deleted"),
        async execute(props) {
          await modelRuntime().delete(props[idName])
        }
      })
    }

    if(!service.actions[genName("Delete")]) {
      service.action({
        name: genName("Delete"),
        properties: idProp,
        returns: {
          type: null
        },
        ...options,
        ...writeOptions,
        execute: !service.eventSourcing ? async function (props) {
          if(crud.deleteTrigger || crud.triggers) {
            let trig = { type: 'On'+genName("Delete") }
            trig[idName] = props[idName]
            await service.trigger(trig)
          }
          let entity = await modelRuntime().delete(props[idName])
          return entity
        } : async function (props, {service}, emit) {
          if(crud.deleteTrigger || crud.triggers) {
            let trig = { type: 'On'+genName("Delete") }
            trig[idName] = props[idName]
            await service.trigger(trig)
          }
          emit({
            ...props,
            type: genName("Deleted")
          })
        }
      })
    }

    service.view({
      name: genName("One"),
      properties: idProp,
      ...options,
      ...readOptions,
      returns: {
        type: model
      },
      read(props) {
        return modelRuntime().table.get(props[idName])
      }
    })

    service.view({
      name: genName("All"),
      properties: {},
      returns: {
        type: Array,
        of: {
          type: model
        }
      },
      ...options,
      ...readOptions,
      read(props) {
        return modelRuntime().table
      }
    })
  }
}