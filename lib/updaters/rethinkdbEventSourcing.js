const r = require.main.rethinkdb || require('rethinkdb')
const utils = require("../utils.js")

module.exports = async function(changes, service, cms, force) {

  if(!service.eventSourcing) return;

  const db = await cms.connectToDatabase()
  const tableList = await r.tableList().run(db)

  if(tableList.indexOf('eventListeners') == -1) {
    console.log("Creating table eventListeners for event sourcing")
    await r.tableCreate('eventListeners').run(db)
  }
  if(tableList.indexOf('triggers') == -1) {
    console.log("Creating table triggers for event sourcing")
    await r.tableCreate('triggers').run(db)
  }

}