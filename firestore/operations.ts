import { db } from '.'

interface NFTAsset {
  token_id: string
}

export async function addNFTItem(item: NFTAsset, firestoreCollectionName: string) {
  const nftRef = db.collection(firestoreCollectionName).doc(item.token_id)
  await nftRef.set(item, { merge: true })
}

export async function addNFTItems(items: NFTAsset[], firestoreCollectionName: string) {
  await Promise.all(
    items.map(async (item) => {
      await addNFTItem(item, firestoreCollectionName)
    })
  )
}

export async function getAdvancedOffers() {
  const offerRef = db.collection('OpenSeaPudgyPenguinsAdvancedOffers')
  const snapshot = await offerRef.get()
  const documents = {}
  snapshot.forEach((doc) => {
    documents[doc.id] = doc.data()
  })
  return documents
}

export async function removeAdvancedOffers(offers: any[]) {
  for (const offer of offers) {
    const offerRef = db.collection('OpenSeaPudgyPenguinsAdvancedOffers').doc(offer.order_hash)
    await offerRef.delete()
  }
}

export async function setAdvancedOffers(offers: any[]) {
  for (const offer of offers) {
    const offerRef = db.collection('OpenSeaPudgyPenguinsAdvancedOffers').doc(offer.order_hash)
    await offerRef.set(offer, { merge: true })
  }
}

export async function testFSConnection() {
  const ref = db.collection('testing').doc(new Date().toString())
  await ref.set({ time: new Date() + ' hello' }, { merge: true })
}
