const fs = require("fs")

function typeName(type) {
  if(!type) return null
  if(type &&  typeof type == "function") return type.name
  if(type.getTypeName) return type.getTypeName()
  return type
}
/*
function typeName( type ) {
  switch(type) {
    case String : return "String"
    case Number : return "Number"
    case Boolean : return "Boolean"
    case Array : return "Array"
    case Map : return "Map"
    default:
      if(type instanceof DataType) return type.name
      return "Object"
  }
}*/

function toJSON(data) {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if(!value) return value
    if(typeof value == "function") return value.name
    if(value.toJSON) return value.toJSON(true)
    return value
  }))
}

function setDifference(setA, setB) {
  var difference = new Set(setA)
  for (let elem of setB) difference.delete(elem)
  return difference
}

function mapDifference(mapA, mapB) {
  var difference = new Map(mapA)
  for (let key of mapB.keys()) difference.delete(key)
  return difference
}

function crudChanges(oldElements, newElements, elementName, newParamName, params = {}) {
  let changes = []
  for(let newElementName in newElements) {
    let oldElement = oldElements[newElementName]
    const newElement = newElements[newElementName]
    let renamedFrom = null
    if(newElement.oldName) {
      let oldNames = newElement.oldName.constructor === Array ? newElement.oldName : [ newElement.oldName ]
      for(let oldName of oldNames) {
        if(oldElements[oldName]) {
          renamedFrom = oldName
          oldElement = oldElements[renamedFrom]
          oldElement.renamed = true
          break;
        }
      }
    }
    if(renamedFrom) changes.push({
      operation: "rename"+elementName,
      ...params,
      from: renamedFrom,
      to: newElementName
    })
    if(!oldElement) {
      if(!oldElement) {
        let change ={
          operation: "create"+elementName,
          name: newElementName,
          ...params
        }
        change[newParamName] = newElement.toJSON()
        changes.push(change)
      }
    } else {
      if(newElement.computeChanges) {
        changes.push(...newElement.computeChanges(oldElement, params, newElementName))
      } else if(JSON.stringify(oldElement) != JSON.stringify(newElement)) {
        changes.push({
          operation: "delete"+elementName,
          ...params,
          name: newElementName
        })
        let change = {
          operation: "create" + elementName,
          name: newElementName,
          ...params
        }
        change[newParamName] = newElement.toJSON()
        changes.push(change)
      }
    }
  }
  for(let oldElementName in oldElements) {
    const oldElement = oldElements[oldElementName]
    if(!newElements[oldElementName] && !oldElement.renamed) changes.push({
      operation: "delete"+elementName,
      ...params,
      name: oldElementName
    })
  }
  return changes
}

async function loadJson(jsonPath) {
  const text = await new Promise( (resolve, reject) => {
    fs.readFile(jsonPath, "utf8", (err, res) => {
      if(err) reject(err)
      resolve(res)
    })
  })
  return JSON.parse(text)
}

async function saveJson(jsonPath, data) {
  const text = JSON.stringify(data, null, "  ")
  return await new Promise((resolve, reject) => {
    fs.writeFile(jsonPath, text, (err, res) => {
      if(err) reject(err)
      resolve(res)
    })
  })
}

async function exists(path) {
  return await new Promise((resolve, reject) => {
    fs.access(path, (err, res) => {
      if(err) resolve(false)
      resolve(true)
    })
  })
}

module.exports = {
  typeName, toJSON, setDifference, mapDifference, crudChanges, loadJson, saveJson, exists
}
