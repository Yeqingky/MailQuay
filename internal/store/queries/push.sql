-- name: UpsertPushSubscription :exec
INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, sound, user_agent)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    sound = EXCLUDED.sound,
    user_agent = EXCLUDED.user_agent,
    updated_at = now();

-- name: ListPushSubscriptions :many
SELECT * FROM push_subscriptions ORDER BY created_at;

-- name: DeletePushSubscription :exec
DELETE FROM push_subscriptions WHERE endpoint = $1;
