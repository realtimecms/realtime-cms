const utils = require("../utils.js")

module.exports = function(service, cms) {
  const generateIndexName = (modelName) => {
    return (cms.searchIndexPrefix+"_"+service.name+"_"+modelName).toLowerCase()
  }

  for(let modelName in service.models) {
    const index = generateIndexName(modelName)
    const model = service.models[modelName]
    if (!model.search) continue

    if(!model.onChange) model.onChange = []
    model.onChange.push(async function(id, oldValue, newValue) {
      const search = await cms.connectToSearch()
      if(newValue) { // Update or Insert
        search.create({ index, id, body: newValue })
      } else {
        search.delete({ index, id })
      }
    })
  }
}