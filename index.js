const ActionCable = require('actioncable')
const Backoff = require('backo2')

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
  app.ws.subscriptionCallbacks.forEach(cb =>
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
    app.ws.subscription = cable.subscriptions.create('SockemChannel', {
      connected () {
        app.ws.subscriptionConnected = true
        app.ws.callSubscriptionCallbacks()
        app.ws.schedulePendingRequests()
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
    const consumer = app.ws.subscription.consumer
    if (consumer && consumer.connection) {
      if (!consumer.connection.isActive()) {
        consumer.connection.reopen()
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
  const requestCommand = subscription => {
    subscription.perform('handle_answer', Object.assign({}, { requestId }, payload))
  }

  app.ws.subscribe(requestCommand)

  app.ws.pendingRequests[requestId] = {
    sendRequest: requestCommand,
    handleResponse: cb
  }
  app.ws.schedulePendingRequests()
}

app.ws.pendingRequestBackoff = new Backoff({ min: 3500, max: 30000 })
app.ws.sendPendingRequestsTimeoutId = null
app.ws.schedulePendingRequests = () => {
  if (Object.keys(app.ws.pendingRequests).length > 0) {
    if (!app.ws.sendPendingRequestsTimeoutId) {
      app.ws.sendPendingRequestsTimeoutId = setTimeout(() => {
        app.ws.sendPendingRequestsTimeoutId = null
        if (Object.keys(app.ws.pendingRequests).length === 0) {
          app.ws.resetBackoff()
        } else {
          app.ws.submitAllPendingRequests()
          app.ws.schedulePendingRequests()
        }
      }, app.ws.pendingRequestBackoff.duration())
    }
  }
}

app.ws.resetBackoff = () => {
  app.ws.pendingRequestBackoff.reset()
}

app.ws.submitAllPendingRequests = () => {
  Object.values(app.ws.pendingRequests).forEach(({ sendRequest }) =>
    app.ws.subscribe(sendRequest)
  )
}

app.ws.respond = (data) => {
  const requestId = data['request_id']
  delete data['request_id']
  if (app.ws.pendingRequests[requestId]) {
    app.ws.pendingRequests[requestId].handleResponse(data)
    delete app.ws.pendingRequests[requestId]
    app.ws.resetBackoff()
  }
}

module.exports = {
  subscribe: app.ws.subscribe,
  unsubscribe: app.ws.unsubscribe,
  request: app.ws.request
}
