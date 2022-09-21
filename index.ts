import express = require('express')
import { CronJob } from 'cron'
import { OpenSeaStreamClient } from '@opensea/stream-js'
import { WebSocket } from 'ws'

import { getAssetsExaustively, updateToken } from './utils'

const PORT = process.env.PORT || 8080
const app = express()

app.get('/', (req, res) => {
  res.send('🎉 Hello World! 🎉')
})

function handleEvent(event) {
  console.log(event)
  const splitEvent = event.payload.item.nft_id.split('/')
  const collection = splitEvent[1]
  const tokenID = splitEvent[2]
  updateToken(collection, tokenID)

  console.log('tokenID is:', tokenID, collection)
}

const server = app.listen(PORT, async () => {
  console.log(`App listening on port ${PORT}`)

  const collectionSlug = 'pudgypenguins'

  // Cronjob that runs every 24 hours
  // const job = new CronJob(
  //   '0 0 */24 * * *',
  //   async function() {
  //     console.log('Running job...getting assets');
  await getAssetsExaustively(collectionSlug)
  //   },
  //   function() {
  //     console.log(`Completed ${new Date()}`)
  //   },
  //   true,
  //   'America/Chicago'
  // );

  const client = new OpenSeaStreamClient({
    token: 'e8aafbf2081c4489a5ae3539a47d82f3',
    connectOptions: {
      transport: WebSocket,
    },
  })

  client.onItemMetadataUpdated(collectionSlug, (event) => {
    handleEvent(event)
  })

  client.onItemListed(collectionSlug, (event) => {
    handleEvent(event)
  })

  client.onItemSold(collectionSlug, (event) => {
    handleEvent(event)
  })

  client.onItemCancelled(collectionSlug, (event) => {
    handleEvent(event)
  })
})

module.exports = server
