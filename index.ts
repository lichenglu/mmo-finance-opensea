import express = require('express')
const ethers = require('ethers');
import { CronJob } from 'cron'
import { OpenSeaStreamClient } from '@opensea/stream-js'
import { WebSocket } from 'ws'
import { create } from 'apisauce'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import Web3 from 'web3'
import abiDecoder from 'abi-decoder'
import openseaContract from './abis/seaborn.json'

import { getAssetsExaustively, updateToken, sleep } from './utils'
import { 
  testFSConnection, 
  getAdvancedOffers, 
  setAdvancedOffers, 
  removeAdvancedOffers 
} from './firestore/operations'

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

async function handleEvent(event, collectionSlug) {
  try {
    console.log(event)
    
    if (event.payload?.item?.nft_id) {
      const splitEvent = event.payload.item.nft_id.split('/')
      const collection = splitEvent[1]
      const tokenID = splitEvent[2]
      const firestoreCollectionName = getFirestoreCollectionName(collectionSlug)
      updateToken(collection, tokenID, firestoreCollectionName)
  
      console.log('tokenID is:', tokenID, collection)
    }

    // item is sold
    if (event.event_type === 'item_sold') {
      handleOfferAccpted(event, collectionSlug)
    }

    // offer is cancelled
    if (event.event_type === 'item_cancelled') {
      updateOffer(event, collectionSlug)
    }
  } catch (err) {
    console.log(err)
  }
}

const handleOfferAccpted = async (event: any, collectionSlug: string) => {
  // for sale, we can get the offer order hash directly
  if (event.payload?.order_hash) {
    await removeAdvancedOffers([{ order_hash: event.payload.order_hash }], `${slugToAddress[collectionSlug]}_advanced_offers`)
  }
}

async function updateOffer(event: any, collectionSlug: string) {
  try {
    const txHash = event.payload.transaction.hash
  
    abiDecoder.addABI(openseaContract);      
    const receipt = await web3.eth.getTransactionReceipt(txHash);
    const decodedLogs = abiDecoder.decodeLogs(receipt.logs);    
    const target = decodedLogs
      .find(log => log.name === 'OrderCancelled')?.events?.find(event => event.name === 'orderHash')

    console.log(decodedLogs, target)

    if (target) {
      await removeAdvancedOffers([{ order_hash: target.value }], `${slugToAddress[collectionSlug]}_advanced_offers`)
    }
  } catch (err) {
    console.log(err)
  }
}

const slugToAddress = {
  'pudgypenguins': '0xbd3531da5cf5857e7cfaa92426877b022e612cf8',
  'lilpudgys': '0x524cab2ec69124574082676e6f654a18df49a048'
}

const addressToFixedItemID = {
  '0xbd3531da5cf5857e7cfaa92426877b022e612cf8': 0,
  '0x524cab2ec69124574082676e6f654a18df49a048': 17275
}

function getFirestoreCollectionName(collectionSlug) {
  switch (collectionSlug) {
    case 'pudgypenguins':
      return 'OpenSeaPudgyPenguins'
    case 'lilpudgys':
      return 'OpenSeaLilPudgys'
    default:
      return 'N/A'
  }
}

async function performAdvancedOfferJob(tokenAddress: string) {
  const collectionName = `${tokenAddress}_advanced_offers`
  const res = await api.get(`/api/v1/asset/${tokenAddress}/${addressToFixedItemID[tokenAddress]}/offers`)
  if (res.ok) {
    // @ts-ignore
    const advancedOffers = res.data.seaport_offers.filter(
      (bid: any) => bid.side === 'bid' && bid.order_type === 'criteria'
    )
    const currentOffers = await getAdvancedOffers(collectionName)
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
    await removeAdvancedOffers(offersToBeRemoved, collectionName)
    await setAdvancedOffers(updatedOffers, collectionName)
    console.log(`Completed ${new Date()}`)
  }
}


dayjs.extend(utc)
dayjs.extend(timezone)

const server = app.listen(PORT, async () => {
  console.log(`App listening on port ${PORT}`)

  // const collectionSlug = 'pudgypenguins'
  const PudgyPenguinSlug = 'pudgypenguins'
  const LilPudgySlug = 'lilpudgys'

  const firestoreCollectionName = getFirestoreCollectionName(LilPudgySlug)
  
  // await getAssetsExaustively(LilPudgySlug, firestoreCollectionName)

  const openseaOfferJob = new CronJob(
    '*/60 * * * * *',
    async function () {
      try {
        console.log('Running job...getting assets')
        for (const address of Object.values(slugToAddress)) {
          performAdvancedOfferJob(address)
          await sleep(1000)
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

  client.onItemMetadataUpdated(PudgyPenguinSlug, (event) => {
    handleEvent(event, PudgyPenguinSlug)
  })

  client.onItemListed(PudgyPenguinSlug, (event) => {
    handleEvent(event, PudgyPenguinSlug)
  })

  client.onItemSold(PudgyPenguinSlug, (event) => {
    handleEvent(event, PudgyPenguinSlug)
  })

  client.onItemCancelled(PudgyPenguinSlug, (event) => {
    handleEvent(event, PudgyPenguinSlug)
  })

  client.onItemMetadataUpdated(LilPudgySlug, (event) => {
    handleEvent(event, LilPudgySlug)
  })

  client.onItemListed(LilPudgySlug, (event) => {
    handleEvent(event, LilPudgySlug)
  })

  client.onItemSold(LilPudgySlug, (event) => {
    handleEvent(event, LilPudgySlug)
  })

  client.onItemCancelled(LilPudgySlug, (event) => {
    handleEvent(event, LilPudgySlug)
  })
})

module.exports = server
