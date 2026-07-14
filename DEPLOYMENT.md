# Cooperative server deployment

## Persistent room storage on Render

The server stores room clocks, boss health, and shared encounters in `DATA_DIR`.
For reliable recovery after a Render restart or deploy, attach a persistent disk and configure:

- Mount path: `/var/data`
- Environment variable: `DATA_DIR=/var/data`

Without a persistent disk, local restarts retain `.data/`, but Render may discard the filesystem during a replacement deploy.

## Two-device latency test

1. Deploy the latest commit and open the same HTTPS URL on two different devices.
2. Create a room on the first device and join its code from the second device.
3. Check the `CO-OP` HUD. Each device displays its own round-trip latency in milliseconds.
4. Move, jump, and start a shared animal fight while watching the other device.
5. Temporarily disable Wi-Fi or mobile data on one device, then restore it. It should automatically return to the same room.
6. Restart the server. Both devices should reconnect, with the room clock and shared battle health restored.

For a meaningful external test, use separate networks when possible, such as Wi-Fi on one device and mobile data on the other.
