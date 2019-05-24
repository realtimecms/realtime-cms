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

async function validate(props, validators, source) {
  //console.log("VALIDATE PROPS", props, "WITH", validators)
  let propPromises = {}
  for(let propName in validators) {
    let propValidators = validators[propName]
    let promises = []
    for(let validator of propValidators) {
      //console.log("PROPS",props, propName)
      promises.push(validator(props[propName], props, propName, source))
    }
    propPromises[propName] = Promise.all(promises)
  }
  let propErrors = {}
  for(let propName in validators) {
    let errors = (await propPromises[propName]).filter(e=>!!e)
    console.log("EERRS",propName, errors)
    if(errors.length > 0) {
      console.log("ERRS", propName)
      propErrors[propName] = errors[0]
    }
  }
  console.log("PROP ERRORS", propErrors)
  if(Object.keys(propErrors).length > 0) throw { properties: propErrors }
}

module.exports = function(service, cms) {
  for(let actionName in service.actions) {
    const action = service.actions[actionName]
    const validators = getValidators(action, service, action)
    if(Object.keys(validators).length > 0) {
      const oldExec = action.execute
      action.execute = async (...args) => {
        return validate(args[0], validators).then(() =>
          oldExec.apply(action, args)
        )
      }
    }
  }
  for(let viewName in service.views) {
    const view = service.views[viewName]
    const validators = getValidators(view, service, view)
    if(Object.keys(validators).length > 0) {
      const oldRead = view.read
      view.read = async (...args) => {
        return validate(args[0], validators).then(() =>
          oldRead.apply(view, args)
        )
      }
    }
  }
}