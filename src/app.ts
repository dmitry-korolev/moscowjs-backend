import "./utils/config"
import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import http from "http"
import logger from "morgan"
import path from "path"

import { normalizePort } from "./utils/normalizePort"
import indexRouter from "./routes/index"
import qnaRouter from "./routes/qna"

const debug = require("debug")("moscowjs-backend:server")
const port = normalizePort(process.env.PORT || "3000")

const app = express()

app.use(logger("dev"))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, "../public")))
app.use(cors())

app.use("/", indexRouter)
app.use("/qna", qnaRouter)

app.set("port", port)

const server = http.createServer(app)
server.listen(port)
server.on("error", (error: any) => {
  if (error.syscall !== "listen") {
    throw error
  }

  var bind = typeof port === "string" ? "Pipe " + port : "Port " + port

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges")
      process.exit(1)
      break
    case "EADDRINUSE":
      console.error(bind + " is already in use")
      process.exit(1)
      break
    default:
      throw error
  }
})

server.on("listening", () => {
  const addr = server.address()
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr?.port
  debug("Listening on " + bind)
})
