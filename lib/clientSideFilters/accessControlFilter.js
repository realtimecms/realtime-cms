const getAccessMethod = require("../processors/accessMethod.js")

module.exports = function(service, definition, cms, client) {

  for(let actionName in definition.actions) {
    const action = service.definition.actions[actionName]
    if(!action.access) continue;
    let access = getAccessMethod(action.access)

    if(access) {
      try {
        if(!access({ visibilityTest: true }, { client, service, action })) {
          delete definition.actions[actionName]
        }
      } catch(e) {
        console.error(`Access function in action ${actionName} returned error for visibility test with no parameters`)
        delete definition.actions[actionName]
      }
    }
  }

  console.log(Object.keys(definition.views))
  for(let viewName in definition.views) {
    const view = service.definition.views[viewName]
    if(!view.access) continue;
    let access = getAccessMethod(view.access)

    if(access) {
      try {
        if(!access({ visibilityTest: true }, { client, service, view })) {
          delete definition.views[viewName]
        }
      } catch(e) {
        console.error(`Access function in view ${viewName} returned error for visibility test with no parameters`)
        delete definition.views[viewName]
      }
    }
  }

  for(let modelName in definition.models) {
    const model = service.definition.models[modelName]
    if(!model.access) continue;
    let access = getAccessMethod(model.access)

    if(access) {
      try {
        if(!access({ visibilityTest: true }, { client, service, model })) {
          delete definition.models[modelName]
        }
      } catch(e) {
        console.error(`Access function in model ${modelName} returned error for visibility test with no parameters`)
        delete definition.models[modelName]
      }
    }
  }

}