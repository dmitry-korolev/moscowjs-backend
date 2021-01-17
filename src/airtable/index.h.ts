export type AirtableRecord<T> = {
  id: string
  fields: Partial<T>
  createdTime: string
}
