import { db } from '.'

interface NFTAsset {
    token_id: string
}

export async function addNFTItem(item: NFTAsset) {
    const nftRef = db.collection('OpenSeaPudgyPenguins').doc(item.token_id);
    await nftRef.set(item, { merge: true });
}

export async function addNFTItems(items: NFTAsset[]) {
    await Promise.all(items.map(async item => {
        const nftRef = db.collection('OpenSeaPudgyPenguins').doc(item.token_id);
        await nftRef.set(item, { merge: true });
    }))
}
