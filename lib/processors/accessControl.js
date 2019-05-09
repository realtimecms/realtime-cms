const utils = require("../utils.js")

const getAccessMethod = require("./accessMethod.js")

module.exports = function(module, cms) {
  for(let actionName in module.actions) {
    const action = module.actions[actionName]
    if(!action.access) continue;
    let access = getAccessMethod(action.access)

    if(access) {
      const oldExec = action.execute
      action.execute = (...args) => {
        if(!access(...args)) throw new Error("notAuthorized")
        return oldExec.apply(action, args)
      }
    }
  }
  for(let viewName in module.views) {
    const view = module.views[viewName]
    if(!view.access) continue;
    let access = getAccessMethod(view.access)
    if(access) {
      const oldRead = view.read
      view.read = (...args) => {
        if(!access(...args)) throw new Error("notAuthorized")
        return oldRead.apply(view, args)
      }
    }
  }
}
