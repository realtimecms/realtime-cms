const utils = require("../utils.js")

class PropertyDefinition {

  constructor(definition) {
    for(let key in definition) this[key] = definition[key]
  }

  toJSON() {
    let json = {
      ...this,
      type: utils.typeName(this.type)
    }
    if(this.of) {
      json.of.type = utils.typeName(json.of.type)
    }
    return json
  }

  computeChanges( oldProperty, params, name) {
    let changes = []
    let typeChanged = false
    if(utils.typeName(this.type) != utils.typeName(oldProperty.type)) typeChanged = true
    if(this.of && utils.typeName(this.of.type) != utils.typeName(oldProperty.of.type)) typeChanged = true
    if(typeChanged) {
      changes.push({
        operation: "changePropertyType",
        ...params,
        property: name,
        ...this
      })
    }
    return changes
  }

}

module.exports = PropertyDefinition
