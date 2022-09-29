import fetch from 'node-fetch'
import { addNFTItem, addNFTItems } from '../firestore/operations'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getAssets(collection: string, cursor?: string) {
  const options = {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-KEY': 'e8aafbf2081c4489a5ae3539a47d82f3' },
  }

  let url = `https://api.opensea.io/api/v1/assets?collection_slug=${collection}&order_direction=desc&limit=${50}&include_orders=true`

  if (cursor) {
    url += `&cursor=${cursor}`
  }

  const res = await fetch(url, options).then((res) => res.json())

  return res
}

export async function updateToken(collection: string, tokenID: string, firestoreCollectionName: string) {
  const options = {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-API-KEY': 'e8aafbf2081c4489a5ae3539a47d82f3' },
  }

  let url = `https://api.opensea.io/api/v1/asset/${collection}/${tokenID}/?include_orders=true`

  const res = await fetch(url, options).then((res) => res.json())
  const item = formatItem(res)
  await addNFTItem({ ...item, token_id: tokenID }, firestoreCollectionName)
  console.log('Updated tokenID:', tokenID, firestoreCollectionName)
}

export async function getAssetsExaustively(collection: string, firestoreCollectionName: string) {
  let counter = 0
  console.log('Getting asses exhaustively for:', collection, 'and storing in:', firestoreCollectionName)
  console.log(`Fetching page ${counter}...`)

  let res = await getAssets(collection)
  const assets = res.assets.map(formatItem)

  await addNFTItems(assets, firestoreCollectionName)

  while (res.next) {
    await sleep(1000)
    counter += 1
    console.log(`Fetching page ${counter}...`)
    res = await getAssets(collection, res.next)
    if (res.assets) {
      const assets = res.assets.map(formatItem)
      await addNFTItems(assets, firestoreCollectionName)
    } else {
      console.log('request was throttled, waiting 3 seconds before trying again')
      await sleep(3000)
    }
  }

  console.log('No more assets to fetch')
}

function formatItem(item: {
  [key: string]: any
  sell_orders?: { listing_time: number; current_price: number }[]
  seaport_sell_orders?: { listing_time: number; current_price: number; side: string | number; protocol_data: any }[]
}) {
  item.listing_time = null
  item.current_price = null
  if (item.seaport_sell_orders) {
    if (
      item.seaport_sell_orders[0].protocol_data.parameters.consideration[0].token ===
        '0x0000000000000000000000000000000000000000' &&
      item.seaport_sell_orders[0].side === 'ask'
    ) {
      item.current_price = Number(item.seaport_sell_orders[0].current_price)
      item.listing_time = item.seaport_sell_orders[0].listing_time
    }
  }
  return item
}
