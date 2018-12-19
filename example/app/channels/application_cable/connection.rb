module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      # Hint: this will stream everything to everyone, you'll probably end up
      #   identifying which user goes with which requests with something like:
      #
      #   User.find_by(id: request.session.fetch("user_id"))
      #
      if (verified_user = "Jim")
        verified_user
      else
        reject_unauthorized_connection
      end
    end
  end
end
