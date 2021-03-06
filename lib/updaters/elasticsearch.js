const r = require.main.rethinkdb || require('rethinkdb')
const { typeName } = require("../utils.js")

function generatePropertyMapping(property) {
  //console.log("GENERATE PROPERTY MAPPING", property)
  let options = property.search ? JSON.parse(JSON.stringify(property.search)) : {}
  if(property.search === false) options.enabled = false
  if(!options.type) {
    switch(typeName(property.type)) {
      case "String": options.type = "text"; break;
      case "Number": options.type = "double"; break;
      case "Date": options.type = "date"; break;
      case "Boolean": options.type = "boolean"; break;
      case "Array": options.type = "array"; break;
      case "Object": options.type = "object"; break;
      default: options.type = "keyword"
    }
  }
  if(options.type == 'object' && !options.properties) {
    options.properties = {}
    for(let propName in property.properties) {
      options.properties[propName] = generatePropertyMapping(property.properties[propName])
    }
    options.include_in_root = true
  }
  if(options.type == 'array') {
    if(typeName(property.of) != "Object") {
      return generatePropertyMapping(property.of)
    } else {
      options.type = 'nested'
    }
  }
  //console.log("GENERATED PROPERTY MAPPING", property, ":", options)
  return options
}

function generateMetadata(model) {
  let properties = {}
  for(let propName in model.properties) {
    properties[propName] = generatePropertyMapping(model.properties[propName])
  }
  let settings = (typeof model.search == 'object') ? model.search.settings : undefined
  return {
    settings,
    mappings: {
      _source: {
        enabled: true
      },
      properties: {
        id: { type: "keyword", index: false },
        ...properties
      }
    }
  }
}

