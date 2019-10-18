const utils = require("../utils.js")

function propertyWithoutValidation(property) {
  let prop = { ...property }
  delete prop.validation
  if(prop.draftValidation) prop.validation = prop.draftValidation
  if(prop.of) prop.of = withoutValidation(prop.of)
  if(prop.properties) prop.properties = propertiesWithoutValidation(prop)
  return prop
}

function propertiesWithoutValidation(properties, validateFields) {
  let propertiesWV = {}
  for(let k in properties) {
    propertiesWV[k] =
        (validateFields && validateFields.indexOf(k) != -1)
        ? properties[k]
        : propertyWithoutValidation(properties[k])
  }
  return propertiesWV
}

module.exports = function(service, cms) {
  if(!service) throw new Error("no service")
  if(!cms) throw new Error("no service")
  for(let actionName in service.actions) {
    const action = service.actions[actionName]
    if (!action.draft) continue

    const actionExecute = action.execute
    const draft = action.draft
    const steps = draft.steps

    const modelName = `${actionName}_draft`
    let indexes = {}
    let properties = {
      ...action.properties
    }

    if(draft.identification) {
      properties = {
        ...(draft.identification),
        ...properties
      }
      indexes.identifier = {
        property: Object.keys(draft.identification)
      }
    }

    if(draft.steps) {
      properties = {
        draftStep: {
          type: String
        },
        ...properties
      }
    }

    const DraftModel = service.model({
      name: modelName,
      properties,
      indexes
    })
    function modelRuntime() {
      return service._runtime.models[modelName]
    }

    const propertiesWV = propertiesWithoutValidation(properties, draft.validateFields)

    service.action({
      name: `${actionName}_saveDraft`,
      properties: {
        ...propertiesWV,
        draft: {
          type: String
        }
      },
      access: draft.saveAccess || draft.access || action.access,
      async execute(params, {service, client}, emit) {
        let draft = params.draft
        if(!draft) draft = cms.generateUid()
        let data = {}
        for(let k in properties) data[k] = params[k]
        if(service.eventSourcing) {
          emit({
            type: `${actionName}_draftSaved`,
            draft, data
          })
        } else {
          await modelRuntime().create({...data, id: draft}, { conflict: 'replace' })
        }
        return draft
      }
    })
    service.event({
      name: `${actionName}_draftSaved`,
      async execute(props) {
        await modelRuntime().create({...props.data, id: props.draft}, { conflict: 'replace' })
      }
    })

    service.action({
      name: `${actionName}_deleteDraft`,
      properties: {
        draft: {
          type: String,
          validation: ['nonEmpty']
        }
      },
      access: draft.deleteAccess || draft.access || action.access,
      async execute(params, {service, client}, emit) {
        if(service.eventSourcing) {
          emit({
            type: `${actionName}_draftDeleted`,
            draft: params.draft
          })
        } else {
          await modelRuntime().delete(draft)
        }
      }
    })
    service.event({
      name: `${actionName}_draftDeleted`,
      async execute({draft}) {
        await modelRuntime().delete(draft)
      }
    })

    service.action({
      name: `${actionName}_finishDraft`,
      properties: {
        ...propertiesWV,
        draft: {
          type: String
        }
      },
      access: draft.finishAccess || draft.access || action.access,
      async execute(params, context, emit) {
        let draft = params.draft
        if(!draft) draft = cms.generateUid()
        let actionProps = {}
        for(let k in action.properties) actionProps[k] = params[k]
        const result = await actionExecute.call(action, actionProps, context, emit)
        if(service.eventSourcing) {
          emit({
            type: `${actionName}_draftFinished`,
            draft
          })
        } else {
          await modelRuntime().delete(draft)
        }
        return result
      }
    })
    service.event({
      name: `${actionName}_draftFinished`,
      async execute({draft}) {
        await modelRuntime().delete(draft)
      }
    })

    service.view({
      name: `${actionName}_draft`,
      properties: {
        draft: {
          type: String,
          validation: ['nonEmpty']
        }
      },
      returns: {
        type: DraftModel
      },
      access: draft.readAccess || draft.access || action.access,
      read({ draft }) {
        return modelRuntime().table.get(draft)
      }
    })

    if(draft.identification) {
      service.view({
        properties: {
          ...draft.identification
        },
        name: `${actionName}_drafts`,
        access: draft.listAccess || draft.access || action.access,
        read(params) {
          const ident = Object.keys(draft.identification).map(p => params[p])
          return modelRuntime().table.getAll(ident, { index: 'identifier' })
        }
      })
    }

    if(steps) {
      for(let i = 0; i < steps.length; i++) {
        const step = steps[i]
        const nextStep = steps[i + 1]

        //console.log("ACTION PROPERTIES", action.properties)
        const stepProperties = {}
        for(let fieldName of step.fields) {
          utils.setProperty({ properties: stepProperties }, fieldName, utils.getProperty(action, fieldName))
        }
        const stepPropertiesVW = propertyWithoutValidation(stepProperties)

        //console.log(`STEP ${step.name} PROPERTIES`, stepProperties)
        //console.log(`STEP ${step.name} PROPERTIES VW`, stepPropertiesVW)

        service.action({
          name: `${actionName}_saveStepDraft_${step.name || i}`,
          properties: stepPropertiesVW,
          async execute(params, {service, client}, emit) {
            let draft = params.draft
            if(!draft) draft = cms.generateUid()
            let data = {}
            for(let k in properties) data[k] = params[k]
            if(service.eventSourcing) {
              emit({
                type: `${actionName}_stepDraftSaved`,
                draft, data,
                draftStep: step.name || i
              })
            } else {
              await modelRuntime().create({...data, id: draft, draftStep: step.name || i}, { conflict: 'update' })
            }
            return draft
          }
        })
        service.event({
          name: `${actionName}_stepDraftSaved`,
          async execute(props) {
            await modelRuntime().create({...props.data, id: props.draft, draftStep: props.draftStep}, { conflict: 'update' })
          }
        })

        service.action({
          name: `${actionName}_finishStep_${step.name || i}`,
          properties: stepProperties,
          async execute(params, context, emit) {
            let data = {}
            for (let k in stepProperties) data[k] = params[k]
            if(nextStep) {
              let draft = params.draft
              if(!draft) draft = cms.generateUid()
              delete data.draftStep
              if (service.eventSourcing) {
                emit({
                  type: `${actionName}_stepSaved`,
                  draft, data,
                  draftStep: step.name || i,
                  draftNextStep: nextStep.name || (i + 1)
                })
              } else {
                await modelRuntime().create({...data, id: draft, draftStep: step.name || i}, {conflict: 'replace'})
              }
              return draft
            } else {
              let actionProps = params.draft ? await modelRuntime().get(params.draft) : {}
              delete actionProps.draft
              delete actionProps.draftStep
              utils.mergeDeep(actionProps, data)
              const result = await actionExecute.call(action, actionProps, context, emit)
              if(params.draft) {
                if (service.eventSourcing) {
                  emit({
                    type: `${actionName}_draftFinished`,
                    draft: params.draft
                  })
                } else {
                  await modelRuntime().delete(params.draft)
                }
              }
              return result
            }
          }
        })
        service.event({
          name: `${actionName}_stepSaved`,
          async execute(props) {
            await modelRuntime().create({...props.data, id: props.draft, draftStep: props.draftStep}, { conflict: 'update' })
          }
        })

      }
    }

  }
}