# sockem

**Warning: sockem is rated
[YMMV](https://dictionary.cambridge.org/us/dictionary/english/ymmv). At present,
this repo doesn't have its own automated tests or many users.**

## What?

Sockem is a library that wraps the [ActionCable](https://guides.rubyonrails.org/action_cable_overview.html) client to "dumb it down" so that it can be used for three things:

1. `sockem.subscribe()` to a single channel (`SockemChannel`) and automatically
   re-subscribe if the connection is lost for as long as the app needs it
2. Allow the user to `sockem.request(payloadObj, cb)` with some assurance that
   the request will be retried until a matching response is received and
   `cb(responseObj)` called
3. `sockem.unsubscribe()` when the channel is no longer needed

## How?

```
$ npm install sockem
```

```js
import * as sockem from 'sockem'

sockem.subscribe()

sockem.request({id: 42}, (res) => {
  document.write(res.name)
  sockem.unsubscribe()
})
```

And, to make that do something, a Ruby class in `app/channels/sockem_channel.rb`
that looks something like:

```ruby
class SockemChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_user
  end

  def handle_answer(data)
    response = {
      name: data["id"] == 42 ? "Pants" : "Not Pants",
      request_id: data["requestId"]
    }

    self.class.broadcast_to(current_user, response)
  end
end
```

You'll want to set up the above `current_user` with some scheme that matches up
the HTTP session with the channel (see:
[connection.rb](example/app/channels/application_cable/connection.rb) in the
example app)

## Why?

Sockem is an extraction from [KameSame.com](https://kamesame.com) that may help
others who want to use
[ActionCable](https://guides.rubyonrails.org/action_cable_overview.html) for use
cases that don't resemble chat rooms or push notifications. One example might be
an app that can't use HTTP2 but needs to send a lot of very small payload
requests with as little latency as possible, because they block the user
experience. To be more specific, this code is used by KameSame's client JS to
send users' flashcard answers to the server and wait (and retry) until all the
outstanding requests get a response, reconnecting as often as necessary.

## Warnings

Other than lacking a test suite or many users, keep note that this library's
retry mechanism can really go wild if your server ever starts spitting errors,
as every affected client will essentially hammer it. If anyone's interested,
adding a more sophisticated retry mechanism (like a backoff) would be an
improvement. So would a retry limit.
