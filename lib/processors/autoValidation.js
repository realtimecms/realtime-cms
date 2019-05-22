const utils = require("../utils.js")

function getValidator(validation, service, source, property) {
  if(typeof validation == 'string') {
    let validator = service.validators[validation]
    if(!validator) throw new Error(`Validator ${validation} not found`)
    return validator({}, { service, source, property })
  } else {
    let validator = service.validators[validation.name]
    if(!validator) throw new Error(`Validator ${validation} not found`)
    return validator(validation, { service, source, property })
  }
}

function getValidators(source, service) {
  let validators = {}
  for(let propName in source.properties) {
    const prop = source.properties[propName]
    if(prop.validation) {
      const validations = Array.isArray(prop.validation) ? prop.validation : [prop.validation]
      for(let validation of validations) {
        const validator = getValidator(validation, service, source, prop)
        if(validators[propName]) validators[propName].push(validator)
          else validators[propName] = [validator]
      }
    }
  }
  return validators
}

function validate(props, validators, source) {
  console.log("VALIDATE PROPS", props, "WITH", validators)
  let propErrors = {}
  for(let propName in validators) {
    let propValidators = validators[propName]
    for(let validator of propValidators) {
      console.log("PROPS",props, propName)
      let error = validator(props[propName], props, propName, source)
      if(error) {
        propErrors[propName] = error
        break;
      }
    }
  }
  if(Object.keys(propErrors).length > 0) throw { properties: propErrors }
}

module.exports = function(service, cms) {
  for(let actionName in service.actions) {
    const action = service.actions[actionName]
    const validators = getValidators(action, service, action)
    if(Object.keys(validators).length > 0) {
      const oldExec = action.execute
      action.execute = (...args) => {
        validate(args[0], validators)
        return oldExec.apply(action, args)
      }
    }
  }
  for(let viewName in service.views) {
    const view = service.views[viewName]
    const validators = getValidators(view, service, view)
    if(Object.keys(validators).length > 0) {
      const oldRead = view.read
      view.read = (...args) => {
        validate(args[0], validators)
        return oldRead.apply(view, args)
      }
    }
  }
}
