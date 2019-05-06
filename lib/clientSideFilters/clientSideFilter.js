
module.exports = function(service, definition, cms) {
  for(let actionName in module.actions) {
    const action = module.actions[actionName]

  }
  for(let viewName in module.views) {
    const view = module.views[viewName]

  }
  for(let modelName in module.models) {
    const view = module.views[viewName]

  }

  delete definition.events
  delete definition.triggers
}
