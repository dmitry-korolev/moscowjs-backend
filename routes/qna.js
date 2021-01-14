const express = require('express');
const debug = require('debug')('moscowjs-backend:qna');
const db = require('../db/createConnection')
    .createConnection('appla5btg5ZqeMkwM')
const { pick, curryN } = require('ramda')

const router = express.Router();

const transformRecord = curryN(2, (userId, record) => {
    const votes = record.fields?.votes?.split(',') ?? []

    return {
        id: record.id,
        userHasVoted: votes.includes(userId),
        votes: votes.length,
        ...pick(['author', 'question', 'created'], record.fields)
    }
})

router.get('/:tableId', async (req, res) => {
    const { tableId } = req.params
    const userId = encodeURIComponent(req.header('user_id'))
    const result = (await db.select(tableId)).map(transformRecord(userId))

    res.json(result);
});

router.post('/:tableId', async (req, res) => {
    const { tableId } = req.params
    const userId = encodeURIComponent(req.header('user_id'))
    const fields = pick(['author', 'question', 'author_contact'], req.body)

    if (!fields.question) {
        return res.json({})
    }

    const result = (await db.create(tableId, [{ fields }])).map(transformRecord(userId))
    res.json(result[0])
})

router.post('/vote/:tableId/:recordId', async (req, res) => {
    const { tableId, recordId } = req.params
    const userId = encodeURIComponent(req.header('user_id') || '')
    
    if (!userId) {
        return res.json(null)
    }

    const record = await db.find(tableId, recordId)

    if (!record) {
        return res.json(null)
    }

    const votes = record.fields?.votes?.split(',') || []

    if (votes.includes(userId)) {
        return res.json(transformRecord(userId, record))
    }

    const result = await db.update(tableId, [{
        id: recordId,
        fields: {
            votes: votes.concat(userId).join(',')
        }
    }])

    debug(result)

    res.json(transformRecord(userId, result[0]))
})

module.exports = router;
