const r = require.main.rethinkdb || require('rethinkdb')
const utils = require("../utils.js")

module.exports = async function(changes, service, cms, force) {
  if(!service.eventSourcing) return;

  const db = cms.connectToDatabase()
  const tableList = await db.run(r.tableList())

  if(tableList.indexOf('eventListeners') == -1) {
    console.log("Creating table eventListeners for event sourcing")
    await db.run(r.tableCreate('eventListeners'))
  }
  if(tableList.indexOf('triggers') == -1) {
    console.log("Creating table triggers for event sourcing")
    await db.run(r.tableCreate('triggers'))
  }

  if(tableList.indexOf(service.name + '_triggers') == -1) {
    console.log(`Creating table ${service.name}_triggers for event sourcing`)
    await db.run(r.tableCreate(service.name + '_triggers'))
  }
  if(tableList.indexOf(service.name + '_events') == -1) {
    console.log(`Creating table ${service.name}_events for event sourcing`)
    await db.run(r.tableCreate(service.name + '_events'))
  }

}