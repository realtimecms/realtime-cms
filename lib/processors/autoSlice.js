const utils = require("../utils.js")

const getAccessMethod = require("./accessMethod.js")

module.exports = function(module, cms) {
  for(let viewName in module.views) {
    const view = module.views[viewName]
    if(!view.autoSlice) continue;
    const oldRead = view.read
    view.read = async (...args) => {
      const params = args[0]
      let req = oldRead.apply(view, args)
      if(params._slice) req = req.slice(params._slice[0], params.slice[1])
      if(params._skip) req = req.skip(params._skip)
      if(params._limit) req = req.skip(params._limit)
      return req
    }
  }
}
