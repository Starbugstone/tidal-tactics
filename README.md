# Tidal Tactics

Steer a squad of survivors down three island evacuation routes. Every soldier runs with the formation. Its gunners open fire automatically. Numeric gates change the headcount, weapon crates change the loadout, and a mutant boss blocks each extraction zone.

## Play

[Play Tidal Tactics on GitHub Pages](https://starbugstone.github.io/tidal-tactics/)

Open `dist/index.html` in a modern mobile or desktop browser. The standalone file includes the entire campaign, illustrated terrain and sprites, fonts and recorded sound effects. All three operations are available from the briefing.

| Control | Action |
| --- | --- |
| Drag sideways | Steer the squad |
| A / D or left / right arrows | Steer with a keyboard |
| Space on the battlefield | Deploy from briefing |
| P or Escape | Pause the operation |

Choose a gate with the centre of the formation. Blue gates add survivors, green gates multiply them and red gates take them away. Shoot open a crate, then run over the floating weapon. Twin SMGs fire parallel tracers, Vulcan miniguns saturate the lane, and rockets add area damage to the minigun volleys. Bosses raise both arms before a ground strike. A red circle marks the impact zone. Impact flashes, recoil and falling characters show where a volley or stomp landed. Cleared operations, best times and mute preferences are saved in the current browser.

## Development

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

The briefing runs a simulated battle with an automatic pilot. Deploying starts a fresh fixed-step simulation. The renderer uses illustrated sprites on a perspective road with a Canvas 2D fallback. The build embeds recording credits and font licenses. [Artwork](src/art/ARTWORK.md) · [Audio sources](licenses/game-audio.md)

## Design references

The team studied the multiplier-gate and crowd sequences in Mob Control promos and the moving gun formation in a related squad-shooter promo. All artwork and level layouts were created for this project. [Reference clips](https://www.creativescope.ai/blog/multiplier-gates-history)