async function updateElasticSearch(changes, service, cms, force) {

  const generateIndexName = (modelName) => {
    return (cms.searchIndexPrefix+service.name+"_"+modelName).toLowerCase()
  }

  const generateTableName = (modelName) => {
    return service.name+"_"+modelName
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
      case "searchEnabled":
      case "searchDisabled":
      case "searchUpdated":
      case "changePropertySearch": addChange(change.model, change); break
      default:
    }
  }

  const search = await cms.connectToSearch()

  async function getCurrentAlias(modelName) {
    let alias = await search.indices.getAlias({name: generateIndexName(modelName) })
    //console.log("GOT ALIAS", Object.keys(alias.body)[0])
    return Object.keys(alias.body)[0]
  }

  async function putAllData(modelName) {
    const db = await cms.connectToDatabase()
    const index = generateIndexName(modelName)
    const cursor = await db.run(
        r.table(generateTableName(modelName))
    )

    console.log(`INDEXING ${modelName}`)

    return new Promise((resolve, reject) => {
      let buffer = []
      let readMore = () => {}
      let readFinished = false, writing = false
      cursor.eachAsync(function(row, rowFinished) {
        buffer.push(row)
        if(buffer.length < 1000) {
          buffer.push(row)
          rowFinished()
        } else {
          readMore = rowFinished
          console.log(`READED ${buffer.length} ROWS`)
          writeMore().catch(reject)
        }
      }, function() {
        readFinished = true
        console.log(`READED LAST ${buffer.length} ROWS`)
        if(buffer.length > 0) writeMore().catch(reject)
      })
      async function writeMore() {
        if(writing) return;
        let data = buffer
        buffer = []
        readMore()
        readMore = () => {}
        writing = true
        console.log(`WRITING ${data.length} ROWS`)
        let operations = new Array(data.length*2)
        for(let i = 0; i < data.length; i++) {
          operations[i * 2] = { index: { _id: data[i].id } }
          operations[i * 2 + 1] = data[i]
        }
        await search.bulk({
          index,
          body: operations
        }).catch(error => {
          error = (error && error.meta && error.meta.body && error.meta.body.error) || error
          console.error("ES ERROR:", error)
          throw error
        })
        writing = false
        if(buffer.length > 500) {
          writeMore().catch(reject)
        } else if(readFinished) {
          console.log(`WRITING FINISHED`)
          resolve(true)
        }
      }
    })
  }

  async function setPropertyDefaultValue(currentAlias, propertyName, defaultValue) {
    const req = {
      index: currentAlias,
      body: {
        query: {
          match_all: {}
        },
        script: {
          source: `ctx._source.${propertyName} = ${JSON.stringify(defaultValue)}`,
          lang: 'painless'
        }
      },
      conflicts: 'proceed'
    }
    console.log("UPDATE BY QUERY", req)
    await search.updateByQuery(req).catch(error => {
      console.error("FIELD UPDATE ERROR", error.meta.body.error, error.meta.body.failures)
      throw error
    })
  }

  for(let [model, changes] of changesByModel.entries()) {
    let definition = service.models[model]
    if(!definition.search) return;
    for(let change of changes) {
      switch (change.operation) {
        case "createModel": {
          if (changes.length != 1) {
            console.error("Bad model operations set", changes)
            throw new Error("createModel prohibits other operations for model")
          }
          const index =  generateIndexName(change.model.name) + '_1'
          const metadata = generateMetadata(service.models[change.model.name])
          console.log("INDEX", index)
          console.log("METADATA", JSON.stringify(metadata,null, "  "))
          await search.indices.create({
            index,
            body: metadata
          })
          await search.indices.putAlias({
            name: generateIndexName(change.model.name),
            index: generateIndexName(change.model.name) + '_1',
          })
        } break
        case "searchEnabled": {
          const index =  generateIndexName(change.model) + '_1'
          const metadata = generateMetadata(service.models[change.model])
          console.log("INDEX", index)
          console.log("METADATA", JSON.stringify(metadata,null, "  "))
          await search.indices.create({
            index,
            body: metadata
          })
          await search.indices.putAlias({
            name: generateIndexName(change.model),
            index,
          })
          await putAllData(change.model)
        } break
        case "deleteModel":
          if(changes.length != 1) {
            console.error("Bad model operations set", changes)
            throw new Error("deleteModel prohibits other operations for model")
          } /// NO BREAK!
        case "searchDisabled": {
          const currentAlias = await getCurrentAlias(change.model)
          await search.indices.delete({ name: currentAlias })
          await search.indices.deleteAlias({ name: generateIndexName(change.model) })
        } break
        case "renameModel": {
          const newAlias = generateIndexName(change.to) + '_1'
          await search.indices.create({
            name: newAlias,
            body: generateMetadata(service.models[change.to])
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
        case "searchUpdated":
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
      const metadata = generateMetadata(service.models[model])
      console.log("METADATA", JSON.stringify(metadata,null, "  "))
      await search.indices.create({
        index: newAlias,
        body: metadata
      })

      for(let change of changes) { /// Create properties before reindex
        if(change.operation == 'createProperty')
          if(typeof change.property.defaultValue != 'undefined')
            await setPropertyDefaultValue(currentAlias, change.name, change.property.defaultValue)
      }

      await search.reindex({ body: {
        source: { index: currentAlias },
        dest: { index: newAlias }
      }})

      await search.indices.putAlias({
        name: generateIndexName(model),
        index: newAlias
      })
      await search.indices.delete({ index: currentAlias })
    } else {
      for(let change of changes) {
        switch (change.operation) {
          case "createProperty": {
            let properties = {}
            properties[change.name] = generatePropertyMapping(change.property)
            const currentAlias = await getCurrentAlias(change.model)
            await search.indices.putMapping({
              index: currentAlias,
              body: {properties}
            }).catch(error => {
              console.error('ES ERROR', error.meta.body.error)
              throw error
            })
            if(typeof change.property.defaultValue != 'undefined')
              await setPropertyDefaultValue(currentAlias, change.name, change.property.defaultValue)
          } break
        }
      }
    }
  }

}

module.exports = updateElasticSearch