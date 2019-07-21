
module.exports = function(service, definition, cms) {
/*  for(let actionName in service.actions) {
    const action = service.actions[actionName]

  }
  for(let viewName in service.views) {
    const view = service.views[viewName]

  }
  for(let modelName in service.models) {
    const view = service.views[viewName]

  }*/

  delete definition.events
  delete definition.triggers
}
