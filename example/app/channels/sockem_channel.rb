class SockemChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_user
  end

  def handle_answer(data)
    response = {
      name: data["id"] == 42 ? "Pants" : "Not Pants",
      request_id: data["requestId"],
    }

    self.class.broadcast_to(current_user, response)
  end
end
