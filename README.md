# Battleship Project — Dead Reckoning

A polished browser-based reimagining of Battleship with four playable modes:

- **Classic** — original 10×10 rules and the traditional 5–4–3–3–2 fleet.
- **Rogue Fleet** — a 12×12 board with connected stair-step, hooked, trident, and zig-zag ships.
- **Commander** — tactical energy, sonar, torpedoes, and area barrages.
- **Custom** — configurable grid size, fleet composition, ship count, and abilities.

Features include manual ship deployment, continuous SVG ship models, animated battle damage,
persistent player records, and peer-to-peer multiplayer invitation links.

The game runs entirely in the browser with no build step. Multiplayer uses PeerJS for WebRTC
signaling; game data travels directly between the two players after the connection is established.

## Play locally

Open `index.html` in a modern browser.

## Deployment

The site is published directly from the `gh-pages` branch.
