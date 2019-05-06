

class Entity {
  constructor( model, id) {
    this.model = model
    this.id = id
    this.data = null
  }

  async update(data, options) {
    this.data = await this.model.update(this.id, data, options)
    return this
  }

  async flush() {
    this.data = null
    return this
  }

  async get() {
    if(this.data) return this.data
    this.data = await this.model.get(this.id)
    return this.data
  }

  async delete() {
    this.model.delete(this.id)
  }
}

module.exports = Entity
