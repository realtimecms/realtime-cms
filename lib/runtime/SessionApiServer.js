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
      let sess = await r.table("session").get(credentials.sessionId).run(db)
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

      let sessionObservable = new revsDao.RethinkObservableValue(db,
          r.table("session").get(sessionId).changes({ includeInitial: true }))

      let sessionObserver = {
        set: (newSess) => {
          if(newSess) {
            if(   JSON.stringify(newSess.roles || []) != JSON.stringify(credentials.roles)
               || JSON.stringify(newSess.user || null) != JSON.stringify(credentials.user || null)) {
              /// User or roles changed, rebuilding dao
              credentials.roles = newSess.roles
              credentials.user = newSess.user
              console.log("session", sessionId, "new roles", newSess.roles, "or user", newSess.user, "rebuilding dao!")
              const oldDao = this.currentDao
              this.currentDao = new Dao(config, {...credentials})
              this.daoProxy.setDao(this.currentDao)
              oldDao.dispose()
            }
          }
        }
      }

      sessionObservable.observe(sessionObserver)

      this.currentDao = new Dao(config, {...credentials})

      this.daoProxy = new ReactiveDao.ReactiveDaoProxy(this.currentDao)
      let oldDispose = this.daoProxy.dispose.bind(this.daoProxy)

      let disposed = false
      this.daoProxy.dispose = () => {
        if(disposed) throw new Error("DAO dispose called twice!")
        disposed = true
        oldDispose()
        sessionObservable.unobserve(sessionObserver)
      }

      return this.daoProxy
    }, config)
  }

  handleRequest() {

  }

  handleConnection(connection) {
    this.reactiveServer.handleConnection(connection)
  }
}

module.exports = ApiServer
