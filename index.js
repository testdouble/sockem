const ActionCable = require('actioncable')
const _ = require('lodash')

// app.ws - actioncable / websocket
const app = {}
app.ws = app.ws || {}

app.ws.cable = null
app.ws.init = () => {
  app.ws.cable = app.ws.cable || ActionCable.createConsumer()
  return app.ws.cable
}

app.ws.disconnect = () => {
  if (app.ws.cable) {
    app.ws.cable.disconnect()
  }
}

app.ws.subscription = null
app.ws.subscriptionCallbacks = []
app.ws.subscriptionConnected = false

app.ws.callSubscriptionCallbacks = () => {
  _.each(app.ws.subscriptionCallbacks, cb =>
    cb(app.ws.subscription)
  )
  app.ws.subscriptionCallbacks = []
}

// I really hate this subscriptions API. Basically, I want the subscription to be
// a singleton but I don't want to leak details about how the cable API works,
// so I'm collecting all the callbacks I receive and then invoking them either
// when the subscription is connected or immediately if the subscription is
// already connected.
app.ws.subscribe = (connectionCb) => {
  if (connectionCb) app.ws.subscriptionCallbacks.push(connectionCb)
  const cable = app.ws.init()

  if (!app.ws.subscription) {
    app.ws.subscription = cable.subscriptions.create('StudyChannel', {
      connected () {
        app.ws.subscriptionConnected = true
        app.ws.callSubscriptionCallbacks()
        app.ws.sendPendingRequests()
      },
      disconnected () {
        app.ws.subscriptionConnected = false
      },
      rejected () {
        app.ws.subscriptionConnected = false
      },
      received (data) {
        app.ws.respond(data)
      }
    })
  } else if (app.ws.subscriptionConnected) {
    app.ws.callSubscriptionCallbacks()
  } else {
    app.ws.reconnect()
  }
}

app.ws.reconnect = () => {
  if (app.ws.subscription) {
    const connection = _.get(app.ws, 'subscription.consumer.connection')
    if (connection) {
      if (!connection.isActive()) {
        connection.reopen()
      }
    } else {
      app.ws.init().connect()
    }
  } else {
    app.ws.subscribe()
  }
}

app.ws.unsubscribe = () => {
  app.ws.disconnect()
  app.ws.subscriptionConnected = false
}

// A scheme by which requests sent via sockets are repeatedly retried until
// we get a response. They are ID'd so that they are handled correctly
// regardless of the order a response is received in
app.ws.requestId = 0
app.ws.pendingRequests = {}
app.ws.request = (payload, cb) => {
  const requestId = ++app.ws.requestId
  app.ws.pendingRequests[requestId] = {
    sendRequest: subscription => {
      subscription.perform('handle_answer', _.extend({ requestId }, payload))
    },
    handleResponse: cb
  }
  app.ws.sendPendingRequests()
}

app.ws.sendPendingRequestsIntervalId = null
app.ws.sendPendingRequests = () => {
  const sendAll = () => {
    _.each(app.ws.pendingRequests, ({ sendRequest }) =>
      app.ws.subscribe(sendRequest)
    )
  }
  if (_.size(app.ws.pendingRequests) > 0) {
    sendAll()
    if (!app.ws.sendPendingRequestsIntervalId) {
      app.ws.sendPendingRequestsIntervalId = setInterval(() => {
        if (_.size(app.ws.pendingRequests) === 0) {
          clearInterval(app.ws.sendPendingRequestsIntervalId)
          app.ws.sendPendingRequestsIntervalId = null
        } else {
          sendAll()
        }
      }, 3500)
    }
  }
}

app.ws.respond = (data) => {
  const requestId = data['request_id']
  delete data['request_id']
  if (app.ws.pendingRequests[requestId]) {
    app.ws.pendingRequests[requestId].handleResponse(data)
    delete app.ws.pendingRequests[requestId]
  }
}

module.exports = {
  subscribe: app.ws.subscribe,
  unsubscribe: app.ws.unsubscribe,
  request: app.ws.request
}
