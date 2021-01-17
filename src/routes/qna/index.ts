import express from "express"
import { Airtable } from "../../airtable"
import { pick } from "ramda"
import { AirtableRecord } from "../../airtable/index.h"
const router = express.Router()

type Question = {
  question: string
  author: string
  author_contact: string
  votes: string
  created: string
}
type Config = {
  current: string
  table: Airtable<Question>
}

const configTable = new Airtable<{ name: string; value: string }>(
  process.env.AIRTABLE_BASE_ID_QNA!,
  "config"
)
let configPromise: Promise<Config>
const getConfig = () => {
  if (configPromise) return configPromise

  return (configPromise = new Promise<Config>(async resolve => {
    const config: Config = (await configTable.select({ refresh: true })).reduce(
      (result, record) => {
        result[record.fields.name!] = record.fields.value
        return result
      },
      {} as any
    )

    config.table = new Airtable<Question>(
      process.env.AIRTABLE_BASE_ID_QNA!,
      config.current
    )

    resolve(config)
  }))
}

const transformRecord = (userId: string, record: AirtableRecord<Question>) => {
  const votes = record?.fields.votes?.split(",") ?? []

  return {
    id: record.id,
    userHasVoted: votes.includes(userId),
    votes: votes.length,
    ...pick(["author", "question", "created"], record.fields),
  }
}

router.get("/", async (req, res) => {
  const userId = encodeURIComponent(req.header("user_id") || "")
  const refresh = req.header("refresh")
  const { table } = await getConfig()

  const result = (
    await table.select({ refresh: refresh === "refresh" })
  ).map(record => transformRecord(userId, record))

  res.json(result)
})

router.get("/clear_cache", async (req, res) => {
  const { table } = await getConfig()

  table.clearCache()

  res.json({ ok: true })
})

router.post("/", async (req, res) => {
  const userId = encodeURIComponent(req.header("user_id") || "")
  const { table } = await getConfig()
  const fields: Partial<
    Pick<Question, "author" | "question" | "author_contact">
  > = pick(["author", "question", "author_contact"], req.body)

  if (!fields.question) {
    return res.json([])
  }

  const result = (
    await table.create({
      records: [{ fields }],
    })
  ).map(record => transformRecord(userId, record))

  res.json(result)
})

router.post("/vote/:recordId", async (req, res) => {
  const { recordId } = req.params
  const userId = encodeURIComponent(req.header("user_id") || "")
  const { table } = await getConfig()

  if (!userId) {
    return res.json([])
  }

  const record = await table.find({
    recordId,
  })

  if (!record) {
    return res.json([])
  }

  const votes = record.fields.votes?.split(",") ?? []

  if (votes.includes(userId)) {
    return res.json([transformRecord(userId, record)])
  }

  const result = await table.update({
    records: [
      {
        id: recordId,
        fields: {
          votes: votes.concat(userId).join(","),
        },
      },
    ],
  })

  res.json(result.map(r => transformRecord(userId, r)))
})

export default router
