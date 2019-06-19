function generatePropertyMapping(property) {

}

function generateMappings(model) {
  let properties = {}
  for(let propName in model.properties) {
    properties[propName] = generatePropertyMapping(model.properties[propName])
  }
  return {
    _source: {
      enabled: true
    },
    properties
  }
}

async function updateElasticSearch(changes, service, cms, force) {

  const generateIndexName = (modelName) => {
    return cms.searchIndexPrefix+"_"+service.name+"_"+modelName
  }

  console.log("ELASTICSEARCH UPDATER")

  let changesByModel = new Map()
  const addChange = function(modelName, change) {
    let changes = changesByModel.get(modelName)
    if(!changes) changesByModel.set(modelName, [change])
      else changes.push(change)
  }

  /// Group by model
  for(let change of changes) {
    switch (change.operation) {
      case "createModel": addChange(change.model.name, change); break
      case "renameModel": addChange(change.from, change); break
      case "deleteModel": addChange(change.name, change); break
      case "createProperty":
      case "renameProperty":
      case "deleteProperty":
      case "changePropertyType":
      case "changePropertySearch": addChange(change.model, change); break
      default:
    }
  }

  const search = await cms.connectToSearch()

  async function getCurrentAlias(modelName) {
    let alias = await search.indices.getAlias({name: generateIndexName(modelName) })
    console.log("GOT ALIAS", alias)
    return alias.index
  }

  async function putAllData(modelName) {

  }

  for(let [model, changes] of changesByModel.values()) {
    let definition = service.models[model]
    if(!definition.search) return;
    for(let change of changes) {
      switch (change.operation) {
        case "createModel": {
          if (changes.length != 1) {
            console.error("Bad model operations set", changes)
            throw new Error("createModel prohibits other operations for model")
          }
          await search.indices.create({
            name: generateIndexName(change.model.name) + '_1',
            mappings: generateMappings(change.model)
          })
          await search.indices.putAlias({
            name: generateIndexName(change.model.name),
            index: generateIndexName(change.model.name) + '_1',
          })
        } break
        case "searchEnabled": {
          await search.indices.create({
            name: generateIndexName(change.model.name) + '_1',
            mappings: generateMappings(change.model)
          })
          await search.indices.putAlias({
            name: generateIndexName(change.model.name),
            index: generateIndexName(change.model.name) + '_1',
          })
          await putAllData(change.model.name)
        } break
        case "deleteModel":
          if(changes.length != 1) {
            console.error("Bad model operations set", changes)
            throw new Error("deleteModel prohibits other operations for model")
          } /// NO BREAK!
        case "searchDisabled": {
          const currentAlias = await getCurrentAlias(change.name)
          await search.indices.delete({ name: currentAlias })
          await search.indices.deleteAlias({ name: generateIndexName(change.name) })
        } break
        case "renameModel": {
          const newAlias = generateIndexName(change.to) + '_1'
          await search.indices.create({
            name: newAlias,
            mappings: generateMappings(service.models[change.to])
          })
          await search.indices.putAlias({
            name: generateIndexName(change.to),
            index: newAlias
          })
          const currentAlias = await getCurrentAlias(change.from)
          await search.reindex({ body: {
            source: { index: currentAlias },
            dest: { index: newAlias }
          }})
          await search.indices.delete({ name: currentAlias })
          await search.indices.deleteAlias({ name: generateIndexName(change.from) })
        } break
        default:
      }
    }

    let reindex = false
    for(let change of changes) {
      switch (change.operation) {
        case "renameProperty":
        case "deleteProperty":
        case "changePropertyType":
        case "changePropertySearch":
          reindex = true;
          break;
        default:
      }
    }

    if(reindex) {
      const currentAlias = await getCurrentAlias(model)
      const currentVersion = +currentAlias.slice(currentAlias.lastIndexOf("_")+1)
      const newVersion = currentVersion + 1
      const newAlias = generateIndexName(model)+"_"+newVersion
      await search.indices.create({
        name: newAlias,
        mappings: generateMappings(service.models[model])
      })

      await search.reindex({ body: {
        source: { index: currentAlias },
        dest: { index: newAlias }
      }})

      await search.indices.putAlias({
        name: generateIndexName(model),
        index: newAlias
      })
      await search.indices.delete({ name: currentAlias })
    } else {
      for(let change of changes) {
        switch (change.operation) {
          case "createProperty": {
            let properties = {}
            properties[change.name] = generatePropertyMapping(change.property)
            const currentAlias = await getCurrentAlias(change.name)
            await search.indices.putMapping({
              index: currentAlias,
              body: {properties}
            })
          } break
        }
      }
    }

  }

}

module.exports = updateElasticSearch