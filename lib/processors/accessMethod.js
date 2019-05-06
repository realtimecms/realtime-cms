function getAccessMethod(access) {
  if(typeof access == 'function') {
    return access
  } else if(Array.isArray(access)) {
    return (params, {service, client}) => {
      for(let role of view.access) if(client.roles.includes('admin')) return true
      return false
    }
  } else throw new Error("unknown view access definition "+view.access)
}

module.exports = getAccessMethod