const ReactiveDao = require("reactive-dao")
const Dao = require("./Dao.js")
const revs = require('rethink-event-sourcing')
const r = require.main.rethinkdb || require('rethinkdb')
const revsDao = require("reactive-dao-rethinkdb")

const { getIp } = require("./utils.js")

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
        console.log("session created!")
        credentials.roles = []
      } else {
        console.log("session", sess)
        credentials.roles = sess.roles || []
      }

      this.sessionObservable = new revsDao.RethinkObservableValue(db,
          r.table("session").get(sessionId).changes({ includeInitial: true }))

      let sessionObserver = {
        set: (newSess) => {
          if(newSess && JSON.stringify(newSess.roles || []) != JSON.stringify(credentials.roles)) {
            /// Roles changed, rebuilding dao
            credentials.roles = newSess.roles
            console.log("session", sessionId, "new roles", newSess.roles, "rebuilding dao!")
            const oldDao = this.currentDao
            this.currentDao = new Dao(config, {...credentials})
            this.daoProxy.setDao(this.currentDao)
            oldDao.dispose()
          }
        }
      }

      this.sessionObservable.observe(sessionObserver)

      this.currentDao = new Dao(config, {...credentials})

      this.daoProxy = new ReactiveDao.ReactiveDaoProxy(this.currentDao)
      let oldDispose = this.daoProxy.dispose.bind(this.daoProxy)
      this.daoProxy.dispose = () => {
        oldDispose()
        this.sessionObservable.unobserve(sessionObserver)
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
