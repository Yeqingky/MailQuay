-- +goose Up
CREATE TABLE push_subscriptions (
    id uuid PRIMARY KEY,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    sound boolean NOT NULL DEFAULT false,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON push_subscriptions (endpoint);

-- +goose Down
DROP TABLE push_subscriptions;
