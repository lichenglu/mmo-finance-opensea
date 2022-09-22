import express = require('express')
import { CronJob } from 'cron'
import { OpenSeaStreamClient } from '@opensea/stream-js'
import { WebSocket } from 'ws'
import { create } from 'apisauce'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import Web3 from 'web3'
import abiDecoder from 'abi-decoder'

import { getAssetsExaustively, updateToken } from './utils'
import { testFSConnection, getAdvancedOffers, setAdvancedOffers, removeAdvancedOffers } from './firestore/operations'

const PORT = process.env.PORT || 8080
const app = express()

const web3 = new Web3(
  new Web3.providers.HttpProvider(
    "https://mainnet.infura.io/v3/314d9faa6cfc41de91e44fee7a998cdf"
  )
);

const api = create({
  baseURL: `https://api.opensea.io`,
  headers: { 'X-API-KEY': 'e8aafbf2081c4489a5ae3539a47d82f3' },
})

app.get('/', (req, res) => {
  res.send('🎉 Hello World! 🎉')
})

function handleEvent(event) {
  try {
    console.log(event)
    const splitEvent = event.payload.item.nft_id.split('/')
    const collection = splitEvent[1]
    const tokenID = splitEvent[2]
    updateToken(collection, tokenID)
  
    console.log('tokenID is:', tokenID, collection)
  } catch (err) {
    // offer is cancelled
    if (event.event_type === 'item_cancelled') {
      updateOffer(event)
    }
  }
}

async function updateOffer(event) {
  try {
    const txHash = event.payload.transaction.hash
    const tx = await web3.eth.getTransaction(txHash);
    const abi_endpoint = `https://api.etherscan.io/api?module=contract&action=getabi&address=${tx["to"]}&apikey=TNRPI8NG884HB8SAWQMV5XP2BJ357JBZ74`;
  
    const res = await api.get(abi_endpoint);
    if (res.ok) {
      const abi = JSON.parse(res.data["result"]);
      abiDecoder.addABI(abi);      
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      const decodedLogs = abiDecoder.decodeLogs(receipt.logs);    
      const event = decodedLogs
        .find(log => log.name === 'OrderCancelled')
        ?.events
        ?.find(event => event.name === 'orderHash')

      console.log(decodedLogs, event)

      if (event) {
        await removeAdvancedOffers([{ order_hash: event.value }])
      }
    }
  } catch (err) {
    console.log(err)
  }
}

dayjs.extend(utc)
dayjs.extend(timezone)

const server = app.listen(PORT, async () => {
  console.log(`App listening on port ${PORT}`)

  const collectionSlug = 'pudgypenguins'

  // Cronjob that runs every 24 hours
  // const job = new CronJob(
  //   '0 0 */24 * * *',
  //   async function() {
  //     console.log('Running job...getting assets');
  // await getAssetsExaustively(collectionSlug)
  //   },
  //   function() {
  //     console.log(`Completed ${new Date()}`)
  //   },
  //   true,
  //   'America/Chicago'
  // );

  const openseaOfferJob = new CronJob(
    '*/60 * * * * *',
    async function () {
      try {
        console.log('Running job...getting assets')
        const tokenAddress = '0xbd3531da5cf5857e7cfaa92426877b022e612cf8'

        const res = await api.get(`/api/v1/asset/${tokenAddress}/0/offers`)
        if (res.ok) {
          // @ts-ignore
          const advancedOffers = res.data.seaport_offers.filter(
            (bid: any) => bid.side === 'bid' && bid.order_type === 'criteria'
          )
          const currentOffers = await getAdvancedOffers()
          const now = dayjs(undefined, { utc: true })
          const newOffers = advancedOffers.filter((offer: any) => !currentOffers[offer.order_hash])
          newOffers.forEach((offer) => {
            currentOffers[offer.order_hash] = offer
          })
          const updatedOffers = []
          const offersToBeRemoved = []
          Object.entries(currentOffers).forEach(([key, value]: [any, any]) => {
            if (now.isBefore(dayjs.utc(value.closing_date))) {
              updatedOffers.push(value)
            } else {
              offersToBeRemoved.push(value)
            }
          })
          await removeAdvancedOffers(offersToBeRemoved)
          await setAdvancedOffers(updatedOffers)
          console.log(`Completed ${new Date()}`)
        }
      } catch (err) {
        console.log(err)
      }
    },
    function () {
      console.log(`Completed ${new Date()}`)
    },
    true,
    'America/Chicago'
  )

  testFSConnection()

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

  client.onItemReceivedOffer(collectionSlug, (event) => {
    console.log(event)
  })

  client.onItemTransferred(collectionSlug, (event) => {
    console.log(event)
  })
})

module.exports = server
