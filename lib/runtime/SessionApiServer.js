const ReactiveDao = require("reactive-dao")
const Dao = require("./Dao.js")
const revs = require('rethink-event-sourcing')
const r = require.main.rethinkdb || require('rethinkdb')
const revsDao = require("reactive-dao-rethinkdb")

const { getIp } = require("./utils.js")

function waitForSession(db, sessionId) {
  return new Promise((resolve, reject) => {
    let stream
    r.table("session").get(sessionId).changes({ includeInitial: true }).run(db).then( changeStream => {
      stream = changeStream
      changeStream.each((err, change) => {
        if(err) {
          stream.close()
          return reject(err)
        }
        if(change.new_val) {
          changeStream.close()
          resolve(change.new_val)
        }
      })
    })
    setTimeout(() => {
      if(stream) stream.close()
      reject("sessionTimeout")
    }, 1000)
  })
}

class ApiServer {
  constructor(config) {
    this.config = config
    this.reactiveServer = new ReactiveDao.ReactiveServer( async (sessionId, connection) => {
      let ip = getIp(connection)

      let credentials = {sessionId, ip}

      let db = await config.cms.db
      let sess = await db.run(r.table("session").get(credentials.sessionId))
      if(!sess) {
        console.log("create session!")
        await revs.command(db,"session", "createSessionIfNotExists", {
          session: sessionId,
          client: credentials
        })
        console.log("session create returned!")
        await waitForSession(db, sessionId)
        console.log("session created!")
        credentials.roles = []
        credentials.user = null
      } else {
        console.log("session", sess)
        credentials.roles = sess.roles || []
        credentials.user = sess.user || null
      }

      let currentDao = new Dao(config, {...credentials})
      const daoProxy = new ReactiveDao.ReactiveDaoProxy(currentDao)

      let sessionObservable = new revsDao.RethinkObservableValue(db,
          r.table("session").get(sessionId).changes({ includeInitial: true }))

      let sessionObserver = {
        set: (newSess) => {
          /*console.log("CONN SESSION:",sessionId, "SESS OBSERVER SET", newSess, "CRED", credentials)
          return*/
          if(newSess) {
            if(   JSON.stringify(newSess.roles || []) != JSON.stringify(credentials.roles)
               || JSON.stringify(newSess.user || null) != JSON.stringify(credentials.user || null)) {
              /// User or roles changed, rebuilding dao
              credentials.roles = newSess.roles || []
              credentials.user = newSess.user || null
              console.log("session", sessionId, "  new roles", newSess.roles, "or user", newSess.user, "rebuilding dao!")
              const oldDao = currentDao
              currentDao = new Dao(config, {...credentials})
              daoProxy.setDao(currentDao)
              oldDao.dispose()
            }
          }
        }
      }

      sessionObservable.observe(sessionObserver)


      let oldDispose = daoProxy.dispose.bind(daoProxy)

      let disposed = false
      daoProxy.dispose = () => {
        if(disposed) throw new Error("DAO dispose called twice!")
        disposed = true
        oldDispose()
        sessionObservable.unobserve(sessionObserver)
      }

      return daoProxy
    }, config)
  }

  handleRequest() {

  }

  handleConnection(connection) {
    this.reactiveServer.handleConnection(connection)
  }
}

module.exports = ApiServer
