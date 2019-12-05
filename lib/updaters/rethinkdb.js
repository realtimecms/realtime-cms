const r = require('rethinkdb-reconnect')
const utils = require("../utils.js")

module.exports = async function(changes, service, cms, force) {
  const generateTableName = (modelName) => {
    return service.name+"_"+modelName
  }

  function rowPointer(field) {
    const parts = field.split('.')
    let row = r.row
    for(const part of parts) row = row(part)
    return row
  }

  async function createIndex(tableName, indexName, index, indexList) {
    console.log("CREATE INDEX", index)
    if(indexList.indexOf(indexName) != -1) {
      console.error("INDEX ALREADY EXISTS", index)
      if(!force) throw new Error(`Index table ${tableName} already exists`)
      await db.run(
          r.table(tableName).indexDrop(indexName)
      )
      console.log("INDEX REMOVED!", index)
    }
    const options = {
      multi: index.multi || false,
      geo: index.geo || false
    }
    if(index.function) {
      await db.run(
        r.table(tableName).indexCreate(indexName, index.function, options)
      )
    } else if(index.property.constructor == Array) { // compound index
      await db.run(
          r.table(tableName).indexCreate(indexName, index.property.map(prop => rowPointer(prop)), options)
      )
    } else {
      await db.run(
          r.table(tableName).indexCreate(indexName, rowPointer(index.property), options)
      )
    }
    console.log("INDEX CREATED!", index)
  }

  console.log("RETHINK UPDATER")
  const db = cms.connectToDatabase()
  const tableList = await db.run(
      r.tableList()
  )
  //console.log("TABLE LIST", tableList)
  for(let change of changes) {
    console.log("PROCESSING CHANGE", change)
    switch(change.operation) {
      case "createModel": {
        const model = change.model
        const tableName = generateTableName(model.name)
        let indexList = []
        if(tableList.indexOf(tableName) == -1) {
          /// TODO: configure shards and replicas
          await db.run(
              r.tableCreate(tableName)
          )
          console.log("TABLE CREATED!", tableName)
        } else {
          console.error("TABLE ALREADY EXISTS", tableName)
          if(!force) throw new Error("Table "+tableName+" already exist")
          indexList = await db.run(
              r.table(tableName).indexList()
          )
        }
        for(let indexName in model.indexes) {
          const index = model.indexes[indexName]
          await createIndex(tableName, indexName, index, indexList)
        }
      } break
      case "renameModel": {
        const from = generateTableName(change.from)
        const to = generateTableName(change.to)
        await db.run(
            r.table(from).config().update({name: to})
        )
      } break
      case "deleteModel": {
        const tableName = generateTableName(change.name)
        console.log("DELETE TABLE")
        console.log("TABLES", tableList, "HAS", tableName, "=>", tableList.indexOf(tableName))
        if(tableList.indexOf(tableName) != -1) {
          await db.run(
              r.tableDrop(tableName)
          )
        } else {
          console.error("TABLE NOT EXIST", tableName)
          if(!force) throw new Error("Table "+tableName+" not exist")
        }
        break
      }
      case "createIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        const index = change.index
        let indexList = await db.run(
            r.table(tableName).indexList()
        )
        await createIndex(tableName, change.name, index, indexList)
      } break;
      case "renameIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        let indexList = await db.run(
            r.table(tableName).indexList()
        )
        if(indexList.indexOf(change.name) == -1) {
          console.error(tableName, "INDEX NOT EXIST", change.name)
          if(!force) throw new Error(`Index ${change.name} of table ${tableName} not exist`)
          await createIndex(tableName, service.models[change.model].indexes[change.name])
        } else {
          await db.run(
              r.table(tableName).indexRename(change.name)
          )
        }
      } break;
      case "deleteIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          if(!force) throw new Error("Table "+tableName+" not exist")
        }
        let indexList = await db.run(
            r.table(tableName).indexList()
        )
        if(indexList.indexOf(change.name) == -1) {
          console.error(tableName, "INDEX NOT EXIST", change.name)
          if(!force) throw new Error(`Index ${change.name} of table ${tableName} not exist`)
        } else {
          await db.run(
              r.table(tableName).indexDrop(change.name)
          )
        }
      } break
      case "createProperty": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        const property = change.property
        if(property.defaultValue !== undefined) {
          let uo = {}
          uo[change.name] = property.defaultValue
          await db.run(
              r.table(tableName).update(uo)
          )
        }
      } break;
      case "renameProperty": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        await db.run(
          r.table(tableName).replace((doc) => {
            let tmp = {}
            tmp[change.to] = doc(change.from)
            return doc.merge(tmp).without(change.from)
          })
        )
      } break;
      case "deleteProperty": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        /*await db.run(
            r.table(tableName).replace((doc) => doc.without(change.name))
        )*/
      } break;
      default:
    }
  }
  console.log("RETHINK UPDATED")
}
