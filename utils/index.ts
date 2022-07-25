import fetch from 'node-fetch';
import { addNFTItems } from '../firestore/operations'

export async function getAssets(collection: string, cursor?: string) {
    const options = {
        method: 'GET',
        headers: {Accept: 'application/json', 'X-API-KEY': 'e8aafbf2081c4489a5ae3539a47d82f3'}
    };
    
    let url = `https://api.opensea.io/api/v1/assets?collection_slug=${collection}&order_direction=desc&limit=${50}&include_orders=true`
    
    if (cursor) {
        url += `&cursor=${cursor}`
    }

    const res = await fetch(
        url, 
        options
    )
        .then(res => res.json())

    return res
}

export async function getAssetsExaustively(collection: string) {
    let counter = 0
    console.log(`Fetching page ${counter}...`)
    
    let res = await getAssets(collection)
    const assets = res.assets.map(formatItem)
    
    await addNFTItems(assets)
    
    while (res.next) {
        counter += 1
        console.log(`Fetching page ${counter}...`)
        res = await getAssets(collection, res.next)
        const assets = res.assets.map(formatItem)
        await addNFTItems(assets)
    }

    console.log('No more assets to fetch')
}

function formatItem(item: {
    [key: string]: any,
    sell_orders?: { listing_time: number, current_price: number }[], 
    seaport_sell_orders?: { listing_time: number, current_price: number }[] 
}) {
    item.current_price = (item.seaport_sell_orders?.[0]?.current_price ?? item.sell_orders?.[0]?.current_price) ?? null
    item.listing_time = (item.seaport_sell_orders?.[0]?.listing_time ?? item.sell_orders?.[0]?.listing_time) ?? null
    return item
}