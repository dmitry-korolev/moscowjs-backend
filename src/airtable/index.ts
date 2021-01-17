import AirtableBase from "airtable"
import debug, { Debugger } from "debug"
import BottleNeck from "bottleneck"
import LRU from "lru-cache"
import querystring from "querystring"
import Table from "airtable/lib/table"
import { QueryParams } from "airtable/lib/query_params"
import { AirtableRecord } from "./index.h"

const connection = new AirtableBase({
  apiKey: process.env.AIRTABLE_API_KEY,
})

const rateLimiter = new BottleNeck({
  minTime: 1050 / 5,
})

export class Airtable<T> {
  private cache: LRU<string, Array<AirtableRecord<T>>>
  private table: Table
  private debug: Debugger

  constructor(private databaseName: string, private tableName: string) {
    if (!databaseName) {
      console.error("Database name is empty!")
      process.exit(1)
    }

    this.cache = new LRU({
      max: 1024 * 1024 * 10,
      maxAge: 1000 * 60 * 60,
      length: n => JSON.stringify(n).length,
    })

    this.table = connection.base(databaseName).table(tableName)
    this.debug = debug(`moscowjs-backend:qna:${databaseName}/${tableName}`)
  }

  clearCache() {
    this.cache.reset()
  }

  async find(options: {
    recordId: string
    refresh?: boolean
  }): Promise<AirtableRecord<T>> {
    this.debug("find", options)
    const { recordId, refresh } = options
    const key = `find_${recordId}`

    if (!refresh && this.cache.has(key)) {
      return this.cache.get(key)![0]
    }

    const result = await rateLimiter.schedule(() => this.table.find(recordId))
    this.cache.set(key, [result._rawJson])
    return result._rawJson
  }

  async select(
    options: {
      selectOptions?: QueryParams
      refresh?: boolean
    } = {}
  ): Promise<Array<AirtableRecord<T>>> {
    this.debug("select", options)
    const { selectOptions = {}, refresh } = options
    const key = `select_${querystring.stringify(selectOptions as any)}`

    if (!refresh && this.cache.has(key)) {
      return this.cache.get(key)!
    }

    const result = await rateLimiter.schedule(() => {
      return this.table
        .select(selectOptions)
        .all()
        .then(results => results.map(r => r._rawJson))
    })
    this.cache.set(key, result)
    return result
  }

  async create(options: {
    records: Array<{ fields: Partial<Omit<T, "id">> }>
  }): Promise<Array<AirtableRecord<T>>> {
    this.debug("create", options)
    const { records } = options
    const result = await rateLimiter.schedule(() => {
      return this.table
        .create(records)
        .then(results => results.map(r => r._rawJson))
    })

    this.cache.reset()

    return result
  }

  async update(options: {
    records: Array<{
      id: string
      fields: Partial<T>
    }>
  }): Promise<Array<AirtableRecord<T>>> {
    this.debug("update", options)
    const { records } = options
    const result = await rateLimiter.schedule(() => {
      return this.table
        .update(records)
        .then(results => results.map(r => r._rawJson))
    })

    this.cache.reset()
    return result
  }
}
