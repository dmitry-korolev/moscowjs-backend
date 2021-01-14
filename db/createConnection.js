const BottleNeck = require('bottleneck');
const Airtable = require('airtable')
const LRU = require("lru-cache")
const debug = require('debug')('moscowjs-backend:server');
const querystring = require('querystring');

const connection = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
})

const dbs = new Map()

module.exports = {
    createConnection(dbId) {
        if (dbs.has(dbId)) {
            return dbs.get(dbId)
        }
        
        const cache = new LRU({
            max: 1024 * 1024 * 10,
            maxAge: 1000 * 60 * 60,
            length: (n) => JSON.stringify(n).length
        })
        const base = connection.base(dbId)
        const rateLimiter = new BottleNeck({
            minTime: 1050 / 5 // Max 5 requests per second
        })
    
        const db = {
            find: async (tableId, recordId) => {
                const key = `find_${tableId}_${recordId}`

                if (cache.has(key)) {
                    return cache.get(key)
                }

                try {
                    const result = await rateLimiter.schedule(() => base(tableId).find(recordId))
                    cache.set(key, result._rawJson)
                    return result._rawJson
                } catch (error) {
                    debug(error)
                    cache.set(key, null)
                    return null
                }
            },
            select: async (tableId, options = {}) => {
                const key = `select_${tableId}_${querystring.stringify(options)}`

                if (cache.has(key)) {
                    return cache.get(key)
                }
                
                try {
                    const result = await rateLimiter.schedule(() => {
                        return base(tableId).select(options).all().then(results => {
                            return results.map(r => r._rawJson)
                        })
                    })
                    cache.set(key, result)
                    return result
                } catch (error) {
                    debug(error)
                    cache.set(key, [])
                    return []
                }
            },
            create: async (tableId, records) => {
                try {
                    const result = await rateLimiter.schedule(() => {
                        return base(tableId).create(records).then(results => {
                            return results.map(r => r._rawJson)
                        })
                    })
                    cache.forEach((_, key, cache) => {
                        if (key.startsWith(`select_${tableId}`)) {
                            cache.del(key)
                        }
                    })
                    return result
                } catch (error) {
                    debug(error)
                    return []
                }
            },
            update: async (tableId, records) => {
                try {
                    const ids = new Set(records.map(r => r.id))
                    const result = await rateLimiter.schedule(() => {
                        return base(tableId).update(records).then(results => {
                            return results.map(r => r._rawJson)
                        })
                    })
                    cache.forEach((_, key, cache) => {
                        ids.forEach(recordId => {
                            if (key === `find_${tableId}_${recordId}`) {
                                ids.delete(recordId)
                                cache.del(key)
                            }
                        })
                        if (key.startsWith(`select_${tableId}`)) {
                            cache.del(key)
                        }
                    })
                    return result
                } catch (error) {
                    debug(error)
                    return []
                }
            }
        }
        
        dbs.set(dbId, db)
        return db
    }
}

/*
    readonly find: TableFindRecord;
    readonly select: (params?: QueryParams) => Query;
    readonly create: TableCreateRecords;
    readonly update: TableChangeRecords;
*/