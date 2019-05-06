const PropertyDefinition = require("./PropertyDefinition.js")
const utils = require("../utils.js")

class ModelDefinition {

  constructor(definition) {
    this.properties = {}
    for(let key in definition) this[key] = definition[key]
    if(definition.properties) {
      for (let propName in definition.properties) {
        const propDefn = definition.properties[propName]
        this.createAndAddProperty(propName, propDefn)
      }
    }
  }

  getTypeName() {
    return this.name
  }

  createAndAddProperty(name, definition) {
    const property = new PropertyDefinition(definition)
    this.properties[name] = property
  }

  toJSON() {
    let properties = {}
    for(let propName in this.properties) {
      properties[propName] = this.properties[propName].toJSON()
    }
    return {
      ... this,
      properties
    }
  }

  computeChanges( oldModelParam ) {
    let oldModel = JSON.parse(JSON.stringify(oldModelParam))
    oldModel.indexes = oldModel.indexes || {}
    let changes = []
    changes.push(...utils.crudChanges(oldModel.properties || {}, this.properties || {},
        "Property", "property", { model: this.name }))
    changes.push(...utils.crudChanges(oldModel.indexes || {}, this.indexes || {},
        "Index", "index", { model: this.name }))

    return changes
  }



}

module.exports = ModelDefinition