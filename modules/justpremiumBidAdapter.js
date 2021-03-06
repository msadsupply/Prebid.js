import { registerBidder } from 'src/adapters/bidderFactory'
import { getTopWindowLocation } from 'src/utils'

const BIDDER_CODE = 'justpremium'
const ENDPOINT_URL = getTopWindowLocation().protocol + '//pre.ads.justpremium.com/v/2.0/t/xhr'
const pixels = []

export const spec = {
  code: BIDDER_CODE,
  time: 60000,

  isBidRequestValid: (bid) => {
    return !!(bid && bid.params && bid.params.zone)
  },

  buildRequests: (validBidRequests) => {
    const c = preparePubCond(validBidRequests)
    const dim = getWebsiteDim()
    const payload = {
      zone: [...new Set(validBidRequests.map(b => {
        return parseInt(b.params.zone)
      }))].join(','),
      hostname: getTopWindowLocation().hostname,
      protocol: getTopWindowLocation().protocol.replace(':', ''),
      sw: dim.screenWidth,
      sh: dim.screenHeight,
      ww: dim.innerWidth,
      wh: dim.innerHeight,
      c: c,
      id: validBidRequests[0].params.zone,
      sizes: {}
    }
    validBidRequests.forEach(b => {
      const zone = b.params.zone
      const sizes = payload.sizes
      sizes[zone] = sizes[zone] || []
      sizes[zone].push.apply(sizes[zone], b.sizes)
    })
    const payloadString = JSON.stringify(payload)

    return {
      method: 'POST',
      url: ENDPOINT_URL + '?i=' + (+new Date()),
      data: payloadString,
      bids: validBidRequests
    }
  },

  interpretResponse: (serverResponse, bidRequests) => {
    const body = serverResponse.body
    let bidResponses = []
    bidRequests.bids.forEach(adUnit => {
      let bid = findBid(adUnit.params, body.bid)
      if (bid) {
        let size = (adUnit.sizes && adUnit.sizes.length && adUnit.sizes[0]) || []
        let bidResponse = {
          requestId: adUnit.bidId,
          creativeId: bid.id,
          width: size[0] || bid.width,
          height: size[1] || bid.height,
          ad: bid.adm,
          cpm: bid.price,
          netRevenue: true,
          currency: bid.currency || 'USD',
          ttl: bid.ttl || spec.time
        }
        bidResponses.push(bidResponse)
      }
    })

    return bidResponses
  },

  getUserSyncs: (syncOptions) => {
    if (syncOptions.iframeEnabled) {
      pixels.push({
        type: 'iframe',
        src: '//us-u.openx.net/w/1.0/pd?plm=10&ph=26e53f82-d199-49df-9eca-7b350c0f9646'
      })
    }
    return pixels
  }
}

function findBid (params, bids) {
  const tagId = params.zone
  if (bids[tagId]) {
    let len = bids[tagId].length
    while (len--) {
      if (passCond(params, bids[tagId][len])) {
        return bids[tagId].splice(len, 1).pop()
      }
    }
  }

  return false
}

function passCond (params, bid) {
  const format = bid.format

  if (params.allow && params.allow.length) {
    return params.allow.indexOf(format) > -1
  }

  if (params.exclude && params.exclude.length) {
    return params.exclude.indexOf(format) < 0
  }

  return true
}

function preparePubCond (bids) {
  const cond = {}
  const count = {}

  bids.forEach((bid) => {
    const params = bid.params
    const zone = params.zone

    if (cond[zone] === 1) {
      return
    }

    const allow = params.allow || params.formats || []
    const exclude = params.exclude || []

    if (allow.length === 0 && exclude.length === 0) {
      return cond[params.zone] = 1
    }

    cond[zone] = cond[zone] || [[], {}]
    cond[zone][0] = arrayUnique(cond[zone][0].concat(allow))
    exclude.forEach((e) => {
      if (!cond[zone][1][e]) {
        cond[zone][1][e] = 1
      } else {
        cond[zone][1][e]++
      }
    })

    count[zone] = count[zone] || 0
    if (exclude.length) {
      count[zone]++
    }
  })

  Object.keys(count).forEach((zone) => {
    if (cond[zone] === 1) return

    const exclude = []
    Object.keys(cond[zone][1]).forEach((format) => {
      if (cond[zone][1][format] === count[zone]) {
        exclude.push(format)
      }
    })
    cond[zone][1] = exclude
  })

  Object.keys(cond).forEach((zone) => {
    if (cond[zone] !== 1 && cond[zone][1].length) {
      cond[zone][0].forEach((r) => {
        let idx = cond[zone][1].indexOf(r)
        if (idx > -1) {
          cond[zone][1].splice(idx, 1)
        }
      })
      cond[zone][0].length = 0
    }

    if (cond[zone] !== 1 && !cond[zone][0].length && !cond[zone][1].length) {
      cond[zone] = 1
    }
  })

  return cond
}

function arrayUnique (array) {
  const a = array.concat()
  for (let i = 0; i < a.length; ++i) {
    for (let j = i + 1; j < a.length; ++j) {
      if (a[i] === a[j]) {
        a.splice(j--, 1)
      }
    }
  }

  return a
}

function getWebsiteDim () {
  let top
  try {
    top = window.top
  } catch (e) {
    top = window
  }

  return {
    screenWidth: top.screen.width,
    screenHeight: top.screen.height,
    innerWidth: top.innerWidth,
    innerHeight: top.innerHeight
  }
}

registerBidder(spec)
