const r = require.main.rethinkdb || require('rethinkdb')
const utils = require("../utils.js")

module.exports = async function(changes, service, cms, force) {
  const generateTableName = (modelName) => {
    return service.name+"_"+modelName
  }

  async function createIndex(tableName, index, indexList) {
    console.log("CREATE INDEX", index)
    if(indexList.indexOf(index.name) != -1) {
      console.error("INDEX ALREADY EXISTS", index)
      if(!force) throw new Error(`Index table ${tableName} already exists`)
      await r.table(tableName).indexDrop(index.name).run(db)
      console.log("INDEX REMOVED!", index)
    }
    const options = {
      multi: index.multi || false,
      geo: index.geo || false
    }
    if(index.property.constructor == Array) { // compound index
      await r.table(tableName).indexCreate(index.name, index.property.map(prop => r.row(prop)), options).run(db)
    } else {
      await r.table(tableName).indexCreate(index.name, r.row(index.property), options).run(db)
    }
    console.log("INDEX CREATED!", index)
  }

  console.log("RETHINK UPDATER")
  const db = await cms.connectToDatabase()
  const tableList = await r.tableList().run(db)
 // console.log("TABLE LIST", tableList)
  for(let change of changes) {
    console.log("PROCESSING CHANGE", change)
    switch(change.operation) {
      case "createModel": {
        const model = change.model
        const tableName = generateTableName(model.name)
        let indexList = []
        if(tableList.indexOf(tableName) == -1) {
          /// TODO: configure shards and replicas
          await r.tableCreate(tableName).run(db)
          console.log("TABLE CREATED!", tableName)
        } else {
          console.error("TABLE ALREADY EXISTS", tableName)
          if(!force) throw new Error("Table "+tableName+" already exist")
          indexList = await r.table(tableName).indexList().run(db)
        }
        for(let indexName in model.indexes) {
          const index = model.indexes[indexName]
          await createIndex(tableName, index, indexList)
        }
      } break
      case "renameModel": {
        const from = generateTableName(change.from)
        const to = generateTableName(change.to)
        await r.table(from).config().update({name: to}).run(db)
      } break
      case "deleteModel": {
        const tableName = generateTableName(change.name)
        console.log("DELETE TABLE")
        if(tableList.indexOf(tableName) == -1) {
          await r.tableDrop(tableName).run(db)
        } else {
          console.error("TABLE NOT EXIST", tableName)
          if(!force) throw new Error("Table "+tableName+" not exist")
        }
        break
      }
      case "createIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) != -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        const index = change.index
        let indexList = await r.table(tableName).indexList().run(db)
        await createIndex(tableName, index, indexList)
      } break;
      case "renameIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) != -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        let indexList = await r.table(tableName).indexList().run(db)
        if(indexList.indexOf(change.name) != -1) {
          console.error(tableName, "INDEX NOT EXIST", change.name)
          if(!force) throw new Error(`Index ${change.name} of table ${tableName} not exist`)
          await createIndex(tableName, service.models[change.model].indexes[change.name])
        } else {
          await r.table(tableName).indexRename(change.name).run(db)
        }
      } break;
      case "deleteIndex": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) != -1) {
          console.error("TABLE NOT EXIST", tableName)
          if(!force) throw new Error("Table "+tableName+" not exist")
        }
        let indexList = await r.table(tableName).indexList().run(db)
        if(indexList.indexOf(change.name) != -1) {
          console.error(tableName, "INDEX NOT EXIST", change.name)
          if(!force) throw new Error(`Index ${change.name} of table ${tableName} not exist`)
        } else {
          await r.table(tableName).indexDrop(change.name).run(db)
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
          await r.table(tableName).update(uo).run(db)
        }
      } break;
      case "renameProperty": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        r.table(tableName).map((doc) => {
          let tmp = {}
          tmp[change.to] = doc(change.from)
          return doc.merge(tmp).without(change.from)
        })
      } break;
      case "deleteProperty": {
        const tableName = generateTableName(change.model)
        if(tableList.indexOf(tableName) == -1) {
          console.error("TABLE NOT EXIST", tableName)
          throw new Error("Table "+tableName+" not exist")
        }
        r.table(tableName).map((doc) => doc.without(change.name))
      } break;
      default:
    }
  }
  console.log("RETHINK UPDATED")
}
